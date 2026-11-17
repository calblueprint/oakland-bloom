import type { EventInput } from "@fullcalendar/react";
import type {
  CalendarReservation,
  OccupiedPeriod,
} from "../types/reservations";
import type { Amenity } from "./bookingRequest";
import { Temporal } from "temporal-polyfill";
import { CALENDAR_TIME_ZONE } from "./calendarTime.ts";

// Shade real availability across selected amenities, never synthetic occupancy.
export function availabilityEvents(
  start: string,
  end: string,
  amenities: readonly Amenity[],
  own: readonly CalendarReservation[],
  occupied: readonly OccupiedPeriod[],
): EventInput[] {
  if (!amenities.length) return [];
  const blocked = [
    ...occupied,
    ...own
      .filter(b => b.approval_status === "approved")
      .flatMap(b =>
        b.amenities.map(amenity => ({
          amenity,
          start_time: b.start_time,
          end_time: b.end_time,
        })),
      ),
  ];
  let day = Temporal.Instant.from(start)
    .toZonedDateTimeISO(CALENDAR_TIME_ZONE)
    .toPlainDate();
  const last = Temporal.Instant.from(end)
    .toZonedDateTimeISO(CALENDAR_TIME_ZONE)
    .toPlainDate();
  const events: EventInput[] = [];
  while (Temporal.PlainDate.compare(day, last) < 0) {
    const morning = day.toZonedDateTime({
      timeZone: CALENDAR_TIME_ZONE,
      plainTime: "09:00",
    });
    for (let slot = 0; slot < 18; slot++) {
      const from = morning.add({ minutes: slot * 30 });
      const to = from.add({ minutes: 30 });
      const free = amenities.filter(
        a =>
          !blocked.some(
            b =>
              b.amenity === a &&
              Date.parse(b.start_time) < to.epochMilliseconds &&
              Date.parse(b.end_time) > from.epochMilliseconds,
          ),
      ).length;
      const level =
        free === 0
          ? "unavailable"
          : free === amenities.length
            ? "available"
            : "partial";
      events.push({
        start: from.toInstant().toString(),
        end: to.toInstant().toString(),
        display: "background",
        color:
          free === 0
            ? "#ffffff"
            : free === amenities.length
              ? "#4b9f71"
              : free / amenities.length >= 0.5
                ? "#a9d9bd"
                : "#e0f2e7",
        className: `availability-cell availability-cell--${level}`,
        extendedProps: { availability: level, free, total: amenities.length },
      });
    }
    day = day.add({ days: 1 });
  }
  return events;
}
