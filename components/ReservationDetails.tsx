"use client";

import type { CalendarReservation } from "@/types/reservations";
import { useEffect, useRef } from "react";
import { amenityLabel } from "@/lib/bookingRequest";
import { calendarDateRangeLabel } from "@/lib/calendarTime";
import { IconSvgs } from "@/lib/icons";
import { AmenityTag, StatusBadge } from "./ReservationCard.styles";
import {
  Actions,
  ActionsNote,
  Backdrop,
  CancelButton,
  CloseButton,
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

const statusIcons = {
  approved: IconSvgs.statusApproved,
  denied: IconSvgs.statusDenied,
  pending: IconSvgs.statusPending,
};

// the panel that opens when a chef clicks one of their reservation cards
export function ReservationDetails({
  reservation,
  owner,
  onClose,
}: {
  reservation: CalendarReservation;
  owner: ReservationOwner;
  onClose: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);

  // move focus into the panel when it opens or shows another reservation,
  // and let Escape close it
  useEffect(() => {
    heading.current?.focus();
  }, [reservation.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const status = reservation.approval_status;
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
            {statusIcons[status as keyof typeof statusIcons] ??
              IconSvgs.statusPending}
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
                {owner.phone}
              </InfoRow>
            )}
          </InfoList>
        </Section>

        <Divider />

        {/* editing and cancelling have no backend yet, so these stay disabled */}
        <Actions>
          <EditButton
            type="button"
            disabled
            aria-describedby="details-actions-note"
          >
            Edit Reservation
          </EditButton>
          <CancelButton
            type="button"
            disabled
            aria-describedby="details-actions-note"
          >
            Cancel Reservation
          </CancelButton>
          <ActionsNote id="details-actions-note">
            Editing and cancelling reservations are coming soon.
          </ActionsNote>
        </Actions>
      </Panel>
    </>
  );
}
