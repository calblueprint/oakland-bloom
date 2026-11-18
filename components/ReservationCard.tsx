"use client";

import type { Reservation } from "@/types/reservations";
import { IconSvgs } from "@/lib/icons";
import {
  AmenityTag,
  DateSection,
  DayNumber,
  GuestCount,
  MonthYear,
  ReservationInfo,
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

  const statusIcons = {
    approved: "statusApproved",
    denied: "statusDenied",
    pending: "statusPending",
  };

  const formattedStartTime = timeFormatter.format(
    new Date(reservation.start_time),
  );
  const formattedEndTime = timeFormatter.format(new Date(reservation.end_time));

  return (
    <StyledCard>
      <ReservationInfo>
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

          <AmenityTag>
            {IconSvgs.amenityTable}
            {reservation.amenity}
          </AmenityTag>
        </div>
      </ReservationInfo>

      <StatusSection>
        <StatusBadge $status={reservation.approval_status}>
          {reservation.approval_status === "approved"
            ? IconSvgs.statusApproved
            : reservation.approval_status === "denied"
              ? IconSvgs.statusDenied
              : IconSvgs.statusPending}
          {reservation.approval_status}
        </StatusBadge>
      </StatusSection>
    </StyledCard>
  );
}
