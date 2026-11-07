export const AMENITIES = [
  { value: "bar_prep_table", label: "Bar Prep Table" },
  { value: "salad_bar_table", label: "Salad Bar Table" },
  { value: "oven", label: "Oven" },
] as const;

export type Amenity = (typeof AMENITIES)[number]["value"];
export type SelectedTime = { start: string; end: string };
export type BookingRequest = SelectedTime & {
  requestId: string;
  title: string;
  amenities: Amenity[];
  numPeople: number;
  additionalContacts: string[];
};
export type BookingField =
  "title" | "amenities" | "time" | "numPeople" | "additionalContacts";
export type BookingErrors = Partial<Record<BookingField, string>>;
export type BookingResult =
  | { id: string; error?: never; fields?: never }
  | {
      id?: never;
      error: string;
      fields?: BookingErrors;
    };

export function amenityLabel(value: string) {
  return AMENITIES.find(amenity => amenity.value === value)?.label ?? value;
}

export function validateBookingRequest(
  raw: unknown,
  now = Date.now(),
):
  | { data: BookingRequest; errors?: never }
  | { data?: never; errors: BookingErrors } {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const errors: BookingErrors = {};
  const title = typeof value.title === "string" ? value.title.trim() : "";
  if (!title || title.length > 120)
    errors.title = "Enter a title between 1 and 120 characters.";
  const allowed = AMENITIES.map(a => a.value as string);
  if (
    !Array.isArray(value.amenities) ||
    !value.amenities.length ||
    value.amenities.length > 3 ||
    value.amenities.some(a => typeof a !== "string" || !allowed.includes(a))
  ) {
    errors.amenities = "Choose at least one of the available amenities.";
  }
  if (
    typeof value.numPeople !== "number" ||
    !Number.isInteger(value.numPeople) ||
    value.numPeople < 1 ||
    value.numPeople > 2147483647
  )
    errors.numPeople = "Enter a positive whole number of chefs.";
  const start = typeof value.start === "string" ? value.start : "";
  const end = typeof value.end === "string" ? value.end : "";
  const offset = /(Z|[+-]\d{2}:\d{2})$/i;
  if (
    !offset.test(start) ||
    !offset.test(end) ||
    !Number.isFinite(Date.parse(start)) ||
    !Number.isFinite(Date.parse(end)) ||
    Date.parse(end) <= Date.parse(start) ||
    Date.parse(end) - Date.parse(start) > 42 * 86400000
  ) {
    errors.time = "Choose a valid time range of up to 42 days.";
  } else if (Date.parse(start) <= now)
    errors.time = "Choose a start time in the future.";
  const emails = value.additionalContacts;
  if (
    !Array.isArray(emails) ||
    emails.length > 10 ||
    emails.some(
      e =>
        typeof e !== "string" ||
        e.trim().length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()),
    )
  ) {
    errors.additionalContacts =
      "Enter valid email addresses, up to 10 additional contacts.";
  }
  if (
    typeof value.requestId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.requestId,
    )
  ) {
    errors.time = "Please close the form and select a time again.";
  }
  if (Object.keys(errors).length) return { errors };
  return {
    data: {
      requestId: value.requestId as string,
      title,
      start,
      end,
      amenities: [...new Set(value.amenities as Amenity[])].sort(),
      numPeople: value.numPeople as number,
      additionalContacts: [
        ...new Set((emails as string[]).map(e => e.trim().toLowerCase())),
      ].sort(),
    },
  };
}
