"use server";

import type { BookingResult } from "@/lib/bookingRequest";
import { revalidatePath } from "next/cache";
import { getAccount } from "@/lib/auth/account";
import { validateBookingRequest } from "@/lib/bookingRequest";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function createBookingRequest(
  raw: unknown,
): Promise<BookingResult> {
  try {
    const account = await getAccount();
    if (!account)
      return { error: "Sign in again before requesting a reservation." };
    if (!account.isAdmin && account.status !== "approved")
      return {
        error: "Your account must be approved before requesting a reservation.",
      };
    const parsed = validateBookingRequest(raw);
    if (parsed.errors)
      return {
        error: "Check the highlighted reservation details.",
        fields: parsed.errors,
      };
    const request = parsed.data;
    // The RPC checks availability atomically and recognizes saved request IDs
    // before checking the clock or overlaps, so a lost response is safe to retry.
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.rpc("create_booking_request", {
      p_id: request.requestId,
      p_title: request.title,
      p_amenities: request.amenities,
      p_start: request.start,
      p_end: request.end,
      p_num_people: request.numPeople,
      p_additional_contacts: request.additionalContacts,
    });
    if (error || !data) {
      if (error?.code === "23P01")
        return {
          error:
            "Availability changed. One of the selected amenities is now occupied. Choose another time.",
        };
      if (error?.code === "42501")
        return {
          error: "Sign in with an approved account to request a reservation.",
        };
      if (error?.code === "22023")
        return {
          error:
            "Check the reservation details and choose a start time in the future.",
        };
      return { error: "Your request could not be saved. Please try again." };
    }
    revalidatePath("/calendar");
    revalidatePath("/chef/reservations");
    return { id: data };
  } catch {
    return {
      error:
        "Unable to verify availability or save your request. Your details are preserved; please try again.",
    };
  }
}
