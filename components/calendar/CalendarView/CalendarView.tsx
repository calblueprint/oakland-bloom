"use client";

import type { Amenity, SelectedTime } from "@/lib/bookingRequest";
import type { CalendarReservation, OccupiedPeriod } from "@/types/reservations";
import type {
  CalendarRef,
  DateSelectInfo,
  EventInput,
  EventSourceFuncInfo,
} from "@fullcalendar/react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calendar } from "@fullcalendar/react";
import interactionPlugin from "@fullcalendar/react/interaction";
import themePlugin from "@fullcalendar/react/themes/monarch";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import { availabilityEvents } from "@/lib/calendarAvailability";
import {
  CALENDAR_TIME_ZONE,
  reservationsToCalendarEvents,
} from "@/lib/reservationsToCalendarEvents";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/monarch/theme.css";
import COLORS from "@/styles/colors";
import { CalendarIcon } from "../CalendarIcon/CalendarIcon";
import {
  ArrowButton,
  AvailabilityMessage,
  CalendarContainer,
  ControlRow,
  DatePicker,
  DayHeading,
  DayNumber,
  EventContent,
  EventStatus,
  Navigation,
  TodayButton,
  Weekday,
} from "./styles";

const calendarPlugins = [themePlugin, timeGridPlugin, interactionPlugin];

// Display reservations and shared availability in a responsive calendar.
export function CalendarView({
  reservations,
  amenities,
  onSelectTime,
  disabled,
  revision,
  selection,
  draft,
  onViewReservation,
  controls,
  chips,
}: {
  reservations: CalendarReservation[];
  amenities: Amenity[];
  onSelectTime: (selection: SelectedTime) => void;
  disabled: boolean;
  revision: number;
  selection: SelectedTime | null;
  draft: { title: string; numPeople: number };
  onViewReservation: (reservation: CalendarReservation) => void;
  controls: ReactNode;
  chips: ReactNode;
}) {
  const calendarRef = useRef<CalendarRef>(null);
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const [availabilityError, setAvailabilityError] = useState(false);
  const [title, setTitle] = useState("");
  const navigate = (direction: "prev" | "next" | "today") => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    api[direction]();
    setTitle(api.view.title);
  };
  const ownEvents = useMemo(
    () => [
      ...reservationsToCalendarEvents(
        reservations.filter(
          b =>
            !amenities.length ||
            b.amenities.some(a => amenities.includes(a as Amenity)),
        ),
      ),
      ...(selection
        ? [
            {
              id: "draft",
              title: draft.title || "New Reservation",
              start: selection.start,
              end: selection.end,
              color: COLORS.accentSoft,
              contrastColor: COLORS.accent,
              editable: !disabled,
              extendedProps: {
                approvalStatus: "draft",
                numPeople: draft.numPeople,
              },
            } satisfies EventInput,
          ]
        : []),
    ],
    [reservations, amenities, selection, draft, disabled],
  );

  // Refetch on navigation or filter change; never reuse another chef's availability.
  const fetchOccupied = useCallback(
    async (range: EventSourceFuncInfo) => {
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
      return availabilityEvents(
        range.startStr,
        range.endStr,
        amenities,
        reservations,
        periods,
      );
    },
    [amenities, reservations],
  );
  // FullCalendar uses source object identity. Editing a draft must not refetch availability.
  const occupiedSource = useMemo(
    () => ({ id: "occupied", events: fetchOccupied }),
    [fetchOccupied],
  );
  const eventSources = useMemo(
    () => [{ id: "reservations", events: ownEvents }, occupiedSource],
    [ownEvents, occupiedSource],
  );
  const handleSelect = (range: DateSelectInfo) => {
    if (!disabled) onSelectTime({ start: range.startStr, end: range.endStr });
  };

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const updateLayout = () => setIsMobile(!mediaQuery.matches);
    updateLayout();
    mediaQuery.addEventListener("change", updateLayout);
    return () => mediaQuery.removeEventListener("change", updateLayout);
  }, []);
  useEffect(() => {
    if (isMobile === null) return;
    const frame = requestAnimationFrame(() => {
      const api = calendarRef.current?.getApi();
      if (!api) return;
      api.changeView(isMobile ? "timeGridThreeDay" : "timeGridWeek");
      setTitle(api.view.title);
    });
    return () => cancelAnimationFrame(frame);
  }, [isMobile]);
  useEffect(() => {
    calendarRef.current?.getApi().unselect();
  }, [amenities, revision]);
  useEffect(() => {
    calendarRef.current?.getApi().unselect();
  }, [selection]);
  useEffect(() => {
    if (revision) calendarRef.current?.getApi().refetchEvents();
  }, [revision]);

  return (
    <>
      <ControlRow>
        {controls}
        <Navigation aria-label="Calendar dates">
          <DatePicker>
            <span aria-live="polite">{title}</span>
            <CalendarIcon name="chevron" />
            <input
              type="date"
              aria-label="Go to date"
              onChange={e => {
                if (!e.target.value) return;
                const api = calendarRef.current?.getApi();
                api?.gotoDate(e.target.value);
                if (api) setTitle(api.view.title);
              }}
            />
          </DatePicker>
          <TodayButton type="button" onClick={() => navigate("today")}>
            Today
          </TodayButton>
          <ArrowButton
            type="button"
            aria-label="Previous dates"
            onClick={() => navigate("prev")}
          >
            <CalendarIcon name="previous" />
          </ArrowButton>
          <ArrowButton
            type="button"
            aria-label="Next dates"
            onClick={() => navigate("next")}
          >
            <CalendarIcon name="next" />
          </ArrowButton>
        </Navigation>
      </ControlRow>
      {chips}
      {availabilityError && (
        <AvailabilityMessage role="alert">
          Other chefs’ availability could not be loaded. Empty times are not
          confirmed available.
          <button
            type="button"
            onClick={() => calendarRef.current?.getApi().refetchEvents()}
          >
            Retry
          </button>
        </AvailabilityMessage>
      )}
      <CalendarContainer aria-busy={isMobile === null}>
        {isMobile !== null && (
          <Calendar
            ref={calendarRef}
            class="calendar-grid"
            colorScheme="light"
            eventSources={eventSources}
            eventSourceFailure={() => setAvailabilityError(true)}
            timeZone={CALENDAR_TIME_ZONE}
            eventTimeFormat={{
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            }}
            displayEventEnd={true}
            firstDay={1}
            allDaySlot={false}
            slotMinTime="09:00:00"
            slotMaxTime="18:00:00"
            scrollTime="09:00:00"
            slotDuration="00:30:00"
            slotMinHeight={27}
            slotHeaderInterval="01:00:00"
            slotHeaderFormat={{ hour: "numeric", hour12: true }}
            slotHeaderContent={({ text, isFirst }) => (
              <span
                style={isFirst ? { position: "relative", top: 8 } : undefined}
              >
                {text.replace(/(AM|PM)/, " $1")}
              </span>
            )}
            slotLaneClass="calendar-time-slot"
            slotHeaderClass="calendar-time-label"
            slotHeaderInnerClass="calendar-time-label-inner"
            backgroundEventClass="availability-cell"
            eventClass={({ event }) =>
              `reservation-block reservation-block--${event.extendedProps.approvalStatus}`
            }
            eventContent={({ event, timeText }) => (
              <EventContent
                $short={
                  !!event.start &&
                  !!event.end &&
                  event.end.getTime() - event.start.getTime() <= 1800000
                }
              >
                <strong>{event.title}</strong>
                <span>{timeText}</span>
                <span>
                  {event.extendedProps.numPeople}{" "}
                  {event.extendedProps.numPeople === 1 ? "chef" : "chefs"}
                </span>
                {event.id !== "draft" && (
                  <EventStatus>
                    {event.extendedProps.approvalStatus}
                  </EventStatus>
                )}
              </EventContent>
            )}
            plugins={calendarPlugins}
            selectable={!disabled}
            dateClick={info => {
              if (!disabled && !info.allDay)
                onSelectTime({
                  start: info.dateStr,
                  end: new Date(info.date.getTime() + 30 * 60000).toISOString(),
                });
            }}
            eventClick={({ event }) => {
              const booking = reservations.find(b => b.id === event.id);
              if (booking && !disabled) onViewReservation(booking);
            }}
            eventDrop={info => {
              if (info.event.id !== "draft" || disabled) info.revert();
              else
                onSelectTime({
                  start: info.event.startStr,
                  end: info.event.endStr,
                });
            }}
            eventResize={info => {
              if (info.event.id !== "draft" || disabled) info.revert();
              else
                onSelectTime({
                  start: info.event.startStr,
                  end: info.event.endStr,
                });
            }}
            eventResizableFromStart={true}
            eventDidMount={({ event, el }) => {
              el.tabIndex = 0;
              el.setAttribute("role", "button");
              el.setAttribute(
                "aria-label",
                event.id === "draft"
                  ? "Move draft reservation. Use up and down arrow keys to change the time."
                  : `View ${event.title}, ${event.extendedProps.approvalStatus}`,
              );
              el.onkeydown = e => {
                if (disabled) return;
                if (
                  event.id === "draft" &&
                  (e.key === "ArrowUp" || e.key === "ArrowDown")
                ) {
                  e.preventDefault();
                  const offset = e.key === "ArrowUp" ? -1800000 : 1800000;
                  if (event.start && event.end)
                    onSelectTime({
                      start: new Date(
                        event.start.getTime() + offset,
                      ).toISOString(),
                      end: new Date(event.end.getTime() + offset).toISOString(),
                    });
                } else if (e.key === "Enter" || e.key === " ") {
                  const booking = reservations.find(b => b.id === event.id);
                  if (booking) {
                    e.preventDefault();
                    onViewReservation(booking);
                  }
                }
              };
            }}
            backgroundEventDidMount={({ event, el }) => {
              el.title = `${event.extendedProps.free} of ${event.extendedProps.total} selected amenities available`;
              el.setAttribute("aria-label", el.title);
            }}
            selectLongPressDelay={400}
            selectMirror={true}
            select={handleSelect}
            unselectAuto={false}
            views={{
              timeGridThreeDay: { type: "timeGrid", duration: { days: 3 } },
            }}
            headerToolbar={false}
            initialView={isMobile ? "timeGridThreeDay" : "timeGridWeek"}
            titleFormat={{ month: "short", day: "numeric", year: "numeric" }}
            dayHeaderClass="calendar-day-cell"
            dayHeaderContent={({ date, isToday }) => (
              <DayHeading>
                <Weekday $today={isToday}>
                  {new Intl.DateTimeFormat("en-US", {
                    timeZone: CALENDAR_TIME_ZONE,
                    weekday: "short",
                  }).format(date)}
                </Weekday>
                <DayNumber $today={isToday}>
                  {new Intl.DateTimeFormat("en-US", {
                    timeZone: CALENDAR_TIME_ZONE,
                    day: "numeric",
                  }).format(date)}
                </DayNumber>
              </DayHeading>
            )}
            height="auto"
          />
        )}
      </CalendarContainer>
    </>
  );
}
