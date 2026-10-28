// Public synthetic fixture identities/data only. Login secrets stay in .env.local.
export const reservationTestUserId = "ee90d30c-984c-41c9-8248-bd299ca51f6d";

// Chronological order. Retired duplicate 003 is intentionally omitted.
export const expectedReservations = [
  {
    id: "0a100000-0000-4000-a000-000000000004",
    amenity: "kitchen",
    start_time: "2020-07-10T16:00:00.000Z",
    end_time: "2020-07-10T17:00:00.000Z",
    num_people: 2,
    approval_status: "approved",
  },
  {
    id: "0a100000-0000-4000-a000-000000000001",
    amenity: "kitchen",
    start_time: "2030-07-10T16:00:00.000Z",
    end_time: "2030-07-10T17:00:00.000Z",
    num_people: 2,
    approval_status: "pending",
  },
  {
    id: "0a100000-0000-4000-a000-000000000002",
    amenity: "kitchen",
    start_time: "2030-07-11T16:00:00.000Z",
    end_time: "2030-07-11T18:00:00.000Z",
    num_people: 4,
    approval_status: "approved",
  },
];

export const secondReservationTestUserId =
  "15fe2790-f751-4107-a789-38e3cf1485d6";
export const secondExpectedReservations = [
  {
    id: "0a100000-0000-4000-a000-000000000006",
    amenity: "kitchen",
    start_time: "2030-07-13T16:00:00.000Z",
    end_time: "2030-07-13T17:00:00.000Z",
    num_people: 2,
    approval_status: "approved",
  },
];
