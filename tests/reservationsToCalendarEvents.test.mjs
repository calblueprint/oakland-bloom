import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidCalendarRange } from "../lib/calendarRange.ts";
import {
  CALENDAR_TIME_ZONE,
  occupiedPeriodsToCalendarEvents,
  reservationsToCalendarEvents,
} from "../lib/reservationsToCalendarEvents.ts";
import { expectedReservations } from "./fixtures/reservationCases.mjs";

test("occupied events have no owner, booking ID, or people count even with extra input fields", () => {
  const [event] = occupiedPeriodsToCalendarEvents([
    {
      amenity: "kitchen",
      start_time: "2026-10-28T18:00:00Z",
      end_time: "2026-10-28T20:00:00Z",
      id: "private-booking-id",
      user: "private-owner",
      num_people: 42,
      email: "private@example.invalid",
    },
  ]);
  assert.equal(event.title, "Occupied");
  assert.equal(event.id, undefined);
  assert.deepEqual(event.extendedProps, {
    amenity: "kitchen",
    approvalStatus: "occupied",
  });
  assert.ok(!JSON.stringify(event).includes("private"));
});

test("availability ranges require offsets, positive durations, and bounded dates", () => {
  assert.ok(
    isValidCalendarRange(
      "2026-10-26T00:00:00-07:00",
      "2026-11-02T00:00:00-08:00",
    ),
  );
  assert.ok(
    !isValidCalendarRange("2026-10-26T00:00:00", "2026-11-02T00:00:00"),
  );
  assert.ok(!isValidCalendarRange("garbage", "2026-11-02T00:00:00Z"));
  assert.ok(
    !isValidCalendarRange("2026-11-02T00:00:00Z", "2026-10-26T00:00:00Z"),
  );
  assert.ok(
    !isValidCalendarRange("2026-01-01T00:00:00Z", "2027-01-01T00:00:00Z"),
  );
});

test("adapts OAK-10 bookings without changing their instants or source data", () => {
  const before = structuredClone(expectedReservations);
  const events = reservationsToCalendarEvents(expectedReservations);
  assert.equal(events.length, before.length);
  events.forEach((event, index) => {
    const reservation = before[index];
    assert.equal(event.id, reservation.id);
    assert.equal(event.start, reservation.start_time);
    assert.equal(event.end, reservation.end_time);
    assert.equal(event.allDay, false);
    assert.equal(event.extendedProps.numPeople, reservation.num_people);
  });
  assert.deepEqual(expectedReservations, before);
  assert.deepEqual(reservationsToCalendarEvents([]), []);
});

test("uses amenity labels, preserves status metadata, and uses a lighter coral for pending", () => {
  const events = reservationsToCalendarEvents(expectedReservations);
  const pending = events.find(
    event => event.extendedProps.approvalStatus === "pending",
  );
  const approved = events.find(
    event => event.extendedProps.approvalStatus === "approved",
  );
  assert.equal(pending.title, "Kitchen");
  assert.equal(approved.title, "Kitchen");
  const channels = color =>
    color
      .slice(1)
      .match(/../g)
      .map(hex => parseInt(hex, 16));
  channels(pending.color).forEach((value, index) => {
    assert.ok(value > channels(approved.color)[index]);
  });
  assert.equal(pending.contrastColor, "#842a27");
  assert.equal(approved.contrastColor, "#842a27");
  assert.ok(!("backgroundColor" in pending));
  assert.ok(!("textColor" in pending));
});

test("Los Angeles display uses daylight saving rather than a fixed UTC offset", () => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: CALENDAR_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  });
  assert.equal(formatter.format(new Date("2030-07-10T16:00:00Z")), "09:00");
  assert.equal(formatter.format(new Date("2030-01-10T16:00:00Z")), "08:00");
});
