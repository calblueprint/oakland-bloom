export interface Booking {
  id: string;
  amenity: string;
  start_time: string;
  end_time: string;
  approval_status: string;
}

const hasOffset = /(Z|[+-]\d{2}:?\d{2})$/i;

function validateBooking(
  value: unknown,
  index: number,
): asserts value is Booking {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !["id", "amenity", "start_time", "end_time", "approval_status"].every(
      field => {
        const fieldValue = (value as Record<string, unknown>)[field];
        return typeof fieldValue === "string" && fieldValue.trim().length > 0;
      },
    )
  ) {
    throw new Error(
      `Cannot check availability: booking at index ${index} is not a valid booking object.`,
    );
  }
}

/**
 * Returns IDs of approved bookings that overlap the requested amenity and time.
 * Callers must convert calendar inputs to Dates in the intended timezone first.
 * Throws for invalid requests or any malformed stored booking; callers must not
 * treat a failed availability check as permission to save a booking.
 */
export function calendarConflicts(
  amenity: string,
  startTime: Date,
  endTime: Date,
  bookings: readonly Booking[],
  ignoreBookingId?: string,
): string[] {
  if (!(startTime instanceof Date) || !(endTime instanceof Date)) {
    throw new Error("Enter valid Date objects for the start and end.");
  }

  const requestedStart = startTime.getTime();
  const requestedEnd = endTime.getTime();

  if (
    !Number.isFinite(requestedStart) ||
    !Number.isFinite(requestedEnd) ||
    requestedEnd <= requestedStart
  ) {
    throw new Error(
      "Enter valid start and end dates, with the end after the start.",
    );
  }

  if (!Array.isArray(bookings)) {
    throw new Error("Cannot check availability: bookings must be an array.");
  }

  const conflicts: string[] = [];

  // Validate every entry, including entries that would otherwise be filtered out.
  for (const [index, booking] of bookings.entries()) {
    validateBooking(booking, index);
    const bookingStart = Date.parse(booking.start_time);
    const bookingEnd = Date.parse(booking.end_time);

    if (
      !hasOffset.test(booking.start_time) ||
      !hasOffset.test(booking.end_time) ||
      !Number.isFinite(bookingStart) ||
      !Number.isFinite(bookingEnd) ||
      bookingEnd <= bookingStart
    ) {
      throw new Error(
        `Cannot check availability: booking ${booking.id} has an invalid time range.`,
      );
    }

    if (
      booking.amenity === amenity &&
      booking.approval_status === "approved" &&
      booking.id !== ignoreBookingId &&
      requestedStart < bookingEnd &&
      requestedEnd > bookingStart
    ) {
      conflicts.push(booking.id);
    }
  }

  return conflicts;
}
