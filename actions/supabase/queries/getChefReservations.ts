import "server-only";
import supabase from "../client";

/** A trusted server caller must verify identity before constructing this object. */
export interface AuthenticatedUser {
  /** Application users.userid, also stored in booking_event.user. */
  id: string;
}

export interface Reservation {
  id: string;
  amenity: string;
  start_time: string;
  end_time: string;
  num_people: number;
  approval_status: string;
}

/**
 * Reads reservations for an already verified application identity.
 * This contract does not authenticate the caller or establish a database session.
 * Never pass an identity taken directly from browser input.
 */
export default async function getChefReservations(
  user: AuthenticatedUser,
): Promise<Reservation[]> {
  if (!user || typeof user.id !== "string" || !user.id.trim()) {
    throw new Error("A verified application user ID is required.");
  }

  const { data, error } = await supabase
    .from("booking_event")
    .select("id, amenity, start_time, end_time, num_people, approval_status")
    .eq("user", user.id)
    .order("start_time", { ascending: true })
    .order("id", { ascending: true })
    .returns<Reservation[]>();

  if (error) {
    throw new Error("Unable to load chef reservations.", { cause: error });
  }

  return data ?? [];
}
