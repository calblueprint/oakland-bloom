import "server-only";
import type { CalendarReservation } from "@/types/reservations";
import { getCurrentUser } from "@/lib/supabase/getUser";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function getCalendarReservations(): Promise<
  CalendarReservation[]
> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Sign in to view your reservations.");
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("booking_event")
    .select(
      "id, title, amenities, amenity, start_time, end_time, num_people, approval_status, additional_contacts",
    )
    .eq("user", user.id)
    .order("start_time")
    .order("id");
  if (error)
    throw new Error(
      "Unable to load calendar reservations. Apply the booking request migration first.",
      { cause: error },
    );
  return data ?? [];
}
