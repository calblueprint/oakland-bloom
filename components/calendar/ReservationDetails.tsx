import type { CalendarReservation } from "@/types/reservations";
import type { ReservationContact } from "./ReservationForm";
import { AmenityChip } from "./AmenityChip";
import { CalendarIcon } from "./CalendarIcon";

export function ReservationDetails({
  reservation,
  contact,
  onClose,
}: {
  reservation: CalendarReservation;
  contact: ReservationContact;
  onClose: () => void;
}) {
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <aside
      className="reservation-panel reservation-details"
      aria-label="Reservation details"
    >
      <header className="reservation-panel-header">
        <h2>Reservation Details</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close reservation details"
          onClick={onClose}
        >
          <CalendarIcon name="close" />
        </button>
      </header>
      <p
        className={`reservation-status reservation-status--${reservation.approval_status}`}
      >
        {reservation.approval_status}
      </p>
      <hr />
      <h3>{reservation.title}</h3>
      <p className="reservation-date">
        <CalendarIcon name="date" />
        {date.format(new Date(reservation.start_time))}
      </p>
      <p className="reservation-date">
        <CalendarIcon name="time" />
        {time.format(new Date(reservation.start_time))} –{" "}
        {time.format(new Date(reservation.end_time))}
      </p>
      <p>
        {reservation.num_people}{" "}
        {reservation.num_people === 1 ? "chef" : "chefs"}
      </p>
      <hr />
      <p className="reservation-field-label">Amenities</p>
      <div className="reservation-amenities">
        {reservation.amenities.map(a => (
          <AmenityChip key={a} amenity={a} />
        ))}
      </div>
      <hr />
      <p className="reservation-field-label">Contact Information</p>
      <p>{contact.name}</p>
      <p>{contact.email}</p>
      {reservation.additional_contacts.map(email => (
        <p key={email}>{email}</p>
      ))}
      <button
        type="button"
        className="cancel-reservation-button"
        onClick={onClose}
      >
        Close
      </button>
    </aside>
  );
}
