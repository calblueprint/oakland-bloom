# Calendar conflict tests

Run `pnpm test` with the project's required Node version (22.9 or newer).
The tests use Node's built-in test runner and TypeScript stripping, so no extra
dependencies or Supabase connection are required.

`calendarConflicts.test.mjs` checks partial and full overlaps, adjacent intervals,
approval status, different amenities, ignored booking IDs, timezone offsets,
empty lists, and invalid requested timestamps.

`fixtures/bookings.json` contains fictional bookings using the helper's field
names. The approved kitchen bookings are adjacent; a pending kitchen booking and
an approved meeting room booking exercise filtering. A kitchen request from
13:30 to 14:30 on October 12, 2026, with offset `-07:00`, should return the first
two IDs.

These fixtures have not been inserted into Supabase. Before importing them into
the development database, confirm the table name, amenity representation,
approval status values, and any additional required fields or foreign keys.
