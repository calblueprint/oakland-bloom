// Opt-in PostgreSQL regression test. Only temporary tables are written.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { test } from "node:test";
import postgres from "postgres";

const envFile = new URL("../.env.local", import.meta.url);
if (existsSync(envFile)) loadEnvFile(envFile);

await test(
  "seed SQL supports configurable users and reruns with unrelated bookings",
  {
    skip: !process.argv.includes("--live"),
    timeout: 60000,
  },
  async () => {
    assert.ok(process.env.SEED_DATABASE_URL, "Configure SEED_DATABASE_URL.");
    const db = postgres(process.env.SEED_DATABASE_URL, {
      max: 1,
      ssl: {
        rejectUnauthorized: true,
        ca: readFileSync(
          process.env.SEED_DATABASE_CA_FILE
            ? resolve(process.env.SEED_DATABASE_CA_FILE)
            : new URL(
                "../scripts/certs/supabase-prod-ca-2021.crt",
                import.meta.url,
              ),
          "utf8",
        ),
      },
      connect_timeout: 10,
      connection: { statement_timeout: 15000, lock_timeout: 5000 },
      onnotice: () => {},
    });
    // Redirect fixture SQL to temporary copies of the real table definitions.
    // Persistent tables and Auth accounts are never modified.
    const source = readFileSync(
      new URL("../scripts/seedReservations.sql", import.meta.url),
      "utf8",
    )
      .replaceAll("public.users", "pg_temp.users")
      .replaceAll("public.booking_event", "pg_temp.booking_event")
      .replaceAll("auth.users", "pg_temp.auth_users");
    const user1 = "11111111-1111-4111-a111-111111111111";
    const user2 = "22222222-2222-4222-a222-222222222222";
    try {
      await db.begin(async sql => {
        await sql`create temporary table users (like public.users including all) on commit drop`;
        await sql`create temporary table booking_event (like public.booking_event including all) on commit drop`;
        await sql`create temporary table auth_users (id uuid, email text) on commit drop`;
        await sql`insert into auth_users values (${user1}::uuid, 'one@example.invalid'), (${user2}::uuid, 'two@example.invalid')`;
        await sql`select set_config('oak10.user1', ${user1}, true), set_config('oak10.user2', ${user2}, true)`;
        await sql.unsafe(source).simple();
        const owners =
          await sql`select "user", count(*)::int as count from pg_temp.booking_event group by "user" order by "user"`;
        assert.deepEqual(
          [...owners],
          [
            { user: user1, count: 4 },
            { user: user2, count: 1 },
          ],
        );
        await sql`insert into pg_temp.booking_event (id, amenity, "user", start_time, end_time, num_people, has_conflicts, approval_status) select '0a100000-0000-4000-a000-000000000099'::uuid, amenity, "user", start_time, end_time, num_people, has_conflicts, approval_status from pg_temp.booking_event limit 1`;
        await sql`drop table oak10_seed_users, oak10_seed_bookings`;
        await sql.unsafe(source).simple();
        const [counts] =
          await sql`select count(*)::int as count from pg_temp.booking_event`;
        assert.equal(
          counts.count,
          6,
          "Rerun must preserve the unrelated booking without duplicating fixtures.",
        );
        await sql`drop table oak10_seed_users, oak10_seed_bookings`;
        await sql`update pg_temp.booking_event set num_people = num_people + 1 where id = '0a100000-0000-4000-a000-000000000001'`;
        await assert.rejects(
          sql.savepoint(async tx => {
            await tx.unsafe(source).simple();
          }),
          /booking collision/,
        );
      });
    } finally {
      await db.end({ timeout: 5 });
    }
  },
);
