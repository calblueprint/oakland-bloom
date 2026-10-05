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
        `2026-10-12T${start}:00-07:00`,
        `2026-10-12T${end}:00-07:00`,
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
        `2026-10-12T${start}:00-07:00`,
        `2026-10-12T${end}:00-07:00`,
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
      "2026-10-12T13:30:00-07:00",
      "2026-10-12T14:30:00-07:00",
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
        firstBooking.start_time,
        firstBooking.end_time,
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
      "2026-10-12T13:30:00-07:00",
      "2026-10-12T14:30:00-07:00",
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
      "2026-10-12T20:15:00Z",
      "2026-10-12T20:45:00Z",
      bookings,
    ),
    [firstBooking.id],
  );
});

test("returns no conflicts for an empty list", () => {
  assert.deepEqual(
    calendarConflicts(
      "kitchen",
      firstBooking.start_time,
      firstBooking.end_time,
      [],
    ),
    [],
  );
});

test("rejects invalid timestamps, equal endpoints, and reversed intervals", () => {
  for (const [start, end] of [
    ["invalid", firstBooking.end_time],
    [firstBooking.start_time, "invalid"],
    [firstBooking.start_time, firstBooking.start_time],
    [firstBooking.end_time, firstBooking.start_time],
  ]) {
    assert.throws(
      () => calendarConflicts("kitchen", start, end, bookings),
      /Provide valid timestamps with the end after the start\./,
    );
  }
});
