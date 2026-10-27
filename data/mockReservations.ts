import type { Reservation } from "@/types/reservations";

export const mockReservations: Reservation[] = [
  {
    id: "1",
    amenity: "Kitchen",
    start_time: "2026-11-02T09:00:00-08:00",
    end_time: "2026-11-02T17:30:00-08:00",
    num_people: 4,
    approval_status: "pending",
  },
  {
    id: "2",
    amenity: "Ovens",
    start_time: "2026-11-11T11:00:00-08:00",
    end_time: "2026-11-11T16:45:00-08:00",
    num_people: 2,
    approval_status: "approved",
  },
  {
    id: "3",
    amenity: "Prep Station",
    start_time: "2026-10-31T03:00:00-07:00",
    end_time: "2026-10-31T07:00:00-07:00",
    num_people: 1,
    approval_status: "denied",
  },
];
