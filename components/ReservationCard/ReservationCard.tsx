"use client";

import type { CalendarReservation } from "@/types/reservations";
import { amenityLabel } from "@/lib/bookingRequest";
import { calendarTimeRangeLabel, formatCalendarDate } from "@/lib/calendarTime";
import { IconSvgs, statusIcon } from "@/lib/icons";
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
} from "./styles";

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
  const start = reservation.start_time;
  const weekday = formatCalendarDate(start, { weekday: "short" });
  const day = formatCalendarDate(start, { day: "numeric" });
  const monthYear = formatCalendarDate(start, {
    month: "short",
    year: "numeric",
  });

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
            {calendarTimeRangeLabel(
              reservation.start_time,
              reservation.end_time,
            )}
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
          {statusIcon(reservation.approval_status)}
          {reservation.approval_status}
        </StatusBadge>
        <Chevron>{IconSvgs.chevronRight}</Chevron>
      </StatusSection>
    </StyledCard>
  );
}
