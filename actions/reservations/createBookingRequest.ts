"use server";

import type { BookingResult } from "@/lib/bookingRequest";
import { revalidatePath } from "next/cache";
import getCalendarReservations from "@/actions/supabase/queries/getCalendarReservations";
import getOccupiedPeriods from "@/actions/supabase/queries/getOccupiedPeriods";
import { getAccount } from "@/lib/auth/account";
import { validateBookingRequest } from "@/lib/bookingRequest";
import { calendarConflicts } from "@/lib/calendarConflicts";
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
    const [own, occupied] = await Promise.all([
      getCalendarReservations(),
      getOccupiedPeriods(request.start, request.end),
    ]);
    const bookings = [
      ...own.flatMap(b => b.amenities.map(amenity => ({ ...b, amenity }))),
      ...occupied.map((p, i) => ({
        ...p,
        id: `occupied-${i}`,
        approval_status: "approved",
      })),
    ];
    if (
      request.amenities.some(
        a =>
          calendarConflicts(
            a,
            new Date(request.start),
            new Date(request.end),
            bookings,
          ).length,
      )
    ) {
      return {
        error:
          "One or more selected amenities are occupied. Choose another time or change the amenities.",
        fields: { time: "This time conflicts with an approved booking." },
      };
    }
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
            "The reservation details are no longer valid. Check the time and try again.",
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
