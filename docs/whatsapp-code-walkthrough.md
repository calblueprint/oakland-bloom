# WhatsApp Code Walkthrough

## The 30-Second Explanation

“There are two separate pieces. The webhook receives Meta messages, checks that
Meta signed them, normalizes their shape, and saves them before returning success.
The conversational agent currently runs locally. It remembers a chef's recent
messages and lets a model request five specific tools. Our code controls which
opportunities that chef can see and requires a separate confirmation before saving
interest. The database migration is proposed, and the webhook is not connected to
the agent or an automatic reply worker yet.”

## Read the Files in This Order

For the conversational demo, start with `conversation.ts`, `tools.ts`, and
`store.ts`: one handles a turn, one defines what the model can do, and one saves
the result. The other files receive and send provider messages.

Paths below are relative to the repository root. Read the public function first;
follow its helpers when you need to explain a particular check.

| File                                                         | Question it answers                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------------------- |
| `lib/whatsapp/inboundMessage.ts`                             | What does a normalized message contain?                             |
| `lib/whatsapp/parseMeta.ts`                                  | How do Meta text, buttons, images, and stickers become that shape?  |
| `lib/whatsapp/parseTwilio.ts`                                | How do Twilio form fields become the same message shape?            |
| `lib/whatsapp/parseCateringResponse.ts`                      | How does the original strict `OB12 yes/no` parser work?             |
| `app/api/whatsapp/webhook/route.ts`                          | Which Next.js GET and POST handlers receive Meta requests?          |
| `lib/whatsapp/webhook.ts`                                    | How are the handshake, signature, parsing, and HTTP result handled? |
| `lib/whatsapp/supabaseIngest.ts`                             | How does the server call the database's `ingest_inbound` function?  |
| `supabase/migrations/20261028000000_whatsapp_agent.sql`      | What storage and ingest behavior is proposed?                       |
| `lib/whatsapp/agent/conversation.ts`                         | How does one message become a complete conversational turn?         |
| `lib/whatsapp/agent/tools.ts`                                | What are the five operations, and which checks guard them?          |
| `lib/whatsapp/agent/store.ts`                                | How are local state, transactions, and replay receipts stored?      |
| `lib/whatsapp/agent/model.ts`                                | How is the explicitly selected live model configured?               |
| `scripts/whatsappAgent.mjs`, `scripts/whatsappAgentDemo.mjs` | How do I run the local agent or its scripted demonstration?         |
| `lib/whatsapp/metaClient.ts`                                 | How could server code call Meta's messaging and media APIs?         |

## Two Paths That Are Not Connected Yet

The current webhook path is:

```text
Meta POST → route.ts → handleMetaWebhook → parseMetaPayload
          → createSupabaseIngest → ingest_inbound RPC → HTTP 200
```

GET handles Meta's subscription challenge instead. POST does not run the model,
download photos, or send a reply. It needs the proposed database function to exist;
an ingest error produces HTTP 503. Status-only callbacks currently parse as an
empty batch; they do not update delivery status records yet.

The separate local path is:

```text
CLI text → normalized fictional message → agent.respond
         → model/tool loop → FileAgentStore commit → terminal reply
```

Default CLI mode uses a scripted SDK mock. Explicit `--live` mode calls a configured
model, but still uses fictional local data and prints replies in the terminal.
Neither CLI mode sends WhatsApp messages or writes to Supabase.

`metaClient.ts` provides send, template, image, reaction, read/typing, and media
transfer methods. These methods are building blocks; the webhook and local agent
do not currently call them. Their existence does not mean automatic replies,
24-hour-window enforcement, or a background worker are implemented.

## Follow One OB12 Conversation

1. The fictional chef says, “Tell me about OB12.” `respond` validates the message,
   checks for an earlier receipt, resolves the chef from the sender's phone, and
   loads that chef's conversation. Unknown senders are rejected.
2. The model requests `get_opportunity({ reference: "OB12" })`. The tool checks
   that OB12 is open and assigned to this chef, then returns stored details,
   including pay and a time formatted for Oakland. The model uses that result to
   explain the gig.
3. The chef says, “That works, count me in.” Recent history supplies the context.
   The model requests `propose_interest` for OB12, with `interested: true` and an
   exact quote from the current message. The tool checks access, the quote, and
   conflicting explicit references. It stores a pending proposal, not a response.
4. The server supplies the confirmation question naming OB12 and the proposed
   interest value. The chef replies “confirm” in a separate message. A proposal
   lasts 15 minutes; an intervening turn invalidates it.
5. The model requests `record_interest({})`. There is no chef ID, reference, or
   interest value to invent in those arguments. Code takes the tuple from the
   valid pending proposal, rechecks access, and appends the interest response.
6. The server supplies the saved-result reply. The local store commits the
   response, conversation, and replay receipt together. The CLI prints it.

This records interest, not a booking. A confirmed change of mind appends another
response instead of erasing the earlier one. `request_human_help` creates a local
review request; it does not notify a staff member.

## What the Model Does, and What Code Does

The model interprets natural language, uses recent context, chooses tools, and
writes ordinary conversational replies. It does not receive unrestricted database
access. A tool call is a request to a named function with validated arguments.
For discovery, `list_opportunities({})` lists only this chef's assigned, open gigs.

Code binds identity to the sender, filters opportunity access, validates tool
arguments, requires confirmation, limits execution, and commits state. The model
gets the last 12 conversation turns and recent responses for this chef. Important
state such as the pending proposal remains separate from conversational prose.
Each turn is limited to six model steps and eight tool executions.

The strict `parseCateringResponse` function is an earlier, independent text parser:
`OB12 yes` becomes a reference and boolean without a model. It is used by the
fixture harness, not as the conversational agent's decision engine.

Images and stickers currently normalize to a media reference plus caption.
Accepting that metadata does not mean the local model sees or understands the
image. Downloading media and supplying image content to the agent are separate
integration work. Unsupported message types are recorded as rejections.

## Why the Reliability Checks Exist

**Signature before parsing:** Meta signs the raw request body with the app secret.
`webhook.ts` computes the matching HMAC-SHA256 and compares it without an ordinary
string equality check. Parsing and reserializing JSON first could change the body
and invalidate the signature. An invalid signature never reaches ingest.

**Save before HTTP 200:** A 200 tells Meta the request was accepted. Returning it
before storage could lose a message if the process stopped afterward. The handler
awaits ingest; a storage failure returns 503 so the provider can retry.

**Idempotency:** A provider can deliver the same message again. Its prefixed ID,
such as `meta:…`, identifies that message across retries. The proposed SQL uses
unique IDs and skips duplicate inserts, including their media side effects.
The local agent instead stores a receipt with the result and returns it on replay
without another model call or response write; changed sender/text/provider fails.

**Local lock and atomic commit:** `FileAgentStore` exclusively creates a lock file
before reading or processing a turn. A competing process fails instead of
overwriting it. Changes stay in a draft until a validated temporary file is written
and renamed over the state file. A failed model turn does not save partial effects.
This is a local file-store design, not the planned production per-chef lease.

## What the Proposed Schema Means

The migration is proposed and has not been applied to the shared database as part
of this work. It describes chefs, opportunities, deliveries, conversations,
messages, media, rejections, pending confirmations, interest history, handoffs,
and chef facts. `ingest_inbound` would save one parsed batch in one transaction.

Row-level security is enabled without client policies; the intended writer is
server code using the secret key. Legacy `whatsapp_user` and `whatsapp_catering`
tables are left untouched. Reviewing the migration is different from applying it.
A database adapter, worker, and outbound delivery flow are still needed to connect
this schema to the conversational agent.

## Demonstrate and Check It Without Credentials

```bash
pnpm agent:whatsapp       # Scripted local conversation; saves fictional state
pnpm harness:whatsapp     # Provider fixtures → normalized messages → strict replies
pnpm test                 # Offline tests, including mocked model/API behavior
pnpm tsc
```

Useful tests to read: `whatsappInbound.test.mjs` for normalization;
`whatsappWebhook.test.mjs` for signatures and storage ordering;
`whatsappAgent.test.mjs` for confirmation, isolation, rollback, and replay;
`whatsappMetaClient.test.mjs` for mocked Meta requests. Mock tests verify our
orchestration and guards; they do not measure a live model's judgment.

## Questions a Reviewer May Ask

**“Can the model write another chef's response?”** No tool accepts a chef ID.
Identity comes from the sender mapping, and reads and writes use that bound chef.

**“Does receiving a message already trigger a bot reply?”** No. The webhook's
storage path and local conversational path are separate today.

**“Why confirm if the model understood the chef?”** Understanding is probabilistic.
The local prototype requires the chef to confirm the exact proposed tuple before
the guarded write. Future product plans are not implemented behavior.

**“What happens if a message is delivered twice or a model call fails?”** A saved
message returns its receipt on replay. A failed local turn rolls back its draft;
webhook storage failure returns 503 rather than reporting success.
