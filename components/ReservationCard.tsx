import type { Reservation } from "@/types/reservations";

type ReservationCardProps = {
  reservation: Reservation;
};

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
    <div>
      <h2>{reservation.amenity}</h2>
      <p>Date: {formattedDate}</p>
      <p>
        Time: {formattedStartTime} - {formattedEndTime}
      </p>
      <p>People: {reservation.num_people}</p>
      <p>Status: {reservation.approval_status}</p>
    </div>
  );
}
