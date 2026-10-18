// Opt-in real Auth + Next.js + PostgreSQL tests. No records/policies are modified.
// Real credentials stay in ignored .env.local; cookies stay in memory.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { test } from "node:test";
import { createServerClient } from "@supabase/ssr";
import postgres from "postgres";
import {
  expectedReservations,
  reservationTestUserId,
  secondExpectedReservations,
  secondReservationTestUserId,
} from "./fixtures/reservationCases.mjs";

const envFile = new URL("../.env.local", import.meta.url);
if (existsSync(envFile)) loadEnvFile(envFile);

function normalize(row) {
  return {
    id: row.id,
    amenity: row.amenity,
    start_time: new Date(row.start_time).toISOString(),
    end_time: new Date(row.end_time).toISOString(),
    num_people: Number(row.num_people),
    approval_status: row.approval_status,
  };
}

await test(
  "real two-chef reservation isolation",
  {
    skip: process.env.RUN_RESERVATION_LIVE_TESTS !== "1",
    timeout: 90000,
  },
  async t => {
    const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const apiKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    assert.ok(
      apiUrl && apiKey && process.env.SEED_DATABASE_URL,
      "Configure public API and seed database settings locally.",
    );
    const accounts = [
      {
        label: "Chef 1",
        id: process.env.RESERVATION_TEST_USER_ID,
        fixtureId: reservationTestUserId,
        email: process.env.RESERVATION_TEST_EMAIL,
        password: process.env.RESERVATION_TEST_PASSWORD,
        expected: expectedReservations,
      },
      {
        label: "Chef 2",
        id: process.env.RESERVATION_TEST_USER2_ID,
        fixtureId: secondReservationTestUserId,
        email: process.env.RESERVATION_TEST_USER2_EMAIL,
        password: process.env.RESERVATION_TEST_USER2_PASSWORD,
        expected: secondExpectedReservations,
      },
    ];
    for (const account of accounts) {
      assert.ok(
        account.id && account.email && account.password,
        `Configure ${account.label}'s login in .env.local.`,
      );
      assert.equal(
        account.id,
        account.fixtureId,
        "Use the same test IDs as the checked-in seed fixtures.",
      );
      assert.ok(
        account.expected.length > 0,
        "Both owners must have bookings for meaningful isolation tests.",
      );
    }
    assert.notEqual(accounts[0].id, accounts[1].id);
    const appUrl = new URL(
      process.env.RESERVATION_TEST_APP_URL || "http://127.0.0.1:3000",
    );
    assert.ok(
      ["127.0.0.1", "localhost", "[::1]"].includes(appUrl.hostname),
      "Send login cookies only to the local app.",
    );
    const endpoint = new URL("/api/dev/reservations", appUrl);
    const db = postgres(process.env.SEED_DATABASE_URL, {
      max: 1,
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
      connect_timeout: 10,
      connection: { statement_timeout: 15000 },
    });
    const sessions = [];
    t.after(async () => {
      await Promise.allSettled(
        sessions.map(({ client }) => client.auth.signOut({ scope: "local" })),
      );
      sessions.forEach(({ jar }) => jar.clear());
      await db.end({ timeout: 5 });
    });

    // Establish that both data sets exist before any negative-access assertions.
    for (const account of accounts) {
      const stored = await db`
      select id, amenity, start_time, end_time, num_people::text, approval_status
      from public.booking_event where "user" = ${account.id}::uuid
      order by start_time, id`;
      const profiles =
        await db`select exists(select 1 from public.users where userid = ${account.id}::uuid) as present`;
      assert.ok(
        profiles[0].present,
        "Run the seed to create both application profiles.",
      );
      assert.deepEqual(
        stored.map(normalize),
        account.expected,
        "Run the seed: both owners' exact fixtures must exist.",
      );
    }
    t.diagnostic(
      "Independent database check: Chef 1 owns 4 fixtures; Chef 2 owns 1.",
    );

    await t.test("signed-out request is rejected", async () => {
      const response = await fetch(endpoint, { redirect: "manual" });
      assert.equal(
        response.status,
        401,
        "Start Next.js with RESERVATION_LIVE_TEST_ENABLED=1.",
      );
    });

    for (const account of accounts) {
      const other = accounts.find(candidate => candidate.id !== account.id);
      await t.test(
        `${account.label}: verified login and owner-only access`,
        async chefTest => {
          const jar = new Map();
          const client = createServerClient(apiUrl, apiKey, {
            cookies: {
              getAll: () => [...jar].map(([name, value]) => ({ name, value })),
              setAll: cookies => {
                for (const { name, value, options } of cookies) {
                  if (options.maxAge === 0) jar.delete(name);
                  else jar.set(name, value);
                }
              },
            },
          });
          sessions.push({ client, jar });
          const login = await client.auth.signInWithPassword({
            email: account.email,
            password: account.password,
          });
          const loginErrorCode = /^[a-z0-9_]+$/.test(login.error?.code ?? "")
            ? login.error.code
            : "unavailable";
          assert.ok(
            !login.error,
            `${account.label} login failed (${loginErrorCode}); verify confirmation/local credentials.`,
          );
          assert.equal(login.data.user?.id, account.id);
          const verified = await client.auth.getUser();
          assert.ok(!verified.error, "Auth user verification failed.");
          assert.equal(verified.data.user?.id, account.id);
          assert.ok(jar.size > 0, "Sign-in did not create session cookies.");
          const headers = {
            Cookie: [...jar]
              .map(([name, value]) => `${name}=${value}`)
              .join("; "),
          };
          const response = await fetch(endpoint, {
            headers,
            redirect: "manual",
          });
          assert.equal(
            response.status,
            200,
            "The real Next.js function request failed.",
          );
          const result = await response.json();
          assert.equal(result.authenticatedUserId, account.id);
          assert.deepEqual(
            result.reservations.map(normalize),
            account.expected,
            "The function did not return exactly this chef's own fixtures in order.",
          );
          for (const row of result.reservations) {
            assert.deepEqual(
              Object.keys(row).sort(),
              Object.keys(account.expected[0]).sort(),
            );
          }
          chefTest.diagnostic(
            `Real login/current-user verification passed; function returned ${result.reservations.length} owned reservation(s).`,
          );

          await chefTest.test(
            "direct unfiltered API query returns only owned bookings",
            async () => {
              // No function-side ownership filter: this directly tests database RLS.
              const { data, error } = await client
                .from("booking_event")
                .select("id")
                .order("id");
              assert.ok(!error, "The unfiltered authenticated read failed.");
              assert.deepEqual(
                data.map(row => row.id),
                account.expected.map(row => row.id).sort(),
              );
            },
          );
          await chefTest.test(
            "explicit query for the other chef returns no rows",
            async () => {
              const { data, error } = await client
                .from("booking_event")
                .select("id")
                .eq("user", other.id);
              assert.ok(
                !error,
                "Cross-owner query errored; no isolation success is claimed.",
              );
              assert.deepEqual(data, []);
            },
          );
          await chefTest.test(
            "knowing the other chef's booking IDs grants no access",
            async () => {
              const { data, error } = await client
                .from("booking_event")
                .select("id")
                .in(
                  "id",
                  other.expected.map(row => row.id),
                );
              assert.ok(!error, "Direct booking-ID query errored.");
              assert.deepEqual(data, []);
            },
          );
          await chefTest.test(
            "URL-supplied owner cannot override verified identity",
            async () => {
              const spoofedUrl = new URL(endpoint);
              spoofedUrl.searchParams.set("user", other.id);
              const spoofedResponse = await fetch(spoofedUrl, {
                headers,
                redirect: "manual",
              });
              assert.equal(spoofedResponse.status, 200);
              const spoofedResult = await spoofedResponse.json();
              assert.equal(spoofedResult.authenticatedUserId, account.id);
              assert.deepEqual(
                spoofedResult.reservations.map(normalize),
                account.expected,
              );
            },
          );
        },
      );
    }
  },
);
