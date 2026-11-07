"use client";

import type { Amenity, SelectedTime } from "@/lib/bookingRequest";
import type { CalendarReservation } from "@/types/reservations";
import type { ReservationContact } from "./ReservationForm";
import { useRef, useState } from "react";
import { CalendarView } from "@/components/CalendarView";
import { AMENITIES } from "@/lib/bookingRequest";
import { nextRequestTime } from "@/lib/calendarTime";
import { AmenityChip } from "./AmenityChip";
import { ChefSidebar } from "./ChefSidebar";
import { ReservationDetails } from "./ReservationDetails";
import { ReservationForm } from "./ReservationForm";
import "./calendar.css";

export function ReservationExperience({
  reservations,
  contact,
}: {
  reservations: CalendarReservation[];
  contact: ReservationContact;
}) {
  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [selection, setSelection] = useState<SelectedTime | null>(null);
  const [details, setDetails] = useState<CalendarReservation | null>(null);
  const [draft, setDraft] = useState({ title: "", numPeople: 1 });
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const picker = useRef<HTMLDetailsElement>(null);
  const timeButton = useRef<HTMLButtonElement>(null);
  const chooseTime = (time: SelectedTime) => {
    if (pending) return;
    if (!amenities.length) {
      setMessage("Choose the amenities you want to book, then select a time.");
      if (picker.current) picker.current.open = true;
      return;
    }
    setMessage("");
    setDetails(null);
    setSelection(time);
  };
  const close = () => {
    setSelection(null);
    setDetails(null);
    setDraft({ title: "", numPeople: 1 });
    requestAnimationFrame(() => timeButton.current?.focus());
  };
  const toggle = (amenity: Amenity) => {
    if (pending) return;
    setAmenities(list =>
      list.includes(amenity)
        ? list.filter(a => a !== amenity)
        : [...list, amenity],
    );
    setSelection(null);
    setDetails(null);
    setDraft({ title: "", numPeople: 1 });
    setMessage("");
  };
  return (
    <div className="chef-calendar-shell">
      <ChefSidebar contact={contact} reservations={reservations} />
      <main className="calendar-page">
        <header className="calendar-page-header">
          <h1>Open Test Kitchen Reservations</h1>
        </header>
        {message && (
          <p className="reservation-notice" role="status">
            {message}
          </p>
        )}
        <div
          className={`reservation-experience ${selection || details ? "reservation-experience--editing" : ""}`}
        >
          <section
            className="calendar-workspace"
            aria-label="Kitchen availability"
          >
            <CalendarView
              reservations={reservations}
              amenities={amenities}
              onSelectTime={chooseTime}
              onViewReservation={reservation => {
                if (!pending) {
                  setSelection(null);
                  setDetails(reservation);
                }
              }}
              selection={selection}
              draft={draft}
              disabled={pending}
              revision={revision}
              controls={
                <details
                  className="amenity-dropdown"
                  ref={picker}
                  onKeyDown={e => {
                    if (e.key === "Escape") e.currentTarget.open = false;
                  }}
                >
                  <summary>
                    <span aria-hidden="true">＋</span>Book amenities
                  </summary>
                  <fieldset>
                    <legend>Select amenities</legend>
                    {AMENITIES.map(a => (
                      <label key={a.value}>
                        <input
                          type="checkbox"
                          checked={amenities.includes(a.value)}
                          onChange={() => toggle(a.value)}
                          disabled={pending}
                        />
                        {a.label}
                      </label>
                    ))}
                    <div className="amenity-picker-actions">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          setAmenities(AMENITIES.map(a => a.value));
                          setSelection(null);
                          setDetails(null);
                        }}
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (picker.current) picker.current.open = false;
                        }}
                      >
                        Done
                      </button>
                    </div>
                  </fieldset>
                </details>
              }
              chips={
                <div className="selected-amenities">
                  {amenities.map(a => (
                    <AmenityChip
                      key={a}
                      amenity={a}
                      onRemove={pending ? undefined : () => toggle(a)}
                    />
                  ))}
                </div>
              }
            />
            <p className="calendar-instruction">
              {amenities.length
                ? "Click or drag a time range to create a reservation. You can move or resize your draft."
                : "Choose amenities, then click or drag to create a reservation."}{" "}
              <button
                type="button"
                ref={timeButton}
                disabled={pending}
                onClick={() => chooseTime(nextRequestTime())}
              >
                Enter a time instead
              </button>
            </p>
            {amenities.length > 0 && (
              <p className="calendar-legend">
                <span className="legend-available" />
                All selected available
                <span className="legend-partial" />
                Partially available
                <span className="legend-unavailable" />
                Unavailable
              </p>
            )}
            <p className="calendar-footnote">
              America/Los_Angeles · Requests must start in the future.
              Availability is rechecked on submission.
            </p>
          </section>
          {selection && (
            <ReservationForm
              selection={selection}
              amenities={amenities}
              contact={contact}
              onPendingChange={setPending}
              onCancel={close}
              onSelectionChange={setSelection}
              onDraftChange={setDraft}
              onSuccess={() => {
                close();
                setRevision(v => v + 1);
                setMessage(
                  "Reservation requested. It is pending approval and is not yet confirmed.",
                );
              }}
            />
          )}
          {details && (
            <ReservationDetails
              reservation={details}
              contact={contact}
              onClose={close}
            />
          )}
        </div>
      </main>
    </div>
  );
}
