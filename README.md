# Oakland Bloom

[//]: # "Delete this section when done!"

This project is being built by a team at [Blueprint](https://calblueprint.org), a student organization at the University of California, Berkeley building software pro bono for nonprofits.

## About

[Oakland Bloom](https://oaklandbloom.org/) is an Oakland-based nonprofit empowering
immigrant and refugee chefs to build sustainable food businesses through shared kitchen
space, equipment access, and catering opportunities. Today they coordinate kitchen usage
and catering by hand over WhatsApp, which creates administrative bottlenecks and limits
how many chefs they can support.

This repo is **two interconnected products**:

### 1. Kitchen management and reservation platform (the bulk of the work)

- **Chefs** view kitchen availability on a calendar, submit reservation requests, track
  them by status (pending / approved / denied), and manage their profile.
- **Admins** review a reservation request queue, approve or deny bookings, manage kitchen
  availability, and see usage statistics (chefs using the kitchen, hours used, hours
  remaining).

### 2. WhatsApp catering coordination bot

Distributes catering opportunities to chefs over WhatsApp, collects their responses, and
keeps a central record of opportunities and who responded — replacing the current
group-chat-and-scrollback workflow.

### Users

| Role         | How they use it                                                           |
| ------------ | ------------------------------------------------------------------------- |
| **Chef**     | Web dashboard (reservations, profile) + WhatsApp (catering opportunities) |
| **Admin**    | Web dashboard (approve reservations, stats, post catering opportunities)  |
| **Customer** | Requests catering — flow not yet specified, MVP scope                     |

### Scope and timeline

- **MTP — 11/30/26.** Auth/onboarding/profiles, chef reservation calendar + dashboard,
  admin reservation queue + calendar, admin dashboard with monthly stats, and the
  WhatsApp catering bot.
- **MVP — May 2027.** Password recovery, account approval, reservation history, admin
  kitchen-availability management, expanded bot automation, user management, deployment
  and handoff.
- **Stretch.** Expanded reservation detail cards, computer-vision equipment inspection,
  equipment cataloging with conflict prevention.

The Statement of Work in Notion is the authoritative scope — this is a summary.

### Docs

- [`docs/whatsapp-bot-research.md`](docs/whatsapp-bot-research.md) — WhatsApp API
  research, provider comparison, proposed bot architecture and message flow (OAK-8).
- [`docs/whatsapp-conversational-agent.md`](docs/whatsapp-conversational-agent.md) —
  setup for the WhatsApp reply worker, synthetic test database, and offline demo.
- [`docs/whatsapp-agent-production-plan.md`](docs/whatsapp-agent-production-plan.md) —
  remaining work before an NPO handoff, including local inference.

## Getting Started

### Prerequisites

Check your installation of `node` and `pnpm`:

```bash
node -v
pnpm -v
```

We strongly recommend using a Node version manager like [nvm](https://github.com/nvm-sh/nvm) (for Mac) or [nvm-windows](https://github.com/coreybutler/nvm-windows) (for Windows) to install Node.js. If you don't plan on switching between different Node versions, you can alternatively get a [prebuilt installer](https://nodejs.org/en/download/prebuilt-installer) from the Node.js website for an easier approach. Make sure to get Node version 20 and up, the latest LTS version should be sufficient.

After installing Node, you most likely have npm installed as well (check by running `npm -v`). If you have npm installed, simply run `npm install -g pnpm` to install pnpm. If your command line does not recognize npm as a command, refer to [this article](https://www.geeksforgeeks.org/how-to-resolve-npm-command-not-found-error-in-node-js/) to troubleshoot.

Additional resources:

- [Downloading and installing Node.js and npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)
- [Installing pnpm without npm](https://pnpm.io/installation)

### Installation

1. Clone the repo & install dependencies

   1. Clone this repo
      - using SSH (recommended)
        ```bash
        git clone git@github.com:calblueprint/oakland-bloom
        ```
      - using HTTPS
        ```bash
        git clone https://github.com/calblueprint/oakland-bloom
        ```
   2. Enter the cloned directory
      ```bash
      cd oakland-bloom
      ```
   3. Install project dependencies. This command installs all packages from [`package.json`](package.json).
      ```bash
      pnpm install
      ```

2. Set up secrets:
   1. In the project's root directory (`oakland-bloom/`), create a new file named `.env.local`
   2. Copy the credentials from Supabase ([e.g. Blueprint's internal Notion](https://app.notion.com/p/calblueprint/rose-environment-setup-279669c1807580cbbb03dc7a08f8a7d9?source=copy_link#27f669c18075808987facd37d36ab8bd) ) and paste any API keys into the `.env.local` file.

**Helpful resources**

- [GitHub: Cloning a Repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/cloning-a-repository#cloning-a-repository)
- [GitHub: Generating SSH keys](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent)

### Development environment

- **[VSCode](https://code.visualstudio.com/) (recommended)**
  1. Open the `oakland-bloom` project in VSCode.
  2. Install recommended workspace VSCode extensions. You should see a pop-up on the bottom right to "install the recommended extensions for this repository".

### Running the app

In the project directory, run:

```shell
pnpm dev
```

Then, navigate to http://localhost:3000 to launch the web application.

### Calendar reservations

Open `/calendar` with an approved account. Choose one or more amenities (Bar Prep
Table, Salad Bar Table, Oven) under **Book amenities**, then click a time cell or
drag a range. Move or resize the draft on the calendar, or edit its time in the
form. **Enter a time instead** provides keyboard date and time inputs as an
alternative to pointer selection.
Past selections open the form, but submission requires a future start time.
Complete the title, chef count, and optional additional contact emails. The owner
name/email come from the signed-in account. Times are interpreted in
`America/Los_Angeles`; ambiguous or nonexistent daylight-saving times are rejected.
Cancel discards the form. A successful submission appears as **pending**, never as
an approved booking. `/chef/reservations` now reads the same saved database records.
Availability shading reflects how many selected amenities are free, using actual
approved bookings. Click your saved bookings to view their details; saved bookings
are read-only in this flow.

The database change is in
`supabase/migrations/20261108000000_booking_requests.sql`. Apply it through the
team's migration workflow before running this version against another database,
then run `pnpm types:database` and format `types/database.types.ts`. It adds a
required title, a constrained amenities array, and up to ten additional contact
emails. Existing `kitchen` records are conservatively mapped to all three amenities;
other unrecognized values cause migration validation to fail for explicit review.
The singular `amenity` column remains for compatibility and is synchronized by a
trigger. The migration builds on the project's existing booking and account tables.

Chef writes use the session-authenticated `create_booking_request` RPC. It checks
account approval, validates the request, fixes ownership and pending status, and
uses a request UUID to make retries idempotent. Direct chef writes stay revoked.
A database trigger serializes booking writes and rejects overlap with approved
bookings sharing any amenity, including when a pending request is later approved.
Adjacent bookings and overlapping pending requests are allowed. No emails are sent.

Ownership RLS limits direct booking reads to the signed-in chef. Other chefs'
approved availability is read separately through `get_calendar_occupied_periods`;
it returns only merged amenity/time intervals, excluding titles, contacts, owners,
booking IDs, and people counts. Availability is refetched on date/filter changes
and submission; it is not a realtime subscription. If loading fails, the calendar
warns that empty times are not confirmed available. Shading does not imply capacity.

For four current-date demo bookings, configure `RESERVATION_TEST_USER_ID`,
`RESERVATION_TEST_USER2_ID`, and the development `SEED_DATABASE_URL` in `.env.local`.
Both Auth accounts and their application profiles must already exist. Confirm the
database target, then run:

```sh
SEED_TARGET=development pnpm seed:calendar
```

| Account     | Today                                  | Tomorrow                            |
| ----------- | -------------------------------------- | ----------------------------------- |
| Test user 1 | 10–11 a.m., approved, both prep tables | 1–2 p.m., pending, oven             |
| Test user 2 | 2–3 p.m., approved, oven               | 10–11 a.m., denied, salad bar table |

Reruns refresh the same four demo IDs (prefix `0a150000`, endings `001`–`004`)
with titles and current Los Angeles dates, without duplicates. Accounts, policies,
and unrelated bookings are preserved. Four demo rows do not necessarily mean four
total rows. The older `seed:reservations` command still serves its fixed OAK-10
fixtures; use `seed:calendar` for this flow.

For a manual check, sign in as each test user and verify amenity filtering, a
cancelled form, an invalid end-before-start request, and a valid future request.
Confirm the saved event says pending and appears in Your reservations. Check that
other chefs' private titles/contacts never appear in the availability response.
Repeat at mobile width. `pnpm test` covers request validation, action retries,
unique migration versions, and Los Angeles time conversion offline. To test the
database rules too, set `BOOKING_TEST_DATABASE_URL` to a local Supabase PostgreSQL
server with database-creation access and run `pnpm test`. The database tests create
and remove an isolated test database; they reject remote hosts and never modify
the server's existing databases.

## Auth setup

1. Copy `example.env` to `.env.local` and fill in the values from Supabase
   (Project Settings > API Keys). `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is the
   publishable key. `SUPABASE_SECRET_KEY` is the secret key, is server
   only, and must never be prefixed with `NEXT_PUBLIC_`.
2. Install dependencies with `pnpm install`.
3. Apply database migrations.
   - Shared dev project: `pnpm supabase link --project-ref <ref>` then `pnpm supabase db push`
   - Local Supabase: `pnpm supabase start` then `pnpm supabase db reset`
4. Run `pnpm dev`.
5. Making the first admin: sign up in the app, then run this in the Supabase
   SQL Editor with your email:

   ```sql
   update public.users set is_admin = true, is_approved = true where email = 'you@example.com';
   ```

### Email lookup

The Start screen calls the `continueWithEmail` server action, which calls the
`email_exists` Postgres function using the secret key. The function can't be
called with the publishable key. Lookups are limited to 10 per client per
10 minutes. To reset the limit during development, run
`delete from private.email_lookup_attempts;` in the SQL Editor.
