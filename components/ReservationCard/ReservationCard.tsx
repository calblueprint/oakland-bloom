"use client";

import type { CalendarReservation } from "@/types/reservations";
import { amenityLabel } from "@/lib/bookingRequest";
import { calendarTimeRangeLabel, formatCalendarDate } from "@/lib/calendarTime";
import { IconSvgs } from "@/lib/icons";
import {
  AmenityTag,
  AmenityTags,
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
};

export function ReservationCard({ reservation }: ReservationCardProps) {
  const start = reservation.start_time;
  const weekday = formatCalendarDate(start, { weekday: "short" });
  const day = formatCalendarDate(start, { day: "numeric" });
  const monthYear = formatCalendarDate(start, {
    month: "short",
    year: "numeric",
  });
  const timeRange = calendarTimeRangeLabel(start, reservation.end_time);

  return (
    <StyledCard>
      <ReservationInfo>
        <DateSection>
          <Weekday>{weekday.toUpperCase()}</Weekday>
          <DayNumber>{day}</DayNumber>
          <MonthYear>{monthYear}</MonthYear>
        </DateSection>

        <div>
          <ReservationTitle>{reservation.title}</ReservationTitle>
          <ReservationTime>{timeRange}</ReservationTime>

          <GuestCount>
            {reservation.num_people}{" "}
            {reservation.num_people === 1 ? "guest" : "guests"}
          </GuestCount>

          <AmenityTags>
            {reservation.amenities.map(amenity => (
              <AmenityTag key={amenity}>
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
      </StatusSection>
    </StyledCard>
  );
}
