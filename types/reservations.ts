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
