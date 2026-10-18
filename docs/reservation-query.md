# OAK-10 reservations: seed, query, and tests

## Server function

`actions/supabase/queries/getChefReservations.ts` takes no arguments. It calls the
existing `getCurrentUser()` to verify the signed-in user, then uses the cookie-aware
`getSupabaseServerClient()` to read that user's `booking_event` rows. It returns
only ID, amenity, start/end time, people count, and approval status. It includes all
statuses/history and orders by start time then ID. Signed-out requests throw;
successful empty queries return `[]`; database failures throw with the original
cause. An owner-ID filter does not replace database row-level security (RLS).

```ts
const reservations = await getChefReservations();
```

The confirmed owner relationship is `users.userid = booking_event.user`, using the
verified Auth user's ID. The server/client/middleware helpers accept the publishable
key variable with the old anon-key variable as a fallback. No service-role key or
access-policy changes were introduced.

`types/reservations.ts` defines a read-only projection of the known booking columns
because the generated types from main currently include only `user_profiles`. It
does not guess unread array element types or mutation defaults.

## Two focused test accounts

The active fixtures use the project owner's two existing confirmed Auth accounts:

| Account | Auth/application user ID               | Bookings |
| ------- | -------------------------------------- | -------- |
| Chef 1  | `ee90d30c-984c-41c9-8248-bd299ca51f6d` | 4        |
| Chef 2  | `15fe2790-f751-4107-a789-38e3cf1485d6` | 1        |

- `auth.users`: keep both existing login accounts; the seed does not create or modify them.
- `public.users`: the seed creates a matching synthetic profile for each login ID,
  using its existing Auth email. Neither profile has admin privileges. Existing
  edited/mismatched profiles are not overwritten.
- `public.booking_event`: the seed creates the four cases below for Chef 1 and
  one separate approved booking for Chef 2.
- Keep any existing `user_profiles` row for this account; it is not legacy seed data.

No login passwords are stored in seed SQL or test source. Local credentials remain
in ignored `.env.local`. The current seed no longer creates standalone A/B/C users.

| Case          | Booking ID                             | Dates         | People |
| ------------- | -------------------------------------- | ------------- | ------ |
| Pending       | `0a100000-0000-4000-a000-000000000001` | July 10, 2030 | 2      |
| Approved      | `0a100000-0000-4000-a000-000000000002` | July 11, 2030 | 4      |
| Denied        | `0a100000-0000-4000-a000-000000000003` | July 10, 2030 | 3      |
| Past approved | `0a100000-0000-4000-a000-000000000004` | July 10, 2020 | 2      |

Chef 2's separate approved booking is `0a100000-0000-4000-a000-000000000006`,
July 12, 2030, with two people. Both users' expected records live in
`tests/fixtures/reservationCases.mjs`.

Pending and denied share a start time to exercise ID tie-breaking. Expected output
order is **past (004), pending (001), denied (003), approved (002)**. Timestamps have
explicit offsets/UTC; the fixture dates are fixed so they do not shift on reruns.
The future dates will eventually become past. Expected rows are shared by unit and
live tests in `tests/fixtures/reservationCases.mjs`.

The simulated empty-result test needs no third database user. Real isolation tests
use both populated owners, so a denied cross-owner request cannot pass merely
because the requested data does not exist. Both directions are required for the
live suite to pass.

## Seed command

```sh
pnpm seed:reservations
```

Set `SEED_DATABASE_URL` privately in `.env.local` to the development project's
PostgreSQL direct or session-pooler connection on port 5432. It is not the HTTPS
Data API URL or publishable key. Use a database role permitted to insert the test
records. Do not run the seed on production; the runner rejects `NODE_ENV=production`
but cannot identify production from an arbitrary URL.

The runner executes `scripts/seedReservations.sql` on one TLS connection with
certificate/hostname verification. Supabase database hosts use the official public
CA in `scripts/certs/supabase-prod-ca-2021.crt`. Source/fingerprint are documented in
`scripts/certs/README.md`. No OS trust settings are changed. Optionally override
with `SEED_DATABASE_CA_FILE` (absolute or relative to repository root). The runner
closes the connection on success or failure and never prints raw credentials.

The seed runs in a transaction with short-lived write locks. Fixed IDs and
insert-if-missing behavior prevent duplicates; mismatched existing data aborts
instead of being overwritten. Final assertions require two matching profiles and five bookings: four for
Chef 1, one for Chef 2. It does not remove unrelated/legacy rows,
alter policies, or recreate Auth accounts. The empty conflict array `'{}'` inherits
its real type from the database column, without guessing uuid[] versus text[].

The revised command succeeded twice, preserving two profiles and counts 4/1.
SQL Editor remains an alternative: run the entire SQL file, including transaction
and checks, in the development project. Both configured test Auth accounts must exist.

## Tests

Using Node 24.14+:

```sh
node --test tests/getChefReservations.test.mjs tests/seedReservations.test.mjs
pnpm run tsc
pnpm run lint
```

Unit tests simulate auth helpers and HTTP responses. They cover the configured
fixture identity, exact projection/ordering, all four cases, empty results,
signed-out rejection, ignored caller IDs, and auth/database failures. Driver tests
cover seed execution, connection cleanup, verified TLS, and CA overrides/errors.
`tests/support/registerServerTypes.mjs` is test-only support for importing the
server TypeScript module outside Next.js.

For opt-in live testing, keep these values in ignored `.env.local`:

- `RESERVATION_TEST_EMAIL`, `RESERVATION_TEST_PASSWORD`, `RESERVATION_TEST_USER_ID`.
- `RESERVATION_TEST_USER2_EMAIL`, `RESERVATION_TEST_USER2_PASSWORD`, `RESERVATION_TEST_USER2_ID`.

Only blank variable names appear in `example.env`. Then:

```sh
# Terminal 1
RESERVATION_LIVE_TEST_ENABLED=1 pnpm dev --hostname 127.0.0.1
# Terminal 2
pnpm test:reservations:live
```

The live test verifies both owners' stored profiles/fixtures through a separate
read-only SQL connection, then signs in through the real Auth SDK with independent
cookie jars. Each user's cookies are sent to the local opt-in development probe,
which calls `getCurrentUser()` and `getChefReservations()` inside Next.js.

For each chef the test verifies:

1. Actual login, verified Auth ID, and identity recovered by Next.js.
2. Exact owned records, selected fields, and chronological/ID ordering.
3. An unfiltered direct Data API query returns only owned booking IDs. This tests
   database RLS without the server function's `.eq("user", ...)` filter.
4. An explicit query for the other owner returns no rows.
5. A query using the other owner's known booking IDs returns no rows.
6. A URL-supplied other-owner ID cannot override the function's verified identity.

The probe permits only the two locally configured test IDs and no caller-selected
owner. It is disabled outside development and unless explicitly enabled. Responses
are private/no-store. Tests send cookies only to loopback and end their sessions.
No database records, accounts, or policies are modified by the live test itself.
Ordinary tests skip this suite unless explicitly opted in. The login UI is not
exercised; actual Auth SDK sign-in and cookie-backed query execution are exercised.

## Latest live verification

Both real test accounts successfully signed in. The actual cookie-backed server
function returned exactly four reservations for Chef 1 and one for Chef 2.
All 12 live checks passed with no skips. In both directions, unfiltered Data API
reads returned only owned records, querying the other owner or their booking IDs
returned [], and a URL-supplied owner could not override the signed-in identity.
Signed-out access was rejected. These checks exercise the current database RLS
policies as well as the server function; they do not test the login screen.
All 15 simulated query/seed-runner tests also passed. Running the seed twice
succeeded without duplicating fixtures. No authentication accounts or RLS policies
were changed by this work.

## Optional cleanup of replaced Chef 2

The old Auth account is already absent, but its application records remain. They
were deliberately preserved. In Supabase Table Editor, first delete only the
public.booking_event row with ID `0a100000-0000-4000-a000-000000000005`
and owner `b1b51252-74a7-41bf-8adc-f19661fe1e1b`. Then delete the
public.users row whose userid is `b1b51252-74a7-41bf-8adc-f19661fe1e1b`.
If other bookings have since been added for that old user, review them first.

Keep the replacement user `15fe2790-f751-4107-a789-38e3cf1485d6`, its
booking `0a100000-0000-4000-a000-000000000006`, and Chef 1's four records.
Cleanup is optional for the tests; the current seed preserves the old records
and will not recreate them after removal. Never delete profiles by email alone:
the old and replacement application profiles share the same test email.
