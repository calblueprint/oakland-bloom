"use client";

import type { CalendarReservation } from "@/types/reservations";
import { amenityLabel } from "@/lib/bookingRequest";
import { IconSvgs } from "@/lib/icons";
import {
  AmenityTag,
  AmenityTags,
  Chevron,
  DateSection,
  DayNumber,
  GuestCount,
  MonthYear,
  ReservationInfo,
  ReservationTime,
  ReservationTitle,
  StatusBadge,
  StatusSection,
  StyledCard,
  Weekday,
} from "./ReservationCard.styles";

type ReservationCardProps = {
  reservation: CalendarReservation;
  // whether this card's details panel is open
  selected: boolean;
  onSelect: () => void;
};

// Date() converts the reservation time's string into a JS Date Object

export function ReservationCard({
  reservation,
  selected,
  onSelect,
}: ReservationCardProps) {
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
    <StyledCard
      id={`reservation-card-${reservation.id}`}
      type="button"
      $selected={selected}
      aria-pressed={selected}
      aria-controls="reservation-details"
      onClick={onSelect}
    >
      <ReservationInfo>
        <DateSection>
          <Weekday>{weekday.toUpperCase()}</Weekday>
          <DayNumber>{day}</DayNumber>
          <MonthYear>{monthYear}</MonthYear>
        </DateSection>

        <div>
          <ReservationTitle>{reservation.title}</ReservationTitle>
          <ReservationTime>
            {formattedStartTime} – {formattedEndTime}
          </ReservationTime>

          <GuestCount>
            {reservation.num_people}{" "}
            {reservation.num_people === 1 ? "guest" : "guests"}
          </GuestCount>

          <AmenityTags>
            {reservation.amenities.map(amenity => (
              <AmenityTag key={amenity} $amenity={amenity}>
                {IconSvgs.amenityTable}
                {amenityLabel(amenity)}
              </AmenityTag>
            ))}
          </AmenityTags>
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
        <Chevron>{IconSvgs.chevronRight}</Chevron>
      </StatusSection>
    </StyledCard>
  );
}
