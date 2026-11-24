"use server";

import { revalidatePath } from "next/cache";
import { getAccount } from "@/lib/auth/account";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import Logger from "../logging";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// cancels one of the signed-in chef's own pending or approved reservations.
// the database function checks ownership, status and start time itself, so
// calling this action directly can't cancel anyone else's booking
export async function cancelBookingRequest(
  id: unknown,
): Promise<{ error?: string }> {
  try {
    const account = await getAccount();
    if (!account) return { error: "Sign in again to cancel this reservation." };
    if (!account.isAdmin && account.status !== "approved") {
      return { error: "Your account must be approved to cancel reservations." };
    }
    if (typeof id !== "string" || !UUID.test(id)) {
      return { error: "That reservation couldn't be found. Refresh the page." };
    }

    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.rpc("cancel_booking_request", {
      p_id: id,
    });
    if (error) {
      if (error.code === "P0002") {
        return {
          error: "That reservation couldn't be found. Refresh the page.",
        };
      }
      if (error.code === "22023") {
        return {
          error:
            "This reservation can't be cancelled. It may have already started or been denied.",
        };
      }
      if (error.code === "42501") {
        return { error: "Sign in with an approved account to cancel." };
      }
      Logger.error(
        `Error cancelling booking: ${error.message} (${error.code})`,
      );
      return { error: "Couldn't cancel this reservation. Please try again." };
    }

    revalidatePath("/chef");
    revalidatePath("/chef/reservations");
    return {};
  } catch {
    return { error: "Couldn't cancel this reservation. Please try again." };
  }
}
