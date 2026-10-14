# OAK-10 reservation query

`actions/supabase/queries/getChefReservations.ts` is a server-only data reader.
Its `AuthenticatedUser` input is a trusted contract, not authentication. The project
owner confirmed that its `id` is `users.userid`, also stored in `booking_event.user`.
No Supabase Auth relationship is assumed.

Future authentication code must verify the visitor on the server, resolve their
application user ID, and pass `{ id: verifiedApplicationUserId }` to this function.
Never construct that object from an unverified form field, URL, or browser request.
The function rejects missing/blank IDs but cannot prove who owns a supplied ID.
It is not a Server Action or an HTTP endpoint.

The flow is: trusted server caller → validate ID → query booking_event with owner
filter → order by start_time and id → return six fields. All statuses and past
reservations are included. A successful empty result returns `[]`; database errors
throw an Error with the original database error in `cause`.

The function reuses the existing publishable-key Supabase client. It does not add
credentials, establish a login, or pass the supplied ID as a database token. Thus
it does not make database policies recognize that identity. If policies require a
session, session-aware database integration remains a dependency. Policies may
reject the request or silently hide rows; an empty response alone cannot prove
that no bookings exist. Do not weaken policies or introduce a service-role key.
When authentication arrives, coordinate how a request-specific client carries its
verified database authorization context rather than mutating a shared client's
session across visitors.

## Validation

Run with Node 24.14 or later (the test harness uses Node's synchronous module hooks):

```sh
node --test tests/getChefReservations.test.mjs
pnpm run tsc
pnpm exec eslint actions/supabase/queries/getChefReservations.ts tests/getChefReservations.test.mjs
```

Tests use the real Supabase query builder with intercepted HTTP responses. No real
credentials, user records, or database calls are used. The harness replaces the
Next.js server-only marker only for tests. Synthetic test IDs are not database IDs.
Tests verify owner filters for two identities, the exact projection and ordering
sent to the database, no status/date filters, returned data, empty results,
missing identities, and database errors. They do not test Postgres sorting or RLS.

Pending: real session integration, populated/empty results against seeded data,
and cross-user database-policy checks. Once auth exists, sign in as each test chef
and attempt both owner reads and direct cross-owner reads with the same database
credentials/context. Confirm that a known seeded row is visible to its owner and
hidden from another chef. Review all applicable policies with Dhruva.

## Development seed

**Current setup:** run the full `scripts/seedReservations.sql` file in Supabase SQL
Editor. The project owner reports that this succeeded. This repeatable SQL workflow
satisfies the sprint's seed SQL/script requirement.

**Optional command runner:** `pnpm seed:reservations` is implemented and tested with
a simulated database driver, but cannot be used against the project yet because the
database password is unavailable. Keep it as an optional convenience. Once the team
provides development database credentials through its private sharing process, set
`SEED_DATABASE_URL` locally and validate the command twice against the development
project. Do not reset the shared password merely to enable this command. Neither
command execution against Supabase nor live rerun validation is claimed complete.

Run the seed from the repository root:

```sh
pnpm seed:reservations
```

One-time setup: in your development Supabase dashboard, open **Connect** and copy
its PostgreSQL **direct connection** string or **session pooler** string (port 5432).
Use session mode if your network does not support the direct connection's IPv6
address. Do not use transaction-pooler mode (port 6543): this seed needs a stable
connection for temporary tables and table locks. See the
[Supabase connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres).
Use a database role already permitted to insert these development records.

Add the connection string to the repository's `.env.local` (already ignored by Git):

```dotenv
SEED_DATABASE_URL=postgresql://DATABASE_USER:URL_ENCODED_PASSWORD@DATABASE_HOST:5432/postgres
```

Replace the placeholder parts with your database credentials; percent-encode special
characters in the password. This is a database connection string, not the app's
HTTPS URL or publishable key. Do not paste it into chat, commit it, or give it a
`NEXT_PUBLIC_` prefix. Existing environment variables take precedence over the file.
You can leave this value blank in `example.env`; that file contains no secrets.

The runner loads `.env.local`, validates the configuration, opens one TLS connection
with certificate verification, and executes the checked-in SQL file using Postgres.js
simple-query mode. The SQL owns its transaction. Connection and query timeouts keep
failed attempts from hanging indefinitely. The runner closes its connection on both
success and failure, exits nonzero on failure, and avoids printing raw connection
errors/credentials. `NODE_ENV=production` is rejected, but the runner cannot determine
whether a URL points at production: choose the development project explicitly.

This is a local development database operation, separate from the application's
identity/session flow. It introduces no service-role key or access-policy changes.
A database role's existing grants/RLS rules still apply; do not weaken policies if
execution is denied. The runner never runs on app startup or automatically in CI.

SQL Editor remains an alternative: run the entire `scripts/seedReservations.sql`
file, including its transaction and checks. If a SQL client leaves an errored
transaction open, run `rollback;` before trying again.

The script adds three synthetic application users (not authentication accounts):

| Chef | users.userid                           | Reservations                             |
| ---- | -------------------------------------- | ---------------------------------------- |
| A    | `0a100000-0000-4000-8000-000000000001` | pending, approved, denied, past approved |
| B    | `0a100000-0000-4000-8000-000000000002` | separate approved reservation            |
| C    | `0a100000-0000-4000-8000-000000000003` | none                                     |

The final result should show counts **4, 1, 0**. Run the entire file again: counts
must remain **4, 1, 0**. No unrelated users or bookings should change. The 2020
reservation is past; the other dates are fixed in June 2030. They intentionally do
not shift on reruns, so eventually the 2030 fixtures will also be past. Two of A's
bookings share a start time, allowing validation of the ID tie-breaker.

### Why reruns are safe

- Fixed UUIDs identify the exact same users and bookings every time.
- Existing identical fixtures are skipped, not inserted again or updated.
- A fixed ID with different data causes an error instead of overwriting it.
- A transaction makes the operation all-or-nothing. Constraint failures, collisions,
  or unexpected fixture counts roll back all seed inserts.
- Short-lived table locks prevent concurrent writes between checking and inserting.
  This is a small development operation; do not run it on production.
- No DELETE, UPDATE, policy changes, auth account creation, or service-role key.
  All three synthetic users have `is_admin = false`.
- Fixture emails use `example.invalid`; names and phone numbers are fictional.

`has_conflicts` is a stored array, whereas `calendarConflicts` is a TypeScript
function returning conflicting booking IDs. The seed uses PostgreSQL's empty array
literal `'{}'` inserted into staging columns copied from the actual table. PostgreSQL
therefore resolves the array type itself; no uuid[]/text[] guess is necessary.
The fixture schedules have no overlaps with approved reservations for that amenity.

The column schema and ownership mapping came from the project owner. Additional
constraints are not yet inspected. The fixture amenity is `kitchen`: if an existing
check constraint requires a different value, change the fixture to an accepted
development amenity before the first successful run. If a foreign key requires
additional user provisioning, the seed fails and rolls back; do not disable that
constraint. No Supabase Auth relationship is assumed or created.

### Read the seeded reservations

In SQL Editor, inspect A's rows with the same projection/filter/order as the function:

```sql
select id, amenity, start_time, end_time, num_people, approval_status
from public.booking_event
where "user" = '0a100000-0000-4000-8000-000000000001'
order by start_time asc, id asc;
```

Use B's or C's fixture UUID to check one row or no rows. These are administrative
fixture checks, not proof of login or cross-user database isolation. Do not expose a
browser route that accepts these IDs. A trusted server caller can pass these fixture
identities to `getChefReservations` for development only; the current client may
still need future session integration to satisfy database access policies.

The project owner reports that the seed was successfully run in SQL Editor. The
command runner has not been executed against the real project in this environment.
Live rerun checks and authenticated cross-user policy checks remain pending.

### Runner validation

```sh
node --test tests/seedReservations.test.mjs
```

Runner tests simulate the database driver: they check configuration rejection,
execution of the exact SQL file on one connection, verified TLS, and connection
cleanup/error propagation. They do not contact Supabase or prove SQL repeatability.
After setting the development connection string, run `pnpm seed:reservations` twice;
both executions should finish with the same expected counts (4, 1, 0), checked by
the SQL before committing. SQL/connection errors stop the command with a nonzero
exit status rather than reporting success.

## Read-only live function check

```sh
pnpm verify:reservations
```

Requires Node 24.14+ and the existing `.env.local` Supabase API URL/publishable key,
not a database password. The script calls `getChefReservations` with the fixed
synthetic fixture identities, then checks the expected fields, values, statuses,
chronological/ID order, and counts 4/1/0. No database records or policies change.
A development-only module loader lets standalone Node import the TypeScript
server-only function; application builds still enforce Next.js's server-only marker.

The live attempt reached Supabase but returned **0 rows for Chef A (expected 4)**,
so it failed before checking B or C. A zero-row response may mean RLS hides records,
not that the table is empty. The current publishable-key client carries no verified
login session. Populated reads and policy isolation remain pending the real auth
helper and database authorization integration. Supplying a fixture ID is not login.
See `docs/oak10-pr-notes.md` for the future auth wiring steps.

## Auth helpers now available on main

Login PR #2 merged during PR preparation. Its `lib/supabase/getUser.ts` exports
`getCurrentUser`, backed by `getSupabaseServerClient` from `lib/supabase/server.ts`.
The reservation query is not yet wired to those helpers. Review the verified-user
mapping and request-specific database session with the auth owner before replacing
the current client. The development fixture ID input is not an authentication stub
that should be exposed to browsers.
