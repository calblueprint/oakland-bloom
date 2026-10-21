import "server-only";
import type { Reservation } from "@/types/reservations";
import { getCurrentUser } from "@/lib/supabase/getUser";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/** Reads the signed-in chef's bookings using the current request's auth cookies. */
export default async function getChefReservations(): Promise<Reservation[]> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Sign in to view your reservations.");
  }

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("booking_event")
    .select("id, amenity, start_time, end_time, num_people, approval_status")
    .eq("user", user.id)
    .order("start_time", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw new Error("Unable to load chef reservations.", { cause: error });
  }

  return data ?? [];
}
