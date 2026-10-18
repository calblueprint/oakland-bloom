import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarConflicts } from "../lib/calendarConflicts.ts";
import bookings from "./fixtures/bookings.json" with { type: "json" };

const [firstBooking, secondBooking] = bookings;

for (const { name, start, end } of [
  { name: "identical interval", start: "13:00", end: "14:00" },
  { name: "partial overlap at the start", start: "12:30", end: "13:30" },
  { name: "partial overlap at the end", start: "13:30", end: "14:30" },
  { name: "request inside a booking", start: "13:15", end: "13:45" },
  { name: "request containing a booking", start: "12:00", end: "15:00" },
]) {
  test(`detects ${name}`, () => {
    assert.deepEqual(
      calendarConflicts(
        "kitchen",
        new Date(`2026-10-12T${start}:00-07:00`),
        new Date(`2026-10-12T${end}:00-07:00`),
        [firstBooking],
      ),
      [firstBooking.id],
    );
  });
}

test("allows adjacent and separated intervals on either side", () => {
  for (const [start, end] of [
    ["12:00", "13:00"],
    ["14:00", "15:00"],
    ["10:00", "11:00"],
    ["16:00", "17:00"],
  ]) {
    assert.deepEqual(
      calendarConflicts(
        "kitchen",
        new Date(`2026-10-12T${start}:00-07:00`),
        new Date(`2026-10-12T${end}:00-07:00`),
        [firstBooking],
      ),
      [],
    );
  }
});

test("returns all matching IDs while excluding other amenities and pending bookings", () => {
  assert.deepEqual(
    calendarConflicts(
      "kitchen",
      new Date("2026-10-12T13:30:00-07:00"),
      new Date("2026-10-12T14:30:00-07:00"),
      bookings,
    ),
    [firstBooking.id, secondBooking.id],
  );
});

test("excludes every non-approved status", () => {
  for (const approval_status of ["pending", "rejected", "cancelled"]) {
    assert.deepEqual(
      calendarConflicts(
        "kitchen",
        new Date(firstBooking.start_time),
        new Date(firstBooking.end_time),
        [{ ...firstBooking, approval_status }],
      ),
      [],
    );
  }
});

test("ignores the current booking without hiding other conflicts", () => {
  assert.deepEqual(
    calendarConflicts(
      "kitchen",
      new Date("2026-10-12T13:30:00-07:00"),
      new Date("2026-10-12T14:30:00-07:00"),
      bookings,
      firstBooking.id,
    ),
    [secondBooking.id],
  );
});

test("compares actual instants across timezone offsets", () => {
  assert.deepEqual(
    calendarConflicts(
      "kitchen",
      new Date("2026-10-12T20:15:00Z"),
      new Date("2026-10-12T20:45:00Z"),
      bookings,
    ),
    [firstBooking.id],
  );
});

test("returns no conflicts for an empty list", () => {
  assert.deepEqual(
    calendarConflicts(
      "kitchen",
      new Date(firstBooking.start_time),
      new Date(firstBooking.end_time),
      [],
    ),
    [],
  );
});

test("rejects invalid timestamps, equal endpoints, and reversed intervals", () => {
  for (const [start, end] of [
    ["invalid", firstBooking.end_time],
    [new Date(firstBooking.start_time), "invalid"],
    [new Date(firstBooking.start_time), firstBooking.start_time],
    [new Date(firstBooking.end_time), firstBooking.start_time],
  ]) {
    assert.throws(
      () =>
        calendarConflicts("kitchen", new Date(start), new Date(end), bookings),
      /Enter valid start and end dates, with the end after the start\./,
    );
  }
});

test("rejects raw strings including timezone-less calendar inputs", () => {
  for (const [start, end] of [
    ["2026-10-12T13:00", new Date(firstBooking.end_time)],
    [new Date(firstBooking.start_time), "2026-10-12T14:00"],
    [firstBooking.start_time, firstBooking.end_time],
    [null, new Date(firstBooking.end_time)],
  ]) {
    assert.throws(
      () => calendarConflicts("kitchen", start, end, bookings),
      /Enter valid Date objects/,
    );
  }
});

function checkBookings(values) {
  return calendarConflicts(
    "kitchen",
    new Date(firstBooking.start_time),
    new Date(firstBooking.end_time),
    values,
  );
}

test("rejects malformed booking objects before filtering", () => {
  for (const value of [null, undefined, "garbage", 42, [], {}]) {
    assert.throws(() => checkBookings([value]), /not a valid booking object/);
  }
  for (const field of Object.keys(firstBooking)) {
    for (const value of [undefined, null, 42, "", "   "]) {
      assert.throws(
        () => checkBookings([{ ...firstBooking, [field]: value }]),
        /not a valid booking object/,
      );
    }
  }
});

test("rejects unreadable, ambiguous, equal, and reversed stored times", () => {
  for (const [start_time, end_time] of [
    ["garbage", firstBooking.end_time],
    [firstBooking.start_time, "garbage"],
    ["2026-10-12T13:00", firstBooking.end_time],
    [firstBooking.start_time, "2026-10-12T14:00"],
    [firstBooking.start_time, firstBooking.start_time],
    [firstBooking.end_time, firstBooking.start_time],
  ]) {
    assert.throws(
      () => checkBookings([{ ...firstBooking, start_time, end_time }]),
      new RegExp(`booking ${firstBooking.id} has an invalid time range`),
    );
  }
});

test("does not hide malformed data in excluded bookings", () => {
  for (const change of [
    { amenity: "meeting room" },
    { approval_status: "pending" },
    { id: "ignored" },
  ]) {
    assert.throws(
      () =>
        calendarConflicts(
          "kitchen",
          new Date(firstBooking.start_time),
          new Date(firstBooking.end_time),
          [{ ...firstBooking, ...change, start_time: "garbage" }],
          "ignored",
        ),
      /invalid time range/,
    );
  }
});

test("rejects a missing list and sparse booking entries", () => {
  assert.throws(() => checkBookings(null), /bookings must be an array/);
  assert.throws(
    () => checkBookings(new Array(1)),
    /not a valid booking object/,
  );
});
