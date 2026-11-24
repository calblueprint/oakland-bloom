"use client";

import type { CalendarReservation } from "@/types/reservations";
import { useEffect, useRef, useState, useTransition } from "react";
import { cancelBookingRequest } from "@/actions/reservations/cancelBookingRequest";
import { amenityLabel } from "@/lib/bookingRequest";
import { calendarDateRangeLabel } from "@/lib/calendarTime";
import { IconSvgs, statusIcon } from "@/lib/icons";
import { formatPhone } from "@/lib/phone";
import { AmenityTag, StatusBadge } from "./ReservationCard.styles";
import {
  Actions,
  ActionsNote,
  Backdrop,
  CancelButton,
  CancelErrorText,
  CloseButton,
  ConfirmText,
  Divider,
  EditButton,
  Header,
  Heading,
  InfoIcon,
  InfoList,
  InfoRow,
  Panel,
  Section,
  SectionLabel,
  TitleRow,
} from "./ReservationDetails.styles";

export type ReservationOwner = { email: string; phone: string };

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

// the panel that opens when a chef clicks one of their reservation cards
export function ReservationDetails({
  reservation,
  owner,
  onClose,
  onCancelled,
}: {
  reservation: CalendarReservation;
  owner: ReservationOwner;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  // cancelling asks once more in the panel before it does anything
  const [confirming, setConfirming] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [cancelling, startCancel] = useTransition();
  // read the clock once when the panel opens, not on every render
  const [openedAt] = useState(() => Date.now());

  // move focus into the panel when it opens or shows another reservation,
  // and let Escape close it
  // the parent keys this panel by reservation, so switching cards remounts it
  // with a fresh confirm/error state
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" && !cancelling && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, cancelling]);

  const status = reservation.approval_status;
  // the database allows the same: your own pending or approved booking,
  // before it starts
  const canCancel =
    (status === "pending" || status === "approved") &&
    Date.parse(reservation.start_time) > openedAt;

  const cancel = () => {
    setCancelError("");
    startCancel(async () => {
      try {
        const result = await cancelBookingRequest(reservation.id);
        if (result.error) setCancelError(result.error);
        // the page reloads its reservations without this one
        else onCancelled();
      } catch {
        setCancelError(
          "Could not reach the server. Check your connection and try again.",
        );
      }
    });
  };
  const contacts = [owner.email, ...reservation.additional_contacts].filter(
    Boolean,
  );

  return (
    <>
      <Backdrop onClick={onClose} />
      <Panel
        id="reservation-details"
        aria-labelledby="reservation-details-heading"
      >
        <Header>
          <TitleRow>
            <Heading
              id="reservation-details-heading"
              ref={heading}
              tabIndex={-1}
            >
              Reservation Details
            </Heading>
            <CloseButton
              type="button"
              aria-label="Close reservation details"
              onClick={onClose}
            >
              ×
            </CloseButton>
          </TitleRow>
          <StatusBadge $status={status}>
            {statusIcon(status)}
            {status}
          </StatusBadge>
        </Header>

        <Divider />

        <Section>
          <SectionLabel>{reservation.title}</SectionLabel>
          <InfoList>
            <InfoRow>
              <InfoIcon>{IconSvgs.calendar}</InfoIcon>
              {calendarDateRangeLabel(
                reservation.start_time,
                reservation.end_time,
              )}
            </InfoRow>
            <InfoRow>
              <InfoIcon>{IconSvgs.clock}</InfoIcon>
              {timeFormatter.format(new Date(reservation.start_time))} –{" "}
              {timeFormatter.format(new Date(reservation.end_time))}
            </InfoRow>
            <InfoRow>
              <InfoIcon>{IconSvgs.people}</InfoIcon>
              {reservation.num_people}{" "}
              {reservation.num_people === 1 ? "guest" : "guests"}
            </InfoRow>
          </InfoList>
        </Section>

        <Divider />

        <Section>
          <SectionLabel>Amenities</SectionLabel>
          {reservation.amenities.map(amenity => (
            <AmenityTag key={amenity} $amenity={amenity}>
              {IconSvgs.amenityTable}
              {amenityLabel(amenity)}
            </AmenityTag>
          ))}
        </Section>

        <Divider />

        <Section>
          <SectionLabel>Contact</SectionLabel>
          <InfoList>
            {contacts.map(email => (
              <InfoRow key={email} $muted>
                <InfoIcon>{IconSvgs.mail}</InfoIcon>
                {email}
              </InfoRow>
            ))}
            {owner.phone && (
              <InfoRow $muted>
                <InfoIcon>{IconSvgs.phone}</InfoIcon>
                {formatPhone(owner.phone)}
              </InfoRow>
            )}
          </InfoList>
        </Section>

        <Divider />

        {/* editing has no backend yet, so it stays disabled */}
        <Actions>
          {confirming ? (
            <>
              <ConfirmText id="cancel-confirm-text">
                Cancel this reservation? This can&apos;t be undone. You&apos;d
                need to request the time again.
              </ConfirmText>
              <CancelButton
                type="button"
                onClick={cancel}
                disabled={cancelling}
                aria-describedby="cancel-confirm-text"
              >
                {cancelling ? "Cancelling…" : "Yes, Cancel Reservation"}
              </CancelButton>
              <EditButton
                type="button"
                onClick={() => setConfirming(false)}
                disabled={cancelling}
              >
                Keep Reservation
              </EditButton>
            </>
          ) : (
            <>
              <EditButton
                type="button"
                disabled
                aria-describedby="details-actions-note"
              >
                Edit Reservation
              </EditButton>
              {canCancel && (
                <CancelButton type="button" onClick={() => setConfirming(true)}>
                  Cancel Reservation
                </CancelButton>
              )}
              <ActionsNote id="details-actions-note">
                Editing reservations is coming soon.
              </ActionsNote>
            </>
          )}
          {/* always mounted so screen readers hear the result */}
          <div aria-live="polite">
            {cancelError && (
              <CancelErrorText role="alert">{cancelError}</CancelErrorText>
            )}
          </div>
        </Actions>
      </Panel>
    </>
  );
}
