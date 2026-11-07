import type { EventInput } from "@fullcalendar/react";
import type {
  CalendarReservation,
  OccupiedPeriod,
  Reservation,
} from "../types/reservations";
import { amenityLabel } from "./bookingRequest";

// Use the kitchen's timezone so daylight saving and remote viewers stay consistent.
export const CALENDAR_TIME_ZONE = "America/Los_Angeles";

const statusColors: Record<string, { color: string; contrastColor: string }> = {
  approved: { color: "#eef4f0", contrastColor: "#4f705f" },
  pending: { color: "#faf8f1", contrastColor: "#82765b" },
  denied: { color: "#e5e7eb", contrastColor: "#374151" },
};

// Turn amenity identifiers into title-cased labels.
function readable(value: string) {
  return value
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

// Explicitly map occupied fields so extra booking details cannot reach events.
export function occupiedPeriodsToCalendarEvents(
  periods: readonly OccupiedPeriod[],
): EventInput[] {
  return periods.map(period => ({
    title: "Occupied",
    start: period.start_time,
    end: period.end_time,
    allDay: false,
    color: period.amenity === "oven" ? "#f0eaf7" : "#e0f2e7",
    contrastColor: period.amenity === "oven" ? "#8064a0" : "#367c65",
    extendedProps: {
      amenity: period.amenity,
      amenityLabel: amenityLabel(period.amenity),
      approvalStatus: "occupied",
    },
  }));
}

// Convert the chef's reservations into labeled, status-colored events.
export function reservationsToCalendarEvents(
  reservations: readonly (Reservation | CalendarReservation)[],
): EventInput[] {
  return reservations.map(reservation => {
    const status = reservation.approval_status.toLowerCase();
    const colors = statusColors[status] ?? statusColors.denied;

    return {
      id: reservation.id,
      title:
        "title" in reservation
          ? reservation.title
          : readable(reservation.amenity),
      start: reservation.start_time,
      end: reservation.end_time,
      allDay: false,
      editable: false,
      ...colors,
      extendedProps: {
        amenity: reservation.amenity,
        approvalStatus: status,
        numPeople: reservation.num_people,
      },
    };
  });
}
