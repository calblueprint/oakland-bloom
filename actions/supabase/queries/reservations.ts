import "server-only";
import type { CalendarReservation, OccupiedPeriod } from "@/types/reservations";
import { isValidCalendarRange } from "@/lib/calendarRange";
import { getCurrentUser } from "@/lib/supabase/getUser";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// reads for the booking_event table, kept together so the columns chefs can
// see are decided in one place

/** The signed-in chef's own bookings, oldest first, using their auth cookies. */
export async function getChefReservations(): Promise<CalendarReservation[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Sign in to view your reservations.");

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("booking_event")
    .select(
      "id, title, amenities, amenity, start_time, end_time, num_people, approval_status, additional_contacts",
    )
    .eq("user", user.id)
    .order("start_time", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw new Error("Unable to load chef reservations.", { cause: error });
  }
  return data ?? [];
}

/** Other chefs' approved bookings in a range, as amenity + times only. */
export async function getOccupiedPeriods(
  start: string,
  end: string,
): Promise<OccupiedPeriod[]> {
  if (!isValidCalendarRange(start, end))
    throw new Error("Invalid calendar range.");
  const supabase = await getSupabaseServerClient();
  // This RPC never returns another chef's underlying booking records.
  const { data, error } = await supabase.rpc("get_calendar_occupied_periods", {
    p_start: start,
    p_end: end,
  });
  if (error) throw new Error("Unable to load availability.", { cause: error });
  return (data ?? []).map(row => ({
    amenity: row.amenity,
    start_time: row.start_time,
    end_time: row.end_time,
  }));
}
