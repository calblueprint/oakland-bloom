export interface Booking {
  id: string;
  amenity: string;
  start_time: string;
  end_time: string;
  approval_status: string;
}

/** Returns IDs of approved bookings that overlap the requested amenity and time. */
export function calendarConflicts(
  amenity: string,
  startTime: string,
  endTime: string,
  bookings: readonly Booking[],
  ignoreBookingId?: string,
): string[] {
  const requestedStart = Date.parse(startTime);
  const requestedEnd = Date.parse(endTime);

  if (
    !Number.isFinite(requestedStart) ||
    !Number.isFinite(requestedEnd) ||
    requestedEnd <= requestedStart
  ) {
    throw new Error("Provide valid timestamps with the end after the start.");
  }

  return bookings
    .filter(
      booking =>
        booking.amenity === amenity &&
        booking.approval_status === "approved" &&
        booking.id !== ignoreBookingId &&
        requestedStart < Date.parse(booking.end_time) &&
        requestedEnd > Date.parse(booking.start_time),
    )
    .map(booking => booking.id);
}
