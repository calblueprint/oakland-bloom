"use client";

import type { CalendarReservation } from "@/types/reservations";
import styled from "styled-components";
import { amenityLabel } from "@/lib/bookingRequest";

type ReservationCardProps = {
  reservation: CalendarReservation;
};

// styles each individual reservation
const StyledCard = styled.div`
  padding: 2rem;
  border: 1px solid #e0e0e0;
  border-radius: 1rem;
  background-color: #ffffff;
`;

export function ReservationCard({ reservation }: ReservationCardProps) {
  const formattedDate = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(reservation.start_time));

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
      <h2>{reservation.title}</h2>
      <p>{reservation.amenities.map(amenityLabel).join(", ")}</p>
      <p>Date: {formattedDate}</p>
      <p>
        Time: {formattedStartTime} - {formattedEndTime}
      </p>
      <p>Chefs: {reservation.num_people}</p>
      <p>Status: {reservation.approval_status}</p>
    </StyledCard>
  );
}
