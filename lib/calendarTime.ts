import { Temporal } from "temporal-polyfill";

export const CALENDAR_TIME_ZONE = "America/Los_Angeles";

// Include both kitchen dates for overnight or multi-day reservations.
export function calendarDateRangeLabel(
  start: string,
  end: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  },
) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: CALENDAR_TIME_ZONE,
  });
  const startLabel = formatter.format(new Date(start));
  const endLabel = formatter.format(new Date(end));
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}

export function toLocalInput(instant: string) {
  return Temporal.Instant.from(instant)
    .toZonedDateTimeISO(CALENDAR_TIME_ZONE)
    .toPlainDateTime()
    .toString({ smallestUnit: "minute" });
}

export function fromLocalInput(local: string) {
  // Reject DST gaps and repeated times instead of silently moving a request.
  return Temporal.ZonedDateTime.from(`${local}[${CALENDAR_TIME_ZONE}]`, {
    disambiguation: "reject",
  })
    .toInstant()
    .toString();
}

export function nextRequestTime() {
  const start = Temporal.Now.zonedDateTimeISO(CALENDAR_TIME_ZONE)
    .add({ hours: 1 })
    .with({
      minute: 0,
      second: 0,
      millisecond: 0,
      microsecond: 0,
      nanosecond: 0,
    });
  return {
    start: start.toInstant().toString(),
    end: start.add({ hours: 1 }).toInstant().toString(),
  };
}
