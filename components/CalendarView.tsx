"use client";

import type { OccupiedPeriod, Reservation } from "@/types/reservations";
import type {
  CalendarRef,
  DateSelectInfo,
  EventSourceFuncInfo,
} from "@fullcalendar/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calendar } from "@fullcalendar/react";
import interactionPlugin from "@fullcalendar/react/interaction";
import themePlugin from "@fullcalendar/react/themes/monarch";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import {
  CALENDAR_TIME_ZONE,
  occupiedPeriodsToCalendarEvents,
  reservationsToCalendarEvents,
} from "@/lib/reservationsToCalendarEvents";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/monarch/theme.css";
import "./app.css";

export function CalendarView({
  reservations,
}: {
  reservations: Reservation[];
}) {
  const calendarRef = useRef<CalendarRef>(null);
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const [availabilityError, setAvailabilityError] = useState(false);
  const ownEvents = useMemo(
    () => reservationsToCalendarEvents(reservations),
    [reservations],
  );
  const fetchOccupied = useCallback(async (range: EventSourceFuncInfo) => {
    const query = new URLSearchParams({
      start: range.startStr,
      end: range.endStr,
    });
    const response = await fetch(`/api/calendar/occupied?${query}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Unable to load availability.");
    const periods: OccupiedPeriod[] = await response.json();
    setAvailabilityError(false);
    return occupiedPeriodsToCalendarEvents(periods);
  }, []);
  const occupiedSources = useMemo(
    () => [{ id: "occupied", events: fetchOccupied }],
    [fetchOccupied],
  );

  const handleSelect = (selection: DateSelectInfo) => {
    console.log("Selected calendar range", {
      start: selection.startStr,
      end: selection.endStr,
      allDay: selection.allDay,
    });
  };

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const updateLayout = () => setIsMobile(!mediaQuery.matches);

    updateLayout();
    mediaQuery.addEventListener("change", updateLayout);
    return () => mediaQuery.removeEventListener("change", updateLayout);
  }, []);

  useEffect(() => {
    if (isMobile !== null) {
      // initialView only applies on mount; update the existing calendar on resize.
      calendarRef.current
        ?.getApi()
        .changeView(isMobile ? "timeGridThreeDay" : "timeGridWeek");
    }
  }, [isMobile]);

  return (
    <div className="calendar-container" aria-busy={isMobile === null}>
      {availabilityError && (
        <p className="calendar-availability-error" role="alert">
          Other chefs’ availability could not be loaded. Empty times are not
          confirmed available.
          <button onClick={() => calendarRef.current?.getApi().refetchEvents()}>
            Retry
          </button>
        </p>
      )}
      {isMobile !== null && (
        <Calendar
          ref={calendarRef}
          colorScheme="light"
          events={ownEvents}
          eventSources={occupiedSources}
          eventSourceFailure={() => setAvailabilityError(true)}
          timeZone={CALENDAR_TIME_ZONE}
          eventTimeFormat={{ hour: "numeric", minute: "2-digit", hour12: true }}
          displayEventEnd={true}
          firstDay={1}
          allDaySlot={false}
          scrollTime="09:00:00"
          eventClass={({ event }) =>
            `reservation-block reservation-block--${event.extendedProps.approvalStatus}`
          }
          eventContent={({ event, timeText }) => (
            <div className="calendar-event">
              <strong>{event.title}</strong>
              <span>{timeText}</span>
              <span className="calendar-event-status">
                {event.extendedProps.approvalStatus === "occupied"
                  ? event.extendedProps.amenity
                  : event.extendedProps.approvalStatus}
              </span>
            </div>
          )}
          plugins={[themePlugin, timeGridPlugin, interactionPlugin]}
          selectable={true}
          selectLongPressDelay={400}
          selectMirror={true}
          select={handleSelect}
          views={{
            timeGridThreeDay: {
              type: "timeGrid",
              duration: { days: 3 },
            },
          }}
          headerToolbar={{
            left: "prev,next today",
            center: "",
            right: "title",
          }}
          toolbarClass="calendar-toolbar"
          buttonClass={({ name }) =>
            name === "today" ? "calendar-today-button" : "calendar-nav-button"
          }
          initialView={isMobile ? "timeGridThreeDay" : "timeGridWeek"}
          titleFormat={
            isMobile ? { month: "short", day: "numeric" } : undefined
          }
          dayHeaderClass="calendar-day-cell"
          dayHeaderContent={({ date, isToday }) => (
            <div
              className={`calendar-day-heading${isToday ? " is-today" : ""}`}
            >
              <span className="calendar-weekday">
                {new Intl.DateTimeFormat("en-US", {
                  timeZone: CALENDAR_TIME_ZONE,
                  weekday: "short",
                }).format(date)}
              </span>
              <span className="calendar-day-number">
                {new Intl.DateTimeFormat("en-US", {
                  timeZone: CALENDAR_TIME_ZONE,
                  day: "numeric",
                }).format(date)}
              </span>
            </div>
          )}
          toolbarTitleClass="calendar-title"
          height="100%"
        />
      )}
    </div>
  );
}
