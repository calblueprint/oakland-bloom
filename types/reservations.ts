import type { Database } from "./database.types";

export interface Reservation {
  id: string;
  amenity: string;
  start_time: string;
  end_time: string;
  num_people: number;
  approval_status: string;
}

/**
 * Read-only booking columns confirmed for OAK-10. The generated Database currently
 * includes only user_profiles. This projection does not invent insert/update
 * defaults or the unread has_conflicts array's element type.
 */
export interface ReservationQueryDatabase extends Database {
  public: Database["public"] & {
    Tables: Database["public"]["Tables"] & {
      booking_event: {
        Row: Reservation & { user: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
  };
}
