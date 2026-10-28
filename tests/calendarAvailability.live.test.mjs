// Opt-in privacy regression: synthetic accounts and temporary SQL tables only.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { test } from "node:test";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

await test(
  "anonymous occupied periods preserve booking privacy",
  {
    skip: !process.argv.includes("--live"),
    timeout: 60000,
  },
  async () => {
    loadEnvFile(new URL("../.env.local", import.meta.url));
    const migration = readFileSync(
      new URL(
        "../supabase/migrations/20261028000000_calendar_occupied_periods.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const temporaryFunction = migration
      .split("revoke all on function")[0]
      .replaceAll(
        "public.get_calendar_occupied_periods",
        "pg_temp.test_occupied",
      )
      .replaceAll("public.booking_event", "pg_temp.booking_event");
    const db = postgres(process.env.SEED_DATABASE_URL, {
      max: 1,
      connect_timeout: 10,
      ssl: {
        rejectUnauthorized: true,
        ca: readFileSync(
          new URL(
            "../scripts/certs/supabase-prod-ca-2021.crt",
            import.meta.url,
          ),
          "utf8",
        ),
      },
    });
    const user1 = process.env.RESERVATION_TEST_USER_ID;
    const user2 = process.env.RESERVATION_TEST_USER2_ID;
    try {
      await db.begin(async sql => {
        await sql`create temporary table booking_event (like public.booking_event including all) on commit drop`;
        for (const [index, owner, start, end, status] of [
          [1, user1, 9, 10, "approved"],
          [2, user2, 11, 12, "approved"],
          [3, user2, 11.5, 13, "approved"],
          [4, user2, 13, 14, "approved"],
          [5, user2, 15, 16, "pending"],
          [6, user2, 16, 17, "denied"],
        ]) {
          const startTime = new Date(
            Date.UTC(2035, 0, 8) + start * 3600000,
          ).toISOString();
          const endTime = new Date(
            Date.UTC(2035, 0, 8) + end * 3600000,
          ).toISOString();
          const id = `ca100000-0000-4000-a000-${String(index).padStart(12, "0")}`;
          await sql`insert into pg_temp.booking_event (id, amenity, "user", start_time, end_time, num_people, has_conflicts, approval_status)
          values (${id}::uuid, 'kitchen', ${owner}::uuid, ${startTime}::timestamptz, ${endTime}::timestamptz, 2, '{}', ${status})`;
        }
        await sql.unsafe(temporaryFunction).simple();
        await sql`select set_config('request.jwt.claim.sub', ${user1}, true)`;
        const periods =
          await sql`select * from pg_temp.test_occupied('2035-01-08T00:00:00Z', '2035-01-09T00:00:00Z')`;
        assert.equal(
          periods.length,
          1,
          "Overlapping and adjacent approved bookings merge; own/pending/denied bookings excluded.",
        );
        assert.deepEqual(Object.keys(periods[0]).sort(), [
          "amenity",
          "end_time",
          "start_time",
        ]);
        assert.equal(
          periods[0].start_time.toISOString(),
          "2035-01-08T11:00:00.000Z",
        );
        assert.equal(
          periods[0].end_time.toISOString(),
          "2035-01-08T14:00:00.000Z",
        );
        const [clipped] =
          await sql`select * from pg_temp.test_occupied('2035-01-08T12:00:00Z', '2035-01-08T13:00:00Z')`;
        assert.equal(
          clipped.start_time.toISOString(),
          "2035-01-08T12:00:00.000Z",
        );
        assert.equal(
          clipped.end_time.toISOString(),
          "2035-01-08T13:00:00.000Z",
        );
        await assert.rejects(
          sql.savepoint(
            tx =>
              tx`select * from pg_temp.test_occupied('2035-01-01', '2036-01-01')`,
          ),
          /Invalid calendar range/,
        );
        await sql`select set_config('request.jwt.claim.sub', '', true)`;
        await assert.rejects(
          sql.savepoint(
            tx =>
              tx`select * from pg_temp.test_occupied('2035-01-08', '2035-01-09')`,
          ),
          /Sign in required/,
        );
      });
      const [week] =
        await db`select date_trunc('week', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles' as start,
      (date_trunc('week', now() at time zone 'America/Los_Angeles') + interval '1 week') at time zone 'America/Los_Angeles' as "end"`;
      const args = {
        p_start: week.start.toISOString(),
        p_end: week.end.toISOString(),
      };
      const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const apiKey =
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const makeClient = () =>
        createClient(apiUrl, apiKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
      const anonymous = makeClient();
      const anonResult = await anonymous.rpc(
        "get_calendar_occupied_periods",
        args,
      );
      assert.ok(
        anonResult.error,
        "Signed-out clients must not read availability.",
      );
      const privacyFailures = [];
      for (const [prefix, ownId, otherId] of [
        ["RESERVATION_TEST", user1, user2],
        ["RESERVATION_TEST_USER2", user2, user1],
      ]) {
        const jar = new Map();
        const client = createServerClient(apiUrl, apiKey, {
          cookies: {
            getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
            setAll: cookies =>
              cookies.forEach(({ name, value }) => jar.set(name, value)),
          },
        });
        const login = await client.auth.signInWithPassword({
          email: process.env[`${prefix}_EMAIL`],
          password: process.env[`${prefix}_PASSWORD`],
        });
        assert.ok(!login.error, "Synthetic account login must succeed.");
        try {
          const { data, error } = await client.rpc(
            "get_calendar_occupied_periods",
            args,
          );
          assert.ok(
            !error,
            `Occupied-period RPC failed (${error?.code ?? "unknown"}).`,
          );
          assert.ok(
            data.length > 0,
            "Current-week seed should include another chef's approved occupied period.",
          );
          for (const row of data)
            assert.deepEqual(Object.keys(row).sort(), [
              "amenity",
              "end_time",
              "start_time",
            ]);
          const appUrl = new URL(
            process.env.RESERVATION_TEST_APP_URL || "http://localhost:3000",
          );
          assert.ok(
            ["localhost", "127.0.0.1", "[::1]"].includes(appUrl.hostname),
            "Test cookies stay on loopback.",
          );
          const route = new URL("/api/calendar/occupied", appUrl);
          route.searchParams.set("start", args.p_start);
          route.searchParams.set("end", args.p_end);
          const response = await fetch(route, {
            headers: {
              cookie: Array.from(
                jar,
                ([name, value]) => `${name}=${value}`,
              ).join("; "),
            },
          });
          assert.equal(response.status, 200);
          assert.equal(
            response.headers.get("cache-control"),
            "private, no-store",
          );
          assert.deepEqual(await response.json(), data);
          const direct = await client
            .from("booking_event")
            .select("id")
            .eq("user", otherId);
          assert.ok(!direct.error);
          if (direct.data.length > 0) privacyFailures.push(prefix);
          assert.equal(login.data.user.id, ownId);
        } finally {
          await client.auth.signOut({ scope: "local" });
        }
      }
      assert.deepEqual(
        privacyFailures,
        [],
        "Underlying booking records must remain private for both chefs. Review booking_event RLS.",
      );
    } finally {
      await db.end({ timeout: 5 });
    }
  },
);
