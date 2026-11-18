# WhatsApp Catering Assistant

Chefs can ask about assigned catering requests and confirm an interested/declined
response. Interest is not a booking. Local tests reply only to one configured
phone; the hosted pilot supports an explicit recipient allowlist. Both use a cloud
model; local inference is not implemented.

## Try the Offline Demo

```bash
pnpm install
pnpm agent:whatsapp
```

This scripted demo uses fictional data without model credentials or WhatsApp.
`pnpm agent:whatsapp --live` opens a terminal chat with a real model instead.
Add `--reset` to clear that mode's local history and responses, or type `/exit`
to quit. Demo state lives in ignored `.local/whatsapp-agent/` files.

## Chat on WhatsApp with Fake Data

1. Copy `example.env` to `.env.local` and fill in Meta and model settings; the
   test database generates its own Supabase keys. Use
   `WHATSAPP_AGENT_PROVIDER=anthropic` with a native model ID and `ANTHROPIC_API_KEY`,
   or `gateway` with a `provider/model` ID and `AI_GATEWAY_API_KEY`.
2. Set `WHATSAPP_TEST_RECIPIENT` to your verified test phone, country code and
   digits only. Use fictional conversation content: the model receives context.
3. Start Docker, then run:

   ```bash
   pnpm db:test       # Create/start and seed the isolated local Supabase instance
   pnpm whatsapp:test # Keep this running to receive and answer messages
   ```

4. In another terminal, run `cloudflared tunnel --url http://127.0.0.1:3001`.
   Register its `/api/whatsapp/webhook` URL in Meta and subscribe to messages.
   Meta also requires a privacy notice; the test notice is at `/api/whatsapp/privacy`.
   Send a WhatsApp message from the configured test phone to Meta's test number.

The test database is at `http://127.0.0.1:55323`. It contains three accounts,
two businesses, six catering requests, four bookings, and three menu items.
Test keys and login details are saved in ignored `.env.whatsapp-test.local`;
shared project settings stay in `.env.local`. Setup refuses hosted databases.
Repeating `pnpm db:test` preserves responses and chat history. This is a minimal
WhatsApp fixture schema, not the web app's complete onboarding setup.

Run `pnpm db:fixture-ui` and open [the fixture lab](http://127.0.0.1:55325).
Choose a test chef, set their test consent, then create or update catering
requests and bookings. The page shows the latest outbox status. **Generate with
Claude** fills a fictional catering draft for you to check before saving.
Generation needs `ANTHROPIC_API_KEY` and a native Claude `WHATSAPP_AGENT_MODEL`
in `.env.local`. The lab always uses the local fake database and sends no
messages itself.

OB101/OB102 are open examples, OB103 lacks event details, OB104 is closed,
OB105 is accepted, and OB201 belongs to another chef. Try “list my requests”,
“tell me about OB102”, “I'm interested in OB102”, then “confirm”.

Temporary Meta tokens and tunnel URLs expire. Keep Docker, the worker, and the
tunnel running; update Meta when the URL changes. Run only one reply worker.
`pnpm whatsapp:replies` uses `.env.local` instead of the synthetic database;
apply the WhatsApp migrations in order to that intended project first.
`--reset` belongs to the terminal demo and does not clear Supabase.

For a hosted pilot, use `pnpm whatsapp:production` with hosting environment
variables; it never loads local env files. Set `WHATSAPP_RECIPIENTS` to an explicit
comma-separated list of up to 25 approved pilot phones and apply the migrations to
the intended hosted database. This mode rejects synthetic/local database settings.
The server binds `0.0.0.0` on `PORT` (default 3001), exposes `/healthz`, and finishes
its in-flight turn when stopped. Configure one replica with a 90-second shutdown
grace period. Railway's build/start commands are `pnpm exec next typegen && pnpm tsc` and
`pnpm whatsapp:production`; select Node.js 24. Keep real-number registration,
durable credentials, privacy approval, and chef onboarding as separate launch gates.

## How It Works

```text
Signed Meta webhook → Supabase inbox → agent/tools → saved reply → Meta
```

The model has eight tools: list/get catering requests, propose/confirm a response,
request human help, list own kitchen bookings, check kitchen conflicts, and request
kitchen booking review. Code uses a unique international phone match to bind an
existing chef identity, checks linked web-account approval, and restricts access
to that chef's requests.
`whatsapp_catering` and `whatsapp_user` hold product records; `chefs` holds chat state.

Proposals expire after 15 minutes or an intervening message. Only a later explicit
confirmation saves `response_status` and an audit entry; it never changes
`is_accepted`. Closed/accepted requests are read-only. Missing event details remain
unknown. Human help creates a review entry but sends no staff notification.

Kitchen checks expose only the chef's own bookings and whether approved bookings
conflict with a requested slot. They do not establish opening hours or capacity.
A kitchen review request names the amenity, Oakland time range, and people count;
it enters staff review without creating or approving a reservation.

Replies and tool changes commit together. Provider IDs prevent duplicate ingest;
uncertain sends stay `unknown` for manual review and are never blindly resent.
STOP/unsubscribe and staff takeover pause automatic replies. Images and voice
are not enabled; delivery-status callbacks are acknowledged but not stored.

## Staff API and New-Request Alerts

The staff API requires a signed-in administrator. It returns private/no-store JSON;
POST requests require the app's own Origin and `Content-Type: application/json`.
Run `pnpm dev:whatsapp-test` to start the app on `http://127.0.0.1:3000` using the
synthetic database. The test admin's login details are in `.env.whatsapp-test.local`.

| Request                                                          | Purpose                                                  |
| ---------------------------------------------------------------- | -------------------------------------------------------- |
| `GET /api/admin/whatsapp`                                        | List unresolved help requests.                           |
| `GET /api/admin/whatsapp?chefId=<uuid>`                          | Read the last 50 chat/delivery entries.                  |
| `POST` with `action: "takeover"`, `chefId`, `takeover`           | Pause/resume the bot.                                    |
| `POST` with `action: "reply"`, `chefId`, `body`, `requestId`     | Queue one staff reply; reuse the UUID to retry safely.   |
| `POST` with `action: "resolve"`, `handoffId`                     | Resolve one help request.                                |
| `POST` with `action: "consent"`, `chefId`, `optedIn`, `evidence` | Record explicit consent or an opt-out with its evidence. |

Staff replies require takeover and an open 24-hour reply window. Assigned open
catering requests automatically queue alerts only for already opted-in chefs.
Booking creation, edits, approvals, denials, and removal also queue owner-only updates.
Already announced catering requests queue updates when their details or status change.
Rapid edits coalesce before delivery; past events and internal metadata changes are skipped.
The agent chooses a tone and layout from supported options. Code renders the
actual status and event facts in a short message, and the worker checks eligibility
again before sending. Interrupted drafts expire and can be retried. After a two-minute
grace period, uncertain sends move to review and later chat can continue. The worker
never resends those messages automatically. STOP is recorded when the message is
saved, even when the WhatsApp reply window has expired.
Staff replies and approved Meta templates keep their original wording. Delivery is limited to
`WHATSAPP_TEST_RECIPIENT` locally or the explicit hosted pilot list. Outside the reply window, alerts require an approved
template configured with `WHATSAPP_ALERT_TEMPLATE_NAME` and
`WHATSAPP_ALERT_TEMPLATE_LANGUAGE`; its body variables are reference and title.
Missing templates and uncertain sends remain visible for review.
Booking and catering-update notices wait for a fresh reply window; the catering-assignment
template cannot be reused for them. The bot treats accepted notices as past
context and omits notices with a confirmed delivery failure. Kitchen follow-ups
use all reserved equipment and can identify a booking from a quoted notice.

Database wake callbacks use `pg_net` and Supabase Vault. After applying the WhatsApp migrations through
`20261118040000_whatsapp_resume_after_uncertain_send.sql`, set a random 32+ character URL-safe
`WHATSAPP_DATABASE_WEBHOOK_TOKEN` on the worker. With server-only access, call
`configure_wa_database_webhook(callback_url, callback_token)` using the same token and
`https://<worker-host>/api/whatsapp/database-events`. Both values are stored in Vault;
passing both as null disables callbacks. The callback carries only `queue_changed`,
with a short-lived HMAC signature, never chef records or a permanent credential.
Changes wake the worker after commit; a 30-second recovery poll covers missed callbacks.
Verify responses in `net._http_response`; uncertain WhatsApp sends still need staff review.
No dashboard, email, or staff-number notifications are added; an admin client consumes this API.

## Code and Checks

Start with `scripts/whatsappReplies.mjs` for the full flow. It checks inbound
signatures, saves messages, and wakes the worker. A turn reads one chef's
messages and tools, saves the reply, then sends it from the outbox. Proactive
changes follow the same outbox pattern. A draft can be retried, but a send
that may have reached Meta goes to review so it cannot be sent twice.

- `lib/whatsapp/agent/conversation.ts`: conversation context and model selection.
- `lib/whatsapp/agent/tools.ts`: catering tools and access/confirmation checks.
- `lib/whatsapp/agent/kitchen.ts`: scoped kitchen reads and staff-review requests.
- `lib/whatsapp/agent/replies.ts`: inbox processing, commit, and outgoing delivery.
- `lib/whatsapp/agent/notifications.ts`: claim, prepare, send, and record a notice.
- `lib/whatsapp/agent/noticeStyle.ts`: model-selected layout and fixed event facts.
- `scripts/whatsappFixtureUi.mjs`: local test inserts and edits behind the HTML lab.
- `lib/whatsapp/staffApi.ts`: authenticated staff API validation and dispatch.
- `lib/whatsapp/agent/store.ts`: shared state validation and demo file storage.
- `supabase/migrations/*whatsapp*.sql`: server-only storage and guarded functions.

Run `pnpm test`, `pnpm harness:whatsapp`, `pnpm lint`, `pnpm tsc`, and
`pnpm prettier`. `pnpm db:test` also runs the rolled-back SQL regressions and
checks login and user isolation. See the [handoff checklist](whatsapp-agent-production-plan.md)
for work still required before a real pilot.
