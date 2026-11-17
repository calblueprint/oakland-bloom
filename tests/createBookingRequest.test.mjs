import "./support/registerServerTypes.mjs";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

const request = {
  requestId: "33333333-3333-4333-a333-333333333333",
  title: "Bread practice",
  amenities: ["oven"],
  start: "2035-07-10T17:00:00Z",
  end: "2035-07-10T18:00:00Z",
  numPeople: 2,
  additionalContacts: [],
};
const state = {
  account: { isAdmin: false, status: "approved" },
  response: { data: request.requestId, error: null },
  calls: [],
  paths: [],
};
globalThis.bookingActionTest = state;

// Replace the session/database boundary; no credentials or real network calls.
const mocks = {
  "@/lib/auth/account":
    "export async function getAccount() { return globalThis.bookingActionTest.account; }",
  "@/lib/supabase/server": `export async function getSupabaseServerClient() {
    return { rpc: async (name, args) => {
      globalThis.bookingActionTest.calls.push({ name, args });
      return globalThis.bookingActionTest.response;
    }};
  }`,
  "next/cache":
    "export function revalidatePath(path) { globalThis.bookingActionTest.paths.push(path); }",
  "@/actions/supabase/queries/getCalendarReservations": `export default async function getCalendarReservations() {
    return [{ id: '${request.requestId}', amenities: ['oven'], approval_status: 'approved',
      start_time: '${request.start}', end_time: '${request.end}' }];
  }`,
  "@/actions/supabase/queries/getOccupiedPeriods":
    "export default async function getOccupiedPeriods() { return []; }",
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier in mocks)
      return {
        url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`,
        shortCircuit: true,
      };
    if (specifier.startsWith("@/lib/"))
      return {
        url: new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href,
        shortCircuit: true,
      };
    return nextResolve(specifier, context);
  },
});
const { createBookingRequest } =
  await import("../actions/reservations/createBookingRequest.ts");

test("booking action delegates atomic availability and retries to the database", async t => {
  t.beforeEach(() => {
    state.account = { isAdmin: false, status: "approved" };
    state.response = { data: request.requestId, error: null };
    state.calls.length = 0;
    state.paths.length = 0;
  });
  await t.test(
    "retries an already approved request without a self-conflict",
    async () => {
      assert.deepEqual(await createBookingRequest(request), {
        id: request.requestId,
      });
      assert.equal(state.calls[0].name, "create_booking_request");
      assert.equal(state.calls[0].args.p_id, request.requestId);
      assert.deepEqual(state.paths, ["/calendar", "/chef/reservations"]);
    },
  );
  await t.test(
    "lets the database recognize a saved request after its start time",
    async () => {
      assert.deepEqual(
        await createBookingRequest({
          ...request,
          start: "2020-07-10T17:00:00Z",
          end: "2020-07-10T18:00:00Z",
        }),
        { id: request.requestId },
      );
      assert.equal(state.calls.length, 1);
    },
  );
  await t.test(
    "rejects unapproved users and malformed input before writing",
    async () => {
      state.account = { isAdmin: false, status: "pending" };
      assert.ok((await createBookingRequest(request)).error);
      state.account = null;
      assert.ok((await createBookingRequest(request)).error);
      state.account = { isAdmin: false, status: "approved" };
      assert.ok(
        (await createBookingRequest({ ...request, amenities: ["unknown"] }))
          .fields.amenities,
      );
      assert.equal(state.calls.length, 0);
    },
  );
  await t.test(
    "reports authoritative conflicts and never revalidates on failure",
    async () => {
      state.response = { data: null, error: { code: "23P01" } };
      assert.match(
        (await createBookingRequest(request)).error,
        /Availability changed/,
      );
      assert.deepEqual(state.paths, []);
    },
  );
});
