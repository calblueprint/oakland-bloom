## What's new

I added the reservation-query and development seed portion of OAK-10, plus a calendar
integration recommendation. This PR does not add a login screen, approval workflow,
reservation creation, or calendar UI.

- `getChefReservations({ id })` is server-only and reads `booking_event` using the
  confirmed mapping `AuthenticatedUser.id = users.userid = booking_event.user`.
  It returns ID, amenity, start/end time, number of people, and approval status;
  includes all statuses and past bookings; sorts by start time then ID; rejects a
  missing identity; and distinguishes database errors from successful empty results.
- The repeatable SQL seed creates three synthetic application users: Chef A with
  pending, approved, denied, and past-approved bookings; Chef B with one separate
  booking; and Chef C with no bookings. Fixed IDs, collision checks, a transaction,
  and insert-if-missing behavior prevent duplicates and protect unrelated records.
- I added optional `pnpm seed:reservations` and read-only `pnpm verify:reservations`
  commands, simulated tests, and setup instructions in `docs/reservation-query.md`.

### Seeding setup and what is still pending

I successfully ran the seed through Supabase SQL Editor. That is the current working
setup path. Running the full SQL file again should preserve counts **4, 1, 0**;
I have not yet recorded a second successful run to verify that live.

I also implemented a command runner so the checked-in SQL can be executed with
`pnpm seed:reservations`. It needs a PostgreSQL connection string in the ignored
`.env.local` variable `SEED_DATABASE_URL`. The app's HTTPS Supabase URL and
publishable key are for the API and cannot execute this SQL file. I obtained the
session-pooler connection details, but do not currently have the database password.
Therefore live command-runner execution remains pending. Its tests use a simulated
driver; they are not a successful database seed run.

Once development database credentials are available through the team's private
sharing process, I can configure the connection and run the command twice. I did
not reset the shared password, introduce a service-role key, or weaken access
policies. The runner keeps the SQL transaction, uses one verified TLS connection,
and avoids printing raw connection errors or credentials.

### Current identity input and live table-read limitation

`AuthenticatedUser` currently describes a trusted server-side input contract. It
is not proof of login. For development verification I pass synthetic fixture IDs
from a local script; no browser-accessible endpoint accepts arbitrary user IDs.

I ran `pnpm verify:reservations` through the actual query function and real Supabase
API. The request reached Supabase, but Chef A returned **0 visible rows, expected
4**. The script failed at that mismatch before checking B/C. This does not prove
that the seed is missing or that authenticated access works. RLS is enabled on
`public.users` and `public.booking_event`, while this query's existing client has
no authenticated session. Policies may hide rows; I have not confirmed the exact
policy responsible. SQL Editor access does not establish app access.

While preparing this PR, I found that login PR #2 has now merged into `main` with
`lib/supabase/getUser.ts` (`getCurrentUser`) and `lib/supabase/server.ts`
(`getSupabaseServerClient`). These are the integration points to review with the
auth owner. This PR has not connected the reservation query to those helpers.
Trusted server code must obtain the verified user, confirm/resolve the application
user ID, and pass it to the query. The query must also use the request's database
authorization context so policies recognize the caller. Passing `{ id }` alone
only filters rows; it does not establish a session. I will coordinate that wiring
and the policies with Dhruva/the auth owner before claiming authenticated reads
or cross-chef isolation are verified.

### Recommendation: FullCalendar React with custom amenity controls

I recommend using FullCalendar's weekly time grid, with Timeful as the reference
for the drag-to-select interaction. Timeful demonstrates the experience I want,
but its application uses Vue 2 and focuses on participants' availability. Adapting
its code to our React/Next.js project would require porting components and replacing
availability-poll logic with amenity reservation logic.
[Timeful repository](https://github.com/schej-it/timeful.app),
[Vue 2 dependencies](https://github.com/schej-it/timeful.app/blob/main/frontend/package.json).

FullCalendar supports React, weekly calendar views, and selecting time ranges by
clicking and dragging. I would build amenity checkboxes around the calendar and
display reservation records with amenity labels and approval statuses. I expect
this to require less integration work than adapting Timeful while preserving the
core interaction I want.
[React integration](https://fullcalendar.io/docs/react),
[weekly grid](https://fullcalendar.io/docs/timegrid-view),
[drag selection](https://fullcalendar.io/docs/selectable).

The standard features are MIT licensed. Separate amenity columns would require
evaluating Premium resource views and their licensing. My proposed next step,
after this research sprint, is a small prototype to verify Figma styling, amenity
filtering, and drag behavior. Booking validation and conflict prevention will remain
application responsibilities. [Licensing](https://fullcalendar.io/license).
The two-option comparison, including Timeful's AGPL license, is committed in
`docs/calendar-integration.md`.

## How to review

1. Read `docs/reservation-query.md` and the function's trusted identity contract.
2. Review the owner filter, exact selected fields, ordering, and error handling in
   `actions/supabase/queries/getChefReservations.ts`.
3. Review `scripts/seedReservations.sql`, then the optional runner and live check.
4. Review simulated tests and `docs/calendar-integration.md`.

Validation completed locally: query/runner simulated tests, ESLint, Prettier, and
TypeScript checks. The simulated tests verify requested filters/projection/order,
returned data, empty/error cases, runner configuration, and connection cleanup.
They do not verify PostgreSQL policies, real login, or live seed repeatability.
The standalone test/live-check tooling requires Node 24.14+.

```sh
node --test tests/getChefReservations.test.mjs tests/seedReservations.test.mjs
pnpm run pre-commit
```

No frontend screenshots: this PR adds no UI.

## Next steps

- Confirm a second SQL Editor seed run preserves counts 4, 1, 0.
- Obtain development database credentials and validate `pnpm seed:reservations`.
- Wire the real auth helpers and session-aware client into reservation reads.
- Verify populated/empty reads and cross-chef isolation using real sessions;
  coordinate missing or mismatched policies with Dhruva.
- Prototype the calendar recommendation in a future sprint.

## Relevant links

- [OAK-10](https://linear.app/oakland-bloom/issue/OAK-10/load-supabase-test-reservations-and-research-calendar-integration)
- [Merged login PR #2](https://github.com/calblueprint/oakland-bloom/pull/2)
- [Existing calendar conflict PR #3](https://github.com/calblueprint/oakland-bloom/pull/3) — conflict-helper follow-up stays separate.
- [Figma reference](https://www.figma.com/design/fIt7K04YhxAF4WOn8ll2t2/Oakland-Bloom?node-id=1-10)
