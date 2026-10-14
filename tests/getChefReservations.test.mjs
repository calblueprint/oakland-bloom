import assert from "node:assert/strict";
import { test } from "node:test";
import "../scripts/registerServerTypes.mjs";

// Reserved example domain and simulated identities; no real database is contacted.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://reservations.example.invalid";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
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
const { default: getChefReservations } =
  await import("../actions/supabase/queries/getChefReservations.ts");

await test("reservation query with simulated identities and HTTP responses", async t => {
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  await t.test(
    "filters each owner, selects only required fields, and orders consistently",
    async () => {
      for (const id of ["simulated-chef-a", "simulated-chef-b"]) {
        await getChefReservations({ id });
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
    },
  );
  await t.test(
    "returns all statuses and past reservations without transforming fields",
    async () => {
      responseRows = ["pending", "approved", "denied"].map(
        (approval_status, index) => ({
          id: `simulated-booking-${index}`,
          amenity: "synthetic-test-amenity",
          start_time: "2020-01-01T10:00:00Z",
          end_time: "2020-01-01T11:00:00Z",
          num_people: 2,
          approval_status,
        }),
      );
      assert.deepEqual(
        await getChefReservations({ id: "simulated-chef-a" }),
        responseRows,
      );
    },
  );
  await t.test("returns [] for a successful empty response", async () => {
    responseRows = [];
    assert.deepEqual(
      await getChefReservations({ id: "simulated-empty-chef" }),
      [],
    );
  });
  await t.test("rejects missing identity before issuing a query", async () => {
    const count = requests.length;
    for (const user of [
      undefined,
      null,
      {},
      { id: "" },
      { id: "  " },
      { id: 42 },
    ]) {
      await assert.rejects(getChefReservations(user), /user ID is required/);
    }
    assert.equal(requests.length, count);
  });
  await t.test("surfaces database errors with the original cause", async () => {
    databaseError = true;
    await assert.rejects(
      getChefReservations({ id: "simulated-chef-a" }),
      error => {
        assert.match(error.message, /Unable to load/);
        assert.equal(error.cause.code, "42501");
        return true;
      },
    );
  });
});
