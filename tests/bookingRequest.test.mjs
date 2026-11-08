import assert from "node:assert/strict";
import { test } from "node:test";
import { validateBookingRequest } from "../lib/bookingRequest.ts";
import {
  calendarDateRangeLabel,
  fromLocalInput,
  toLocalInput,
} from "../lib/calendarTime.ts";

const valid = {
  requestId: "33333333-3333-4333-a333-333333333333",
  title: "  Bread practice  ",
  amenities: ["oven", "bar_prep_table", "oven"],
  start: "2030-07-10T10:00:00-07:00",
  end: "2030-07-10T11:00:00-07:00",
  numPeople: 2,
  additionalContacts: [" OTHER@example.com ", "other@example.com"],
};

test("normalizes a multiple-amenity request and deduplicates contacts", () => {
  const result = validateBookingRequest(valid);
  assert.equal(result.data.title, "Bread practice");
  assert.deepEqual(result.data.amenities, ["bar_prep_table", "oven"]);
  assert.deepEqual(result.data.additionalContacts, ["other@example.com"]);
});

test("rejects missing, unknown, or invalid form values at the server boundary", () => {
  for (const change of [
    { title: " " },
    { title: "a".repeat(121) },
    { amenities: [] },
    { amenities: ["kitchen"] },
    { amenities: [null] },
    { numPeople: 0 },
    { numPeople: 1.5 },
    { numPeople: "2" },
    { additionalContacts: ["not-an-email"] },
    { additionalContacts: [null] },
    { requestId: "not-a-uuid" },
  ])
    assert.ok(validateBookingRequest({ ...valid, ...change }).errors);
  assert.ok(validateBookingRequest(null).errors);
});

test("requires ordered instants with offsets and a bounded range", () => {
  for (const change of [
    { end: valid.start },
    { start: "2030-07-10T10:00:00" },
    { end: "2030-10-10T10:00:00Z" },
    { start: "bad-dateZ" },
  ])
    assert.ok(validateBookingRequest({ ...valid, ...change }).errors.time);
});

test("Los Angeles form times preserve winter and summer offsets", () => {
  assert.equal(fromLocalInput("2030-01-10T10:00"), "2030-01-10T18:00:00Z");
  assert.equal(fromLocalInput("2030-07-10T10:00"), "2030-07-10T17:00:00Z");
  assert.equal(toLocalInput("2030-07-10T17:00:00Z"), "2030-07-10T10:00");
});

test("rejects nonexistent and ambiguous Los Angeles daylight-saving times", () => {
  assert.throws(() => fromLocalInput("2026-03-08T02:30"));
  assert.throws(() => fromLocalInput("2026-11-01T01:30"));
});

test("date labels use the kitchen day even across UTC midnight", () => {
  assert.equal(
    calendarDateRangeLabel("2030-01-10T23:30:00Z", "2030-01-11T00:30:00Z"),
    "Thu, Jan 10, 2030",
  );
});

test("overnight and multi-day labels include both Los Angeles dates", () => {
  assert.equal(
    calendarDateRangeLabel("2030-01-11T07:30:00Z", "2030-01-11T08:30:00Z"),
    "Thu, Jan 10, 2030 – Fri, Jan 11, 2030",
  );
  assert.equal(
    calendarDateRangeLabel(
      "2030-07-10T23:30:00-07:00",
      "2030-07-12T00:30:00-07:00",
    ),
    "Wed, Jul 10, 2030 – Fri, Jul 12, 2030",
  );
});

test("availability shading counts free amenities without exposing booking details", async () => {
  const { availabilityEvents } = await import("../lib/calendarAvailability.ts");
  const own = [
    {
      id: "own-private-id",
      title: "Private title",
      amenities: ["bar_prep_table"],
      approval_status: "approved",
      start_time: "2030-01-10T10:30:00-08:00",
      end_time: "2030-01-10T11:30:00-08:00",
    },
  ];
  const occupied = [
    {
      amenity: "oven",
      start_time: "2030-01-10T10:00:00-08:00",
      end_time: "2030-01-10T11:00:00-08:00",
    },
  ];
  const events = availabilityEvents(
    "2030-01-10T00:00:00-08:00",
    "2030-01-11T00:00:00-08:00",
    ["oven", "bar_prep_table", "salad_bar_table"],
    own,
    occupied,
  );
  assert.equal(events.length, 18);
  assert.equal(events[2].extendedProps.free, 2);
  assert.equal(events[3].extendedProps.free, 1);
  assert.equal(events[5].extendedProps.free, 3);
  assert.equal(JSON.stringify(events).includes("Private title"), false);
  assert.equal(JSON.stringify(events).includes("own-private-id"), false);
});

test("availability has no shading before amenity selection and pending requests do not block", async () => {
  const { availabilityEvents } = await import("../lib/calendarAvailability.ts");
  assert.deepEqual(
    availabilityEvents(
      "2030-01-10T00:00:00Z",
      "2030-01-11T00:00:00Z",
      [],
      [],
      [],
    ),
    [],
  );
  const own = [
    {
      amenities: ["oven"],
      approval_status: "pending",
      start_time: "2030-01-10T09:00:00-08:00",
      end_time: "2030-01-10T18:00:00-08:00",
    },
  ];
  const events = availabilityEvents(
    "2030-01-10T00:00:00-08:00",
    "2030-01-11T00:00:00-08:00",
    ["oven"],
    own,
    [],
  );
  assert.ok(events.every(event => event.extendedProps.free === 1));
});
