import "server-only";
import type { OccupiedPeriod } from "@/types/reservations";
import { isValidCalendarRange } from "@/lib/calendarRange";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function getOccupiedPeriods(
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
