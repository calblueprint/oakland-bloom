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

| Role | How they use it |
|---|---|
| **Chef** | Web dashboard (reservations, profile) + WhatsApp (catering opportunities) |
| **Admin** | Web dashboard (approve reservations, stats, post catering opportunities) |
| **Customer** | Requests catering — flow not yet specified, MVP scope |

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

### Calendar development

Open `/calendar` after signing in. The page uses `getChefReservations()` to load
the signed-in chef's real Supabase bookings; no fixture data is embedded in the UI.
Other chefs' approved occupied periods are fetched separately and shown in gray,
without names, booking IDs, owner IDs, or people counts. All times use
`America/Los_Angeles`. Desktop shows a week; mobile shows three days.

Booking-table RLS and policies are managed manually in Supabase by the backend
team. Enable RLS on `public.booking_event` and allow authenticated SELECT only
where `"user" = (select auth.uid())`. No booking write/admin policies are required
for this read-only prototype. The checked-in
`supabase/migrations/20261028000000_calendar_occupied_periods.sql` defines the
separate authenticated availability function, not the booking-table RLS policy.
Install that function in each target database before using the calendar.

To refresh three demo bookings for the current Los Angeles week, configure the
two existing OAK-10 test accounts and development database as described in
[`docs/reservation-query.md`](docs/reservation-query.md), confirm the database target,
then run:

```sh
SEED_TARGET=development pnpm seed:calendar
```

Chef 1 receives Tuesday 1–2:30 p.m. pending and Thursday 10 a.m.–noon approved;
Chef 2 receives Wednesday 11 a.m.–1 p.m. approved. Reruns refresh only demo IDs
009–011 without duplicates. Existing bookings are preserved. There is no sample-date mode.

Run `pnpm test` for ordinary checks. With the local dev server running and private
test credentials configured, `pnpm test:calendar:live` verifies both accounts'
availability and cross-owner privacy. `pnpm test:seed:live` checks seeding using
temporary tables. Selection currently logs a range; it does not save a booking.
