import type { Tables } from "./database.types";

export type Reservation = Pick<
  Tables<"booking_event">,
  | "id"
  | "amenity"
  | "start_time"
  | "end_time"
  | "num_people"
  | "approval_status"
>;

// Intentionally excludes booking IDs, owner IDs, people counts, and personal data.
export type OccupiedPeriod = {
  amenity: string;
  start_time: string;
  end_time: string;
};
