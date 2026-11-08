"use client";

import type {
  Amenity,
  BookingErrors,
  SelectedTime,
} from "@/lib/bookingRequest";
import { useEffect, useRef, useState, useTransition } from "react";
import { createBookingRequest } from "@/actions/reservations/createBookingRequest";
import { Button } from "@/components/Button";
import {
  calendarDateRangeLabel,
  fromLocalInput,
  toLocalInput,
} from "@/lib/calendarTime";
import { AmenityChip } from "./AmenityChip";
import { CalendarIcon } from "./CalendarIcon";

export type ReservationContact = { name: string; email: string };

export function ReservationForm({
  selection,
  amenities,
  contact,
  onCancel,
  onSuccess,
  onPendingChange,
  onSelectionChange,
  onDraftChange,
}: {
  selection: SelectedTime;
  amenities: Amenity[];
  contact: ReservationContact;
  onCancel: () => void;
  onSuccess: () => void;
  onPendingChange: (pending: boolean) => void;
  onSelectionChange: (selection: SelectedTime) => void;
  onDraftChange: (draft: { title: string; numPeople: number }) => void;
}) {
  const [title, setTitle] = useState("");
  const [numPeople, setNumPeople] = useState(1);
  const [contacts, setContacts] = useState<string[]>([]);
  const selectionKey = `${selection.start}/${selection.end}`;
  const [editedRange, setEditedRange] = useState<{
    key: string;
    start: string;
    end: string;
  } | null>(null);
  const start =
    editedRange?.key === selectionKey
      ? editedRange.start
      : toLocalInput(selection.start);
  const end =
    editedRange?.key === selectionKey
      ? editedRange.end
      : toLocalInput(selection.end);
  const [fields, setFields] = useState<BookingErrors>({});
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const requestId = useRef<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    heading.current?.focus();
    heading.current?.scrollIntoView({ block: "nearest" });
  }, []);
  useEffect(() => {
    requestId.current = null;
  }, [selection.start, selection.end]);

  const commitTime = () => {
    try {
      const range = { start: fromLocalInput(start), end: fromLocalInput(end) };
      if (Date.parse(range.end) > Date.parse(range.start))
        onSelectionChange(range);
    } catch {
      // Incomplete or ambiguous edits stay in the form for validation.
    }
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    let range: SelectedTime;
    try {
      range = { start: fromLocalInput(start), end: fromLocalInput(end) };
    } catch {
      setFields({
        time: "Choose an unambiguous Los Angeles time. This time may fall in a daylight-saving change.",
      });
      return;
    }
    requestId.current ??= crypto.randomUUID();
    setError("");
    setFields({});
    onPendingChange(true);
    startTransition(async () => {
      try {
        const result = await createBookingRequest({
          ...range,
          requestId: requestId.current,
          title,
          numPeople,
          amenities,
          additionalContacts: contacts,
        });
        if (result.error) {
          setError(result.error);
          setFields(result.fields ?? {});
          requestAnimationFrame(() => errorRef.current?.focus());
        } else onSuccess();
      } catch {
        // Keep the same ID when the response is lost, so retrying is idempotent.
        setError(
          "Could not reach the server. Your details are preserved. Please retry.",
        );
      } finally {
        onPendingChange(false);
      }
    });
  };
  let displayStart = selection.start;
  let displayEnd = selection.end;
  try {
    displayStart = fromLocalInput(start);
    displayEnd = fromLocalInput(end);
  } catch {
    // Keep a readable summary while a native date input is incomplete.
  }
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
  });
  const dateLabel = calendarDateRangeLabel(displayStart, displayEnd);

  return (
    <aside
      className="reservation-panel"
      aria-labelledby="reservation-form-heading"
      onKeyDown={e => {
        if (e.key === "Escape" && !pending) onCancel();
      }}
    >
      <header className="reservation-panel-header">
        <h2 id="reservation-form-heading" ref={heading} tabIndex={-1}>
          New Reservation
        </h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close reservation form"
          onClick={onCancel}
          disabled={pending}
        >
          <CalendarIcon name="close" />
        </button>
      </header>
      <form onSubmit={submit}>
        <fieldset disabled={pending}>
          <legend className="sr-only">Reservation details</legend>
          <div className="reservation-date">
            <CalendarIcon name="date" />
            <span>{dateLabel}</span>
          </div>
          <div className="reservation-date">
            <CalendarIcon name="time" />
            <span>
              {timeFormatter.format(new Date(displayStart))} –{" "}
              {timeFormatter.format(new Date(displayEnd))}
            </span>
          </div>
          <p className="reservation-timezone">
            All times in America/Los_Angeles
          </p>
          <div className="reservation-time-inputs">
            <label>
              Start date and time
              <input
                type="datetime-local"
                required
                value={start}
                onBlur={commitTime}
                onChange={e => {
                  setEditedRange({
                    key: selectionKey,
                    start: e.target.value,
                    end,
                  });
                  requestId.current = null;
                }}
                aria-invalid={!!fields.time}
                aria-describedby={
                  fields.time ? "reservation-time-error" : undefined
                }
              />
            </label>
            <label>
              End date and time
              <input
                type="datetime-local"
                required
                value={end}
                onBlur={commitTime}
                onChange={e => {
                  setEditedRange({
                    key: selectionKey,
                    start,
                    end: e.target.value,
                  });
                  requestId.current = null;
                }}
                aria-invalid={!!fields.time}
                aria-describedby={
                  fields.time ? "reservation-time-error" : undefined
                }
              />
            </label>
          </div>
          <p className="reservation-note">
            Enter a date and time or drag your draft up or down. Use its edges
            to change the duration.
          </p>
          {fields.time && (
            <p id="reservation-time-error" className="reservation-field-error">
              {fields.time}
            </p>
          )}
          <hr />
          <label htmlFor="reservation-title">Reservation Title</label>
          <input
            id="reservation-title"
            placeholder="Pasta Making Practice"
            value={title}
            onChange={e => {
              setTitle(e.target.value);
              onDraftChange({ title: e.target.value, numPeople });
              requestId.current = null;
            }}
            required
            maxLength={120}
            aria-invalid={!!fields.title}
            aria-describedby={
              fields.title ? "reservation-title-error" : undefined
            }
          />
          {fields.title && (
            <p id="reservation-title-error" className="reservation-field-error">
              {fields.title}
            </p>
          )}
          <label htmlFor="reservation-chefs">Number of Chefs</label>
          <div className="chef-counter">
            <button
              type="button"
              aria-label="Fewer chefs"
              disabled={numPeople <= 1}
              onClick={() => {
                setNumPeople(n => n - 1);
                onDraftChange({ title, numPeople: numPeople - 1 });
                requestId.current = null;
              }}
            >
              <CalendarIcon name="decrement" />
            </button>
            <input
              id="reservation-chefs"
              type="number"
              min={1}
              max={2147483647}
              step={1}
              required
              value={Number.isNaN(numPeople) ? "" : numPeople}
              onChange={e => {
                setNumPeople(e.target.valueAsNumber);
                onDraftChange({ title, numPeople: e.target.valueAsNumber });
                requestId.current = null;
              }}
              aria-invalid={!!fields.numPeople}
            />
            <button
              type="button"
              aria-label="More chefs"
              disabled={numPeople >= 2147483647 || !Number.isInteger(numPeople)}
              onClick={() => {
                setNumPeople(n => n + 1);
                onDraftChange({ title, numPeople: numPeople + 1 });
                requestId.current = null;
              }}
            >
              <CalendarIcon name="increment" />
            </button>
          </div>
          {fields.numPeople && (
            <p className="reservation-field-error">{fields.numPeople}</p>
          )}
          <p className="reservation-field-label">Amenities</p>
          <div className="reservation-amenities">
            {amenities.map(a => (
              <AmenityChip key={a} amenity={a} />
            ))}
          </div>
          {!amenities.length && (
            <p className="reservation-field-error">
              Choose an amenity above the calendar.
            </p>
          )}
          {fields.amenities && (
            <p className="reservation-field-error">{fields.amenities}</p>
          )}
          <hr />
          <p className="reservation-field-label">Contact Information</p>
          <div className="reservation-contact">
            <span className="contact-avatar" aria-hidden="true">
              {contact.name
                .split(/\s+/)
                .map(n => n[0])
                .slice(0, 2)
                .join("")}
            </span>
            <div>
              <p>{contact.name} (You)</p>
              <p>{contact.email}</p>
            </div>
          </div>
          {contacts.map((email, i) => (
            <div className="additional-contact" key={i}>
              <label htmlFor={`additional-contact-${i}`} className="sr-only">
                Additional contact {i + 1}
              </label>
              <input
                id={`additional-contact-${i}`}
                type="email"
                autoComplete="email"
                placeholder="Email address"
                required
                maxLength={254}
                value={email}
                onChange={e => {
                  setContacts(list =>
                    list.map((v, j) => (j === i ? e.target.value : v)),
                  );
                  requestId.current = null;
                }}
                aria-invalid={!!fields.additionalContacts}
              />
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove contact ${i + 1}`}
                onClick={() => {
                  setContacts(list => list.filter((_, j) => j !== i));
                  requestId.current = null;
                }}
              >
                <CalendarIcon name="close" />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="add-contact-button"
            disabled={contacts.length >= 10}
            onClick={() => {
              setContacts(list => [...list, ""]);
              requestId.current = null;
            }}
          >
            <CalendarIcon name="addContact" />
            Add another contact
          </button>
          {fields.additionalContacts && (
            <p className="reservation-field-error">
              {fields.additionalContacts}
            </p>
          )}
          <p className="reservation-note">
            Additional contacts are saved with your request. No emails are sent.
          </p>
          <hr />
          <p className="reservation-note">
            Requests are pending until approved. Pending requests may overlap.
          </p>
        </fieldset>
        {error && (
          <div
            className="reservation-submit-error"
            role="alert"
            tabIndex={-1}
            ref={errorRef}
          >
            {error}
          </div>
        )}
        <Button
          as="button"
          type="submit"
          className="request-reservation-button"
          disabled={pending || !amenities.length}
        >
          {pending ? "Saving request…" : "Request Reservation"}
        </Button>
        <Button
          as="button"
          type="button"
          className="cancel-reservation-button"
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </Button>
      </form>
    </aside>
  );
}
