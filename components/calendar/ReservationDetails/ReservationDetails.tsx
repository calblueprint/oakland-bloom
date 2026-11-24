import type { CalendarReservation } from "@/types/reservations";
import type { ReservationContact } from "../ReservationForm/ReservationForm";
import { calendarDateRangeLabel } from "@/lib/calendarTime";
import { AmenityChip } from "../AmenityChip/AmenityChip";
import { CalendarIcon } from "../CalendarIcon/CalendarIcon";
import {
  DateLine,
  DetailsPanel,
  FieldLabel,
  IconButton,
  PanelAmenities,
  PanelHeader,
  PlainCancelButton,
  StatusBadge,
} from "../ReservationForm/styles";

export function ReservationDetails({
  reservation,
  contact,
  onClose,
}: {
  reservation: CalendarReservation;
  contact: ReservationContact;
  onClose: () => void;
}) {
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <DetailsPanel aria-label="Reservation details">
      <PanelHeader>
        <h2>Reservation Details</h2>
        <IconButton
          type="button"
          aria-label="Close reservation details"
          onClick={onClose}
        >
          <CalendarIcon name="close" />
        </IconButton>
      </PanelHeader>
      <StatusBadge $status={reservation.approval_status}>
        {reservation.approval_status}
      </StatusBadge>
      <hr />
      <h3>{reservation.title}</h3>
      <DateLine>
        <CalendarIcon name="date" />
        {calendarDateRangeLabel(reservation.start_time, reservation.end_time)}
      </DateLine>
      <DateLine>
        <CalendarIcon name="time" />
        {time.format(new Date(reservation.start_time))} –{" "}
        {time.format(new Date(reservation.end_time))}
      </DateLine>
      <p>
        {reservation.num_people}{" "}
        {reservation.num_people === 1 ? "chef" : "chefs"}
      </p>
      <hr />
      <FieldLabel>Amenities</FieldLabel>
      <PanelAmenities>
        {reservation.amenities.map(a => (
          <AmenityChip key={a} amenity={a} />
        ))}
      </PanelAmenities>
      <hr />
      <FieldLabel>Contact Information</FieldLabel>
      <p>{contact.name}</p>
      <p>{contact.email}</p>
      {reservation.additional_contacts.map(email => (
        <p key={email}>{email}</p>
      ))}
      <PlainCancelButton type="button" onClick={onClose}>
        Close
      </PlainCancelButton>
    </DetailsPanel>
  );
}
