import type { EventInput } from "@fullcalendar/react";
import type { OccupiedPeriod, Reservation } from "../types/reservations";

export const CALENDAR_TIME_ZONE = "America/Los_Angeles";

const statusColors: Record<string, { color: string; contrastColor: string }> = {
  approved: { color: "#f7b8b6", contrastColor: "#842a27" },
  pending: { color: "#fde5e4", contrastColor: "#842a27" },
  denied: { color: "#e5e7eb", contrastColor: "#374151" },
};

function readable(value: string) {
  return value
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

export function occupiedPeriodsToCalendarEvents(
  periods: readonly OccupiedPeriod[],
): EventInput[] {
  return periods.map(period => ({
    title: "Occupied",
    start: period.start_time,
    end: period.end_time,
    allDay: false,
    color: "#e5e7eb",
    contrastColor: "#374151",
    extendedProps: { amenity: period.amenity, approvalStatus: "occupied" },
  }));
}

export function reservationsToCalendarEvents(
  reservations: readonly Reservation[],
): EventInput[] {
  return reservations.map(reservation => {
    const status = reservation.approval_status.toLowerCase();
    const colors = statusColors[status] ?? statusColors.denied;

    return {
      id: reservation.id,
      title: readable(reservation.amenity),
      start: reservation.start_time,
      end: reservation.end_time,
      allDay: false,
      ...colors,
      extendedProps: {
        amenity: reservation.amenity,
        approvalStatus: status,
        numPeople: reservation.num_people,
      },
    };
  });
}
