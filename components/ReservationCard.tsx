"use client";

import type { Reservation } from "@/types/reservations";
import {
  AmenityTag,
  DateSection,
  DayNumber,
  GuestCount,
  MonthYear,
  ReservationTime,
  StatusBadge,
  StatusSection,
  StyledCard,
  Weekday,
} from "./ReservationCard.styles";

type ReservationCardProps = {
  reservation: Reservation;
};

// Date() converts the reservation time's string into a JS Date Object

export function ReservationCard({ reservation }: ReservationCardProps) {
  const date = new Date(reservation.start_time);

  // short to shorten "Monday" -> "Mon"
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
  }).format(date);

  // numeric to format date as #
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    day: "numeric",
  }).format(date);

  // shortens month title + formats year as #
  const monthYear = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    year: "numeric",
  }).format(date);

  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const formattedStartTime = timeFormatter.format(
    new Date(reservation.start_time),
  );
  const formattedEndTime = timeFormatter.format(new Date(reservation.end_time));

  return (
    <StyledCard>
      <DateSection>
        <Weekday>{weekday.toUpperCase()}</Weekday>
        <DayNumber>{day}</DayNumber>
        <MonthYear>{monthYear}</MonthYear>
      </DateSection>

      <div>
        <ReservationTime>
          {formattedStartTime} – {formattedEndTime}
        </ReservationTime>

        <GuestCount>
          {reservation.num_people}{" "}
          {reservation.num_people === 1 ? "guest" : "guests"}
        </GuestCount>

        <AmenityTag>{reservation.amenity}</AmenityTag>
      </div>

      <StatusSection>
        <StatusBadge $status={reservation.approval_status}>
          {reservation.approval_status}
        </StatusBadge>
      </StatusSection>
    </StyledCard>
  );
}
