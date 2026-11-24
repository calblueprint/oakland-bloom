import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import postgres from "postgres";

const databaseUrl = process.env.BOOKING_TEST_DATABASE_URL;
const migrations = new URL("../supabase/migrations/", import.meta.url);

test("migration versions are unique", () => {
  const versions = readdirSync(migrations)
    .filter(name => /^\d+_.+\.sql$/.test(name))
    .map(name => name.split("_")[0]);
  assert.equal(new Set(versions).size, versions.length);
});

// Opt in with a local Supabase Postgres URL. The test owns a disposable database,
// never the database named in the URL or any shared application records.
test(
  "booking migrations enforce ownership, availability, and safe retries",
  { skip: !databaseUrl, timeout: 60000 },
  async t => {
    const target = new URL(databaseUrl);
    assert.ok(["postgres:", "postgresql:"].includes(target.protocol));
    assert.ok(
      ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname),
      "BOOKING_TEST_DATABASE_URL must point to local Postgres.",
    );
    const options = { max: 1, connect_timeout: 5, onnotice: () => {} };
    const admin = postgres(databaseUrl, options);
    const databaseName = `oak18_test_${randomUUID().replaceAll("-", "")}`;
    let db;
    let created = false;
    const owner = "11111111-1111-4111-a111-111111111111";
    const other = "22222222-2222-4222-a222-222222222222";
    const pending = "33333333-3333-4333-a333-333333333333";
    try {
      await admin`create database ${admin(databaseName)}`;
      created = true;
      target.pathname = `/${databaseName}`;
      db = postgres(target.toString(), options);
      await db.unsafe(`
        create schema auth;
        create function auth.uid() returns uuid language sql stable as $$
          select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
        $$;
        grant usage on schema auth, public to authenticated, anon;
        create table public.users (
          userid uuid primary key, is_admin boolean not null default false,
          is_approved boolean not null default false,
          email text not null default '', name text not null default '',
          phone text not null default ''
        );
        create table public.booking_event (
          id uuid primary key, amenity varchar(255) not null,
          "user" uuid not null references public.users(userid),
          start_time timestamptz not null, end_time timestamptz not null,
          num_people bigint not null, has_conflicts uuid[] not null,
          approval_status varchar(255) not null
        );
      `);
      await db`insert into public.users (userid, is_approved)
        values (${owner}, true), (${other}, true), (${pending}, false)`;
      for (const [i, amenity] of [
        "kitchen",
        "bar_prep_table",
        "salad_bar_table",
        "oven",
      ].entries()) {
        await db`insert into public.booking_event
          (id, amenity, "user", start_time, end_time, num_people, has_conflicts, approval_status)
          values (${`00000000-0000-4000-a000-00000000000${i}`}, ${amenity},
          ${owner}, '2020-01-01T10:00:00Z', '2020-01-01T11:00:00Z', 1, '{}', 'pending')`;
      }
      const calendarMigration = readdirSync(migrations).find(name =>
        name.endsWith("_calendar_occupied_periods.sql"),
      );
      assert.ok(calendarMigration);
      for (const filename of [
        calendarMigration,
        "20261108000000_booking_requests.sql",
      ]) {
        await db.unsafe(readFileSync(new URL(filename, migrations), "utf8"));
      }

      // Simulate the same role and JWT subject used by the public Supabase API.
      const asUser = (userId, run) =>
        db.begin(async sql => {
          await sql`set local role authenticated`;
          await sql`select set_config('request.jwt.claim.sub', ${userId ?? ""}, true)`;
          return run(sql);
        });
      const request = (sql, input) =>
        sql`select public.create_booking_request(
          ${input.id}::uuid, ${input.title ?? "Bread practice"},
          ${input.amenities ?? ["oven"]}::text[],
          ${input.start ?? "2100-05-01T10:00:00Z"}::timestamptz,
          ${input.end ?? "2100-05-01T11:00:00Z"}::timestamptz,
          2, ${["friend@example.invalid"]}::text[]) as id`;
      const denied = code => error => error.code === code;

      await t.test(
        "backfills legacy singular amenities without losing equipment",
        async () => {
          const rows =
            await db`select amenities from public.booking_event order by id`;
          assert.deepEqual(
            rows.map(row => row.amenities),
            [
              ["bar_prep_table", "salad_bar_table", "oven"],
              ["bar_prep_table"],
              ["salad_bar_table"],
              ["oven"],
            ],
          );
        },
      );

      await t.test("rejects signed-out and unapproved requests", async () => {
        for (const userId of [null, pending]) {
          await assert.rejects(
            asUser(userId, sql => request(sql, { id: randomUUID() })),
            denied("42501"),
          );
        }
        await assert.rejects(
          db.begin(async sql => {
            await sql`set local role anon`;
            return request(sql, { id: randomUUID() });
          }),
          denied("42501"),
        );
      });

      const first = { id: randomUUID() };
      const second = { id: randomUUID(), title: "Other chef" };
      await t.test(
        "fixes ownership/status, permits pending overlaps, and retries once",
        async () => {
          const [saved] = await asUser(owner, sql => request(sql, first));
          assert.equal(saved.id, first.id);
          await asUser(other, sql => request(sql, second));
          await asUser(owner, sql => request(sql, first));
          const [row] =
            await db`select "user", approval_status from public.booking_event where id=${first.id}`;
          assert.deepEqual(row, { user: owner, approval_status: "pending" });
          const [{ count }] =
            await db`select count(*)::int as count from public.booking_event where id=${first.id}`;
          assert.equal(count, 1);
          await assert.rejects(
            asUser(other, sql => request(sql, first)),
            denied("22023"),
          );
          await assert.rejects(
            asUser(owner, sql => request(sql, { ...first, title: "Changed" })),
            denied("22023"),
          );
        },
      );

      await t.test(
        "enforces own-only reads and denies direct chef writes",
        async () => {
          const rows = await asUser(
            other,
            sql => sql`select id from public.booking_event`,
          );
          assert.deepEqual(
            rows.map(row => row.id),
            [second.id],
          );
          for (const statement of [
            sql =>
              sql`update public.booking_event set approval_status='approved' where id=${second.id}`,
            sql => sql`delete from public.booking_event where id=${second.id}`,
            sql =>
              sql`insert into public.booking_event (id) values (${randomUUID()})`,
          ]) {
            await assert.rejects(asUser(other, statement), denied("42501"));
          }
        },
      );

      await t.test(
        "prevents conflicts at insertion and later approval, allows adjacent resources",
        async () => {
          await db`update public.booking_event set approval_status='approved' where id=${first.id}`;
          await assert.rejects(
            db`update public.booking_event set approval_status='approved' where id=${second.id}`,
            denied("23P01"),
          );
          await assert.rejects(
            asUser(other, sql => request(sql, { id: randomUUID() })),
            denied("23P01"),
          );
          const next = {
            id: randomUUID(),
            start: "2100-05-01T11:00:00Z",
            end: "2100-05-01T12:00:00Z",
          };
          await asUser(owner, sql => request(sql, next));
          await db`update public.booking_event set approval_status='approved' where id=${next.id}`;
          await asUser(other, sql =>
            request(sql, { id: randomUUID(), amenities: ["bar_prep_table"] }),
          );
          assert.equal(
            (await asUser(owner, sql => request(sql, first)))[0].id,
            first.id,
          );
        },
      );

      await t.test(
        "serializes concurrent approvals across separate connections",
        async () => {
          const ids = [randomUUID(), randomUUID()];
          for (const id of ids) {
            await asUser(owner, sql =>
              request(sql, {
                id,
                start: "2100-07-01T10:00:00Z",
                end: "2100-07-01T11:00:00Z",
              }),
            );
          }
          const peers = [
            postgres(target.toString(), options),
            postgres(target.toString(), options),
          ];
          let approvals;
          try {
            // Hold the global booking lock so both UPDATE statements begin before
            // either checks availability. The trigger must see the winner's commit.
            await db.begin(async sql => {
              await sql`select pg_advisory_xact_lock(180001)`;
              // Observe both promises immediately, including failure-path cleanup.
              approvals = Promise.allSettled(
                peers.map((peer, i) =>
                  peer`update public.booking_event set approval_status='approved'
                    where id=${ids[i]}`.execute(),
                ),
              );
              // Poll actual waiting locks so both statements are in flight before
              // the blocker transaction releases the booking lock.
              for (let attempt = 0; attempt < 500; attempt += 1) {
                const [{ count }] =
                  await sql`select count(*)::int as count from pg_locks
                  where locktype='advisory' and objid=180001 and not granted
                    and database=(select oid from pg_database where datname=${databaseName})`;
                if (count === 2) return;
                await new Promise(resolve => setTimeout(resolve, 10));
              }
              throw new Error(
                "Concurrent approvals did not both reach the booking lock.",
              );
            });
            const results = await approvals;
            assert.equal(
              results.filter(result => result.status === "fulfilled").length,
              1,
            );
            const [failure] = results.filter(
              result => result.status === "rejected",
            );
            assert.equal(failure.reason.code, "23P01");
            const [{ count }] =
              await db`select count(*)::int as count from public.booking_event
              where id=any(${ids}::uuid[]) and approval_status='approved'`;
            assert.equal(count, 1);
          } finally {
            // begin() has committed or rolled back before either peer is closed.
            await Promise.all(peers.map(peer => peer.end({ timeout: 1 })));
            if (approvals) await approvals;
          }
        },
      );

      await t.test(
        "merges adjacent availability and excludes all private details",
        async () => {
          const read =
            sql => sql`select * from public.get_calendar_occupied_periods(
          '2100-05-01T09:00:00Z', '2100-05-01T13:00:00Z')`;
          const rows = await asUser(other, read);
          assert.equal(rows.length, 1);
          assert.deepEqual(Object.keys(rows[0]).sort(), [
            "amenity",
            "end_time",
            "start_time",
          ]);
          assert.equal(rows[0].amenity, "oven");
          assert.equal(
            new Date(rows[0].start_time).toISOString(),
            "2100-05-01T10:00:00.000Z",
          );
          assert.equal(
            new Date(rows[0].end_time).toISOString(),
            "2100-05-01T12:00:00.000Z",
          );
          assert.deepEqual([...(await asUser(owner, read))], []);
        },
      );

      await t.test(
        "synchronizes legacy single-amenity edits and modern arrays",
        async () => {
          const id = "00000000-0000-4000-a000-000000000003";
          const [legacy] =
            await db`update public.booking_event set amenity='bar_prep_table'
          where id=${id} returning amenity, amenities`;
          assert.deepEqual(legacy, {
            amenity: "bar_prep_table",
            amenities: ["bar_prep_table"],
          });
          const [modern] =
            await db`update public.booking_event set amenities=ARRAY['oven', 'salad_bar_table']
          where id=${id} returning amenity, amenities`;
          assert.deepEqual(modern, {
            amenity: "kitchen",
            amenities: ["oven", "salad_bar_table"],
          });
        },
      );

      await t.test(
        "retries a saved past request but rejects a new past request",
        async () => {
          const saved = {
            id: randomUUID(),
            start: "2100-06-01T10:00:00Z",
            end: "2100-06-01T11:00:00Z",
          };
          await asUser(owner, sql => request(sql, saved));
          saved.start = "2020-06-01T10:00:00Z";
          saved.end = "2020-06-01T11:00:00Z";
          await db`update public.booking_event set start_time=${saved.start}, end_time=${saved.end}
          where id=${saved.id}`;
          const [retry] = await asUser(owner, sql => request(sql, saved));
          assert.equal(retry.id, saved.id);
          await assert.rejects(
            asUser(owner, sql => request(sql, { ...saved, id: randomUUID() })),
            denied("22023"),
          );
        },
      );

      await t.test(
        "legacy seed fixtures work with the migrated temporary clones",
        async () => {
          const source = readFileSync(
            new URL("../scripts/seedReservations.sql", import.meta.url),
            "utf8",
          )
            .replaceAll("public.users", "pg_temp.users")
            .replaceAll("public.booking_event", "pg_temp.booking_event")
            .replaceAll("auth.users", "pg_temp.auth_users");
          await db.begin(async sql => {
            await sql`create temporary table users (like public.users including all) on commit drop`;
            await sql`create temporary table booking_event (like public.booking_event including all) on commit drop`;
            // LIKE does not copy the trigger that supplies these legacy kitchen
            // fields. Match the defaults used by seedReservations.live.test.mjs.
            await sql`alter table pg_temp.booking_event
            alter column title set default 'Kitchen reservation',
            alter column amenities set default ARRAY['bar_prep_table', 'salad_bar_table', 'oven']::text[]`;
            await sql`create temporary table auth_users (id uuid, email text) on commit drop`;
            await sql`insert into pg_temp.auth_users values
            (${owner}, 'one@example.invalid'), (${other}, 'two@example.invalid')`;
            await sql`select set_config('oak10.user1', ${owner}, true),
            set_config('oak10.user2', ${other}, true)`;
            await sql.unsafe(source).simple();
            await sql`drop table oak10_seed_users, oak10_seed_bookings`;
            await sql.unsafe(source).simple();
            const [{ count }] = await sql`select count(*)::int as count
            from pg_temp.booking_event where title='Kitchen reservation'
              and amenities=ARRAY['bar_prep_table', 'salad_bar_table', 'oven']::text[]`;
            assert.equal(count, 5);
          });
        },
      );
    } finally {
      if (db) await db.end({ timeout: 5 });
      try {
        if (created)
          await admin`drop database ${admin(databaseName)} with (force)`;
      } finally {
        await admin.end({ timeout: 5 });
      }
    }
  },
);
