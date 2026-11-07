# WhatsApp Catering Assistant

Chefs can ask about assigned catering requests and confirm an interested/declined
response. Interest is not a booking. The current worker replies only to one
configured test phone and uses a cloud model; local inference is not implemented.

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

OB101/OB102 are open examples, OB103 lacks event details, OB104 is closed,
OB105 is accepted, and OB201 belongs to another chef. Try “list my requests”,
“tell me about OB102”, “I'm interested in OB102”, then “confirm”.

Temporary Meta tokens and tunnel URLs expire. Keep Docker, the worker, and the
tunnel running; update Meta when the URL changes. Run only one reply worker.
`pnpm whatsapp:replies` uses `.env.local` instead of the synthetic database;
apply the WhatsApp migrations in order to that intended project first.
`--reset` belongs to the terminal demo and does not clear Supabase.

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
The worker sends alerts and staff replies without model calls, still limited to
`WHATSAPP_TEST_RECIPIENT`. Outside the reply window, alerts require an approved
template configured with `WHATSAPP_ALERT_TEMPLATE_NAME` and
`WHATSAPP_ALERT_TEMPLATE_LANGUAGE`; its body variables are reference and title.
Missing templates and uncertain sends remain visible for review. No dashboard,
email, or staff-number notifications are added; an admin client consumes this API.

## Code and Checks

- `lib/whatsapp/agent/conversation.ts`: conversation context and model selection.
- `lib/whatsapp/agent/tools.ts`: catering tools and access/confirmation checks.
- `lib/whatsapp/agent/kitchen.ts`: scoped kitchen reads and staff-review requests.
- `lib/whatsapp/agent/replies.ts`: inbox processing, commit, and outgoing delivery.
- `lib/whatsapp/agent/notifications.ts`: gig alerts and staff replies without inference.
- `lib/whatsapp/staffApi.ts`: authenticated staff API validation and dispatch.
- `lib/whatsapp/agent/store.ts`: shared state validation and demo file storage.
- `supabase/migrations/*whatsapp*.sql`: server-only storage and guarded functions.

Run `pnpm test`, `pnpm harness:whatsapp`, `pnpm lint`, `pnpm tsc`, and
`pnpm prettier`. `pnpm db:test` also runs the rolled-back SQL regressions and
checks login and user isolation. See the [handoff checklist](whatsapp-agent-production-plan.md)
for work still required before a real pilot.
