import "./support/registerServerTypes.mjs";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { authState } from "./fixtures/reservationAuth.mjs";
import {
  expectedReservations,
  reservationTestUserId,
  secondExpectedReservations,
  secondReservationTestUserId,
} from "./fixtures/reservationCases.mjs";

// Simulate only verified identity/session helpers; exercise the real query builder.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      ["@/lib/supabase/getUser", "@/lib/supabase/server"].includes(specifier)
    ) {
      return {
        url: new URL("./fixtures/reservationAuth.mjs", import.meta.url).href,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

const { default: getChefReservations } =
  await import("../actions/supabase/queries/getChefReservations.ts");
let responseRows = [];
let databaseError = false;
const requests = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async input => {
  const url = new URL(
    typeof input === "string" ? input : (input.url ?? input.toString()),
  );
  assert.equal(url.hostname, "reservations.example.invalid");
  requests.push(url);
  return new Response(
    JSON.stringify(
      databaseError
        ? { message: "permission denied", code: "42501" }
        : responseRows,
    ),
    {
      status: databaseError ? 403 : 200,
      headers: { "Content-Type": "application/json" },
    },
  );
};
authState.client = createClient(
  "https://reservations.example.invalid",
  "test-publishable-key",
);

await test("reservation query using simulated verified sessions", async t => {
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  await t.test(
    "filters by the auth helper's identity, selects only required fields, and orders consistently",
    async () => {
      for (const id of [reservationTestUserId, secondReservationTestUserId]) {
        authState.user = { id };
        await getChefReservations();
        const url = requests.at(-1);
        assert.equal(url.pathname, "/rest/v1/booking_event");
        assert.equal(url.searchParams.get("user"), `eq.${id}`);
        assert.equal(
          url.searchParams.get("select"),
          "id,amenity,start_time,end_time,num_people,approval_status",
        );
        assert.equal(url.searchParams.get("order"), "start_time.asc,id.asc");
        assert.deepEqual([...url.searchParams.keys()].sort(), [
          "order",
          "select",
          "user",
        ]);
      }
      assert.equal(authState.clientCalls, 2);
    },
  );
  await t.test(
    "caller-supplied identity cannot replace the verified identity",
    async () => {
      authState.user = { id: reservationTestUserId };
      // JavaScript can pass extra arguments; the no-argument API ignores them.
      await getChefReservations({ id: "another-chef" });
      assert.equal(
        requests.at(-1).searchParams.get("user"),
        `eq.${reservationTestUserId}`,
      );
    },
  );
  await t.test("returns all statuses and past reservations", async () => {
    authState.user = { id: reservationTestUserId };
    responseRows = expectedReservations;
    assert.deepEqual(await getChefReservations(), responseRows);
  });
  await t.test(
    "switching verified users requests only the second chef's fixtures",
    async () => {
      authState.user = { id: secondReservationTestUserId };
      responseRows = secondExpectedReservations;
      assert.deepEqual(await getChefReservations(), secondExpectedReservations);
      assert.equal(
        requests.at(-1).searchParams.get("user"),
        `eq.${secondReservationTestUserId}`,
      );
    },
  );
  await t.test("returns [] for a successful empty response", async () => {
    responseRows = [];
    assert.deepEqual(await getChefReservations(), []);
  });
  await t.test(
    "rejects absent signed-in identity before requesting a database client",
    async () => {
      const requestCount = requests.length;
      const clientCount = authState.clientCalls;
      for (const user of [undefined, null]) {
        authState.user = user;
        await assert.rejects(getChefReservations(), /Sign in/);
      }
      assert.equal(requests.length, requestCount);
      assert.equal(authState.clientCalls, clientCount);
    },
  );
  await t.test(
    "propagates auth-helper failures without querying bookings",
    async () => {
      const count = requests.length;
      authState.error = new Error("Simulated auth failure");
      await assert.rejects(
        getChefReservations(),
        error => error === authState.error,
      );
      assert.equal(requests.length, count);
      authState.error = null;
    },
  );
  await t.test("surfaces database errors with their cause", async () => {
    authState.user = { id: reservationTestUserId };
    databaseError = true;
    await assert.rejects(getChefReservations(), error => {
      assert.match(error.message, /Unable to load/);
      assert.equal(error.cause.code, "42501");
      return true;
    });
  });
});
