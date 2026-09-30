# WhatsApp Catering Bot — API Research & Proposed Architecture

**Status:** research spike, no implementation
**Sprint:** OAK-8
**Date:** 2026-09-29
**Author:** Stephen Hung

Research spike to pick a WhatsApp API provider for the catering-opportunity bot and
propose the infrastructure. No bot code in this PR.

Sections I–IV cover the provider decision and a deterministic v1. Section V proposes the
agentic layer built on top of it.

---

## TL;DR

1. **The existing group-chat workflow cannot be automated.** Meta shipped a Groups API,
   but it caps groups at **8 participants**, is invite-only, and requires Official
   Business Account status — which is gated behind a press-notability bar Oakland Bloom
   cannot realistically clear. It cannot attach to the group they already use.
   Group broadcast stays **manual**.
2. **Recommendation: build on Twilio's sandbox now, go direct to Meta Cloud API for
   production.** Twilio's sandbox needs no Meta account and no business verification,
   so we can build the whole webhook this sprint while verification paperwork runs in
   parallel.
3. **Attribution is the real engineering problem**, not sending. Inbound webhooks give
   us a phone number and nothing else. Solved with a short `ref_code` per opportunity
   plus a `wa.me` deep link.
4. **Pricing changes in two days.** Service messages and in-window utility templates
   become billable **October 1, 2026**. Budget accordingly.
5. **An agentic layer is proposed in §V** — LLM reply parsing, conversational replies,
   admin drafting, and an autonomous ops loop — layered on top of the deterministic v1,
   not replacing it. Adds **under $1/month**. Ship v1 first.

---

## I. API comparison

### The group-chat question (answered first — it drives everything)

The sprint brief asks whether providers "support our existing group-chat workflow."
Verified answer: **no, and effectively no provider does.**

Meta does now have a Groups API, which contradicts the widely-repeated claim that the
WhatsApp Business Platform has no group support. But the limits make it unusable here:

| Constraint                     | Value                                                               |
| ------------------------------ | ------------------------------------------------------------------- |
| Max participants per group     | **8**                                                               |
| Max groups per business number | 10,000                                                              |
| Eligibility                    | Official Business Account (OBA) required — see notability bar below |
| How participants join          | Invite link only — business cannot add people directly              |
| Pre-existing consumer groups   | Not supported; groups must be created via the API                   |
| Not supported in groups        | auth templates, interactive messages, commerce, edit/delete         |

Source: [Groups API](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups),
[Get started with Groups](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/get-started)

**The OBA gate is the real blocker.** OBA (the blue checkmark) requires "notability" —
per 360dialog's onboarding guidance, roughly **5+ links to coverage in reputable external
publications within the past 12 months** (your own site and socials don't count), plus
30+ days on platform, completed business verification, two-step verification, and an
approved display name. Denials cannot be appealed and require a 30-day wait to reapply.
A small community nonprofit will not clear this. Treat the Groups API as unavailable.
([Meta: Official Business Accounts](https://developers.facebook.com/documentation/business-messaging/whatsapp/official-business-accounts),
[360dialog OBA guidance](https://docs.360dialog.com/docs/resources/phone-numbers/official-business-account)
— the notability specifics come from 360dialog, as Meta's own page does not quantify them)

Group sends are also billed **per delivered recipient** at the normal per-message rate —
a 5-person group costs 5 messages. No group discount.
([Groups pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/pricing))

So the Groups API is for small collaboration pods, not roster broadcast. An 8-person
cap doesn't cover a chef roster, and we could not add the existing group anyway.

**Twilio has no WhatsApp group support at all** — its 1:1 model only.

**Unofficial libraries** (`whatsapp-web.js`, Baileys) drive WhatsApp Web and _do_
support real groups. They violate WhatsApp's Terms of Service and risk the number
being banned. **Not recommended for a nonprofit's primary contact number** — losing
that number would be worse than the manual workaround.

### Meta WhatsApp Cloud API vs Twilio

|                       | **Meta Cloud API (direct)**                                     | **Twilio (BSP)**                                                  |
| --------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------- |
| Account setup         | Meta Business Portfolio + app + WABA + System User token        | Twilio account; Meta setup brokered via Twilio                    |
| Business verification | Not needed to test; needed to scale past 250/day                | Same Meta verification still required for production              |
| Sandbox               | Test WABA + test number, auto-created, no payment method needed | **Shared sandbox number, no Meta account or verification at all** |
| Sandbox opt-in        | Pre-register recipient numbers in API Setup                     | User texts `join <code>` to `+1 415 523 8886`                     |
| Sandbox expiry        | n/a                                                             | **Re-join every 3 days**                                          |
| Group chats           | Groups API, 8-participant cap, OBA-gated                        | None                                                              |
| Per-message cost      | Meta rate only                                                  | Meta rate **at cost** + **$0.005/msg** Twilio fee                 |
| Monthly fees          | None documented                                                 | No monthly WhatsApp sender fee documented                         |
| Webhook auth          | `X-Hub-Signature-256` (HMAC-SHA256, app secret)                 | `X-Twilio-Signature` (`validateRequest()` helper)                 |
| Node SDK              | REST via `fetch`                                                | `twilio` npm package                                              |

Sources: [Get started](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started),
[About the platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform),
[Twilio WhatsApp pricing](https://www.twilio.com/en-us/whatsapp/pricing),
[Twilio sandbox](https://www.twilio.com/docs/whatsapp/sandbox)

### Other providers considered

| Provider                      | Model                                                                         | Verdict                                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **360dialog**                 | €49/mo per number, **zero per-message markup** (billed at Meta's rate card)   | Cheapest at high volume, but a flat €49/mo dwarfs our ~$1/mo usage. Rejected on cost.                  |
| **Infobip**                   | Quote-based, no published rates; 1,000 free service conversations/mo per WABA | Enterprise sales motion, no self-serve pricing. Wrong fit for a student team.                          |
| **WATI**                      | Self-serve SaaS, per-seat ($24–69/user/mo add-ons)                            | An inbox product for humans, not an API-first build. Rejected.                                         |
| **whatsapp-web.js / Baileys** | Unofficial, drives WhatsApp Web                                               | **Only** route to real full-size groups, but ToS-violating with documented bans. Rejected — see below. |

On the unofficial libraries: ban risk is documented and active, not theoretical. Open
issues on Baileys' own repo report bans on numbers with years of clean history
([#1869](https://github.com/WhiskeySockets/Baileys/issues/1869),
[#1925](https://github.com/WhiskeySockets/Baileys/issues/1925)), and a third-party
"anti-ban" middleware exists whose author concedes no protection is foolproof. Losing
Oakland Bloom's primary contact number is a far worse outcome than pasting a message
by hand.

### Twilio inbound webhook shape (if we use Twilio)

Twilio POSTs **form-encoded**, not JSON. Key params for a WhatsApp text:
`MessageSid`, `AccountSid`, `From` (`whatsapp:+1555…`), `To`, `Body`, `NumMedia`,
plus WhatsApp-specific `ProfileName` and `WaId`. Signature is `X-Twilio-Signature`
(**HMAC-SHA1** over auth token + full URL + sorted params) — validate with
`validateRequest()` from the `twilio` npm package rather than hand-rolling it. Respond
with either TwiML or an empty 200.

Note the differences from Meta that the adapter must absorb: form-encoded vs JSON,
SHA1 vs SHA256, `MessageSid` vs `messages[0].id`, `whatsapp:+E164` prefix vs bare digits.

Sources: [Twilio webhook request](https://www.twilio.com/docs/messaging/guides/webhook-request),
[webhook security](https://www.twilio.com/docs/usage/webhooks/webhooks-security)

### Phone number requirements

Oakland Bloom has no business number, so this is net-new setup.

- A number **already registered on consumer WhatsApp cannot be used** unless deleted
  from WhatsApp first. Direct quote: _"Numbers already in use with WhatsApp cannot be
  registered unless they are deleted first."_
- Must have country + area code (no short codes) and be able to receive SMS or voice.
- **VoIP numbers are marked "Not Recommended"** for SMS verification; voice
  verification is more reliable. A Google Voice / Twilio number may not pass.
- Requires a two-step verification PIN at registration.
- Display name goes through review (`name_status`: `APPROVED`, `PENDING_REVIEW`, …).

Source: [Business phone numbers](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers)

**Action item:** acquire a dedicated mobile number not currently on WhatsApp.

### Templates and the 24-hour window

- A user messaging us opens/resets a **24-hour customer service window**. Inside it we
  can send free-form messages. Outside it, **only pre-approved templates**.
- Categories: `marketing`, `utility`, `authentication`.
- Review takes **up to 24 hours**.
- Variables are either named `{{first_name}}` or positional `{{1}}`.
- Template cap: **250** while the portfolio is unverified, up to 6,000 once verified.

Because a broadcast is business-initiated, **the opportunity blast must be a template**.
Chef replies then open the window, so our follow-ups can be free-form.

### Messaging limits

Tiers are **250 → 2,000 → 10,000 → 100,000 → Unlimited** unique recipients/day, set at
the **business portfolio** level. New accounts start at **250/day** — plenty here.
Throughput default is 80 messages/second. Per-recipient limit is 1 message / 6 seconds.

Sources: [Messaging limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits),
[Templates overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview)

### Costs

Meta moved from conversation-based to **per-message** pricing on July 1, 2025. Charged
on delivery, priced by template category and recipient country.

**Free as of today (2026-09-29):**

- Non-template (service) messages inside an open customer service window
- Utility templates inside an open customer service window
- All messages inside a **Free Entry Point window, which lasts 72 hours**

**⚠️ Changing October 1, 2026 — two days from now:**

- _"Effective October 1, 2026, Meta will charge for service messages, which have not
  been charged since November 2024."_
- _"Effective October 1, 2026, Meta will charge for utility messages sent in response
  to users within an open 24-hour customer service window."_

Source: [Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing),
[Upcoming non-template pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages)

**Verified US rate:** Twilio's pricing page publishes Meta's utility-template fee as
**$0.0034/message** outside the customer service window, with _"no charge for messages
during the customer service window"_ (that in-window exemption ends Oct 1, 2026).
([Twilio WhatsApp pricing](https://www.twilio.com/en-us/whatsapp/pricing))

Marketing and authentication rates are **not verified** — Meta's full rate cards sit
behind a JS selector and CDN-hosted CSVs that automated fetching can't read. Before
finalizing a budget, open
[business.whatsapp.com/products/platform-pricing#rates](https://business.whatsapp.com/products/platform-pricing#rates)
in a real browser and record the marketing rate. Our broadcast should qualify as
**utility**, not marketing, so $0.0034 is the number that matters most.

**Cost math at Oakland Bloom's scale.** Assume ~30 chefs and 4 opportunities/month:

|                                           | Meta direct               | Twilio                     |
| ----------------------------------------- | ------------------------- | -------------------------- |
| Outbound (30 × 4 = 120 utility templates) | 120 × $0.0034 = **$0.41** | + 120 × $0.005 = **$1.01** |
| Inbound replies (~120)                    | free                      | + 120 × $0.005 = **$0.60** |
| **Monthly total**                         | **~$0.41**                | **~$1.61**                 |

Both are rounding errors against a nonprofit budget. **Cost is not the deciding factor —
setup friction and time-to-first-working-webhook are.** That shapes the recommendation.

### Verified vs still needs testing

**Verified in official docs:** group limits and invite-only model; the "already on
WhatsApp" number restriction; VoIP discouraged; 24h window + template rules; 24h
template review; tier ladder from 250; inbound webhook payload shape; signature
verification; 36-hour retry with no exactly-once guarantee; 72-hour FEP window; the
Oct 1 2026 pricing changes; Twilio $0.005/msg and at-cost Meta pass-through; Twilio
sandbox join-code, 3-day expiry, no verification needed.

**Still needs testing:**

- Exact USD per-message rates (see above).
- Whether a specific acquired number passes registration — carrier-dependent.
- Test-number recipient cap: commonly cited as 5, **not confirmed** in official docs.
- Business verification document list and turnaround — docs link to Help Center only.
- Whether OBA status is even attainable for a small nonprofit (it implies notability).
- Twilio free trial credit amount — not stated on the pricing page.
- Twilio's webhook retry/backoff behavior on non-200 — not documented in the pages
  checked. Meta's 36-hour retry policy **is** documented; don't assume Twilio matches it.
- Marketing-template USD rate (only the $0.0034 utility rate is confirmed).

---

## II. Proposed infrastructure

### Architecture

```
  ┌──────────────┐                    ┌──────────────┐
  │ Admin (web)  │                    │ Chef's phone │
  │  Next.js UI  │                    │   WhatsApp   │
  └──────┬───────┘                    └──┬────────▲──┘
         │ 1. create opportunity          │ 3.     │ 2. broadcast
         │ 6. view responses              │ reply  │   (template or
         ▼                                ▼        │    manual post)
  ┌────────────────────────────────────────────────┴───┐
  │          Next.js on Vercel (one deployment)        │
  │                                                    │
  │  app/api/whatsapp/webhook/route.ts   ◀── inbound   │
  │  actions/whatsapp/send.ts            ──▶ outbound  │
  │  app/admin/opportunities/...                       │
  └──────────────────────┬─────────────────────────────┘
                         │ service-role key (server only)
                         ▼
              ┌──────────────────────┐
              │      Supabase        │
              │  chefs               │
              │  opportunities       │
              │  responses           │
              │  inbound_unmatched   │
              └──────────────────────┘
```

The provider (Meta or Twilio) sits between WhatsApp and our route handler in both
directions.

### Where the webhook lives

**In this same Next.js app**, as an App Router route handler at
`app/api/whatsapp/webhook/route.ts`. No separate service.

- Both providers require a public **HTTPS** endpoint with a valid certificate
  (self-signed is rejected). Vercel gives us that for free on every deploy.
- One repo, one deploy, no extra infra cost or ops burden for a student team.
- Preview deployments give us a throwaway URL per PR for webhook testing.

Trade-off: serverless handlers are short-lived, so the handler must **acknowledge fast
and keep work minimal**. Our work is a couple of DB writes, so this is fine. If it ever
grows (LLM parsing, fan-out retries), move to a queue.

### Credentials

All server-side environment variables in Vercel — **never** `NEXT_PUBLIC_*`:

```
WHATSAPP_ACCESS_TOKEN        # Meta System User permanent token
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_APP_SECRET          # for X-Hub-Signature-256 verification
WHATSAPP_WEBHOOK_VERIFY_TOKEN
SUPABASE_SERVICE_ROLE_KEY    # server-only
```

**⚠️ Gotcha in this repo:** `actions/supabase/client.ts` builds a client from
`NEXT_PUBLIC_SUPABASE_ANON_KEY`. A webhook request carries **no user session**, so RLS
will reject its inserts. The implementation needs a **separate server-only
service-role client** (e.g. `actions/supabase/serverClient.ts`) used solely by the
webhook. Do not swap the existing client — browser code must keep using the anon key.

Keep RLS enabled on all tables. Admin reads go through authenticated sessions; only the
webhook path uses the service role.

### Data model

```sql
create table chefs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- E.164. The ONLY join key an inbound webhook gives us.
  whatsapp_phone text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_date date not null,
  location text,
  headcount int,
  details text,
  -- Short human-typeable code echoed in the broadcast, e.g. "OB12".
  -- Lets a chef reply "OB12 yes" so we can attribute with no conversation state.
  ref_code text not null unique,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table responses (
  id uuid primary key default gen_random_uuid(),
  chef_id uuid not null references chefs(id),
  opportunity_id uuid references opportunities(id),
  interest text not null,           -- 'yes' | 'no' | 'unclear'
  raw_body text not null,           -- always keep the original text
  -- Provider message id. UNIQUE gives idempotency against webhook retries.
  provider_message_id text not null unique,
  received_at timestamptz not null default now(),
  needs_review boolean not null default false
);

-- Unknown number, or no opportunity resolved. Triage queue, never drop input.
create table inbound_unmatched (
  id uuid primary key default gen_random_uuid(),
  from_phone text not null,
  raw_body text,
  provider_message_id text not null unique,
  received_at timestamptz not null default now()
);
```

---

## III. Message flow, end to end

### 1. Admin enters the opportunity — automated

Form in the admin UI. A server action inserts into `opportunities` and generates a short
`ref_code` (e.g. `OB12`).

### 2. Shared with chefs — partly manual

- **Path A (automated 1:1 fan-out):** loop active chefs, send each an approved
  **template**. Business-initiated, so a template is mandatory. Gives real delivery
  status per chef.
- **Path B (manual group post):** admin copies generated text and pastes it into the
  existing WhatsApp group by hand. Preserves the group dynamic the org already relies on.

Both paths embed the same deep link.

### 3. Chef opens an individual chat — chef action

The broadcast contains a click-to-chat link:

```
https://wa.me/<business_number>?text=OB12%20-%20I%27m%20interested
```

Tapping it opens a **1:1 chat with the bot, pre-filled with the ref code**. This is the
key design move: it makes attribution work **even in the manual group path**, with no
conversation state on our side. Meta also has a QR Codes API that returns a
`deep_link_url` plus image if we want a printable version.

### 4. Provider delivers the reply — automated

Provider POSTs to `app/api/whatsapp/webhook`. Meta's payload for a text message:

```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "<WABA_ID>",
      "changes": [
        {
          "field": "messages",
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "...",
              "phone_number_id": "..."
            },
            "contacts": [
              { "profile": { "name": "Jane Chef" }, "wa_id": "1555..." }
            ],
            "messages": [
              {
                "from": "1555...",
                "id": "wamid.HBg...",
                "timestamp": "1758254144",
                "type": "text",
                "text": { "body": "OB12 yes" }
              }
            ]
          }
        }
      ]
    }
  ]
}
```

Handler order:

1. **Verify the signature** (`X-Hub-Signature-256`, HMAC-SHA256 over the _raw_ body with
   the app secret). The endpoint is public — anyone can POST to it.
2. **Return 200 immediately.** A slow or failing handler triggers retries.
3. Then parse and persist.

The `GET` handler answers Meta's verification handshake: compare `hub.verify_token`,
echo back `hub.challenge`.

### 5. Match and save — automated, with manual fallback

- **Chef:** look up `chefs.whatsapp_phone` against a normalized `from`.
- **Opportunity:** parse `ref_code` from the body; if absent, fall back to the most
  recent open opportunity sent to that chef.
- **Interest:** keyword match yes/no. Ambiguous → `interest = 'unclear'` and
  `needs_review = true`. **We do not guess** — a wrong "yes" means a chef is booked for
  a gig they declined.
- **Insert** into `responses`; `ON CONFLICT (provider_message_id) DO NOTHING` makes
  replay safe.
- Unknown number or unresolvable opportunity → `inbound_unmatched`. Never silently drop.

### 6. Admin views responses — automated

Admin page joins `responses` → `chefs` + `opportunities`, flags `needs_review`, and
shows the unmatched inbox separately.

### Automated vs manual

| Automated                         | Manual                                                      |
| --------------------------------- | ----------------------------------------------------------- |
| Opportunity creation              | Business verification + number acquisition (one-time)       |
| 1:1 template fan-out              | Template submission + Meta approval (one-time per template) |
| Webhook receipt + signature check | Posting to the existing group (Path B)                      |
| Chef + opportunity matching       | Triaging `needs_review` and unmatched rows                  |
| Keyword classification            | Final chef selection for the gig                            |
| Dedupe, admin dashboard           |                                                             |

### Failures and duplicates

- **Retries:** Meta retries immediately, then with decreasing frequency **over 36 hours**,
  dropping unacknowledged events after that. Batches can contain up to 1000 updates and
  batching _"cannot be guaranteed."_ There is **no exactly-once guarantee** — dedupe is
  our responsibility, handled by the unique `provider_message_id`.
- **Outbound send failure:** record per-chef send status, retry with backoff, surface
  persistent failures to the admin rather than failing silently.
- **Chef changes their mind** ("yes" then "actually no"): keep every row. The dashboard
  shows the latest per (chef, opportunity) but retains history.
- **Our endpoint down:** provider queues and redelivers within the 36-hour window, so
  nothing is lost once we return 200 again.
- **Unknown sender:** goes to `inbound_unmatched` for triage — likely a chef whose number
  we recorded in a different format.

---

## IV. Recommendation

**Develop against Twilio's sandbox. Ship production on Meta Cloud API direct.**

Why this split:

1. **Unblocks this sprint immediately.** Twilio's sandbox needs no WhatsApp Business
   Account, no business verification, and no phone number — a tester just texts
   `join <code>`. We can build and test the entire webhook + matching pipeline while
   Oakland Bloom's verification paperwork and number acquisition proceed in parallel.
   That's the single biggest schedule risk removed.
2. **Meta direct for production** avoids Twilio's $0.005/msg on top of Meta's rate, and
   the Groups API (should OBA ever become attainable) is Meta-only. At our volume the
   savings are small, but there's no offsetting benefit to the middleman once
   verification is done.
3. **The provider is an implementation detail if we design for it.** Keep a thin
   `actions/whatsapp/` adapter — `sendTemplate()` and `parseInboundWebhook()` — so the
   provider swap touches two files. Do this from day one.

Both providers ultimately require the same Meta business verification, so Twilio is not
a way to skip it — only a way to not be _blocked_ by it.

### Fallback if the group post or business number is impractical

- **Group posting is impractical → already assumed.** The recommendation does not depend
  on automated group posting. Manual paste (Path B) plus the `wa.me` deep link is the
  primary broadcast plan; automated 1:1 template fan-out (Path A) is the upgrade once
  templates are approved.
- **Business number impractical / verification stalls →** stay on the Twilio sandbox for
  an internal pilot with a handful of chefs re-joining every 3 days. Ugly but it proves
  the pipeline.
- **Verification blocked entirely →** fall back to **SMS via Twilio**, which needs no
  Meta verification. Same webhook, same matching logic, worse UX. The adapter makes this
  a small change — another reason to build it.
- **Explicitly rejected:** `whatsapp-web.js` / Baileys for group automation. ToS
  violation with real ban risk on the org's primary number.

### Next steps

1. Open the rate card in a browser and record real USD rates.
2. Acquire a dedicated mobile number, not on consumer WhatsApp.
3. Start Meta Business Portfolio verification — long lead time, start first.
4. Build the webhook against the Twilio sandbox.
5. Draft the opportunity-broadcast template and submit for review.
6. Confirm whether OBA (and thus Groups API) is realistic for a nonprofit.

---

## V. Agentic architecture

Sections I–IV describe a **deterministic** bot: regex for the ref code, keyword match
for yes/no. That is the right v1 and it should ship first. This section describes the
agentic layer to build on top of it, and — more importantly — **where the line between
LLM and plain code sits**, because getting that wrong is how this becomes expensive and
flaky.

### The governing rule

> Use the model for judgment. Use code for everything deterministic.

Concretely:

| Job                                               | Owner                               | Why                                                                         |
| ------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------- |
| Parse `OB12` out of a message                     | **code** (regex)                    | Deterministic. An LLM here is slower, costlier, and can hallucinate a code. |
| Look up chef by phone number                      | **code** (SQL)                      | It's a database join.                                                       |
| Dedupe on `provider_message_id`                   | **code** (unique index)             | Correctness primitive, not a judgment.                                      |
| Decide whether "cant do sat, sun works?" is a yes | **LLM**                             | Genuine ambiguity. Regex cannot do this.                                    |
| Draft broadcast copy for a gig                    | **LLM**                             | Writing.                                                                    |
| Rank which chefs to contact                       | **LLM over code-fetched data**      | Judgment, but the _data_ comes from SQL.                                    |
| Decide to send a message                          | **code** (with human approval gate) | Irreversible side effect. Never let the model do this unsupervised.         |

The deterministic path stays the **fast path**: if the regex finds `OB12` and the body
matches `/^(yes|yeah|y|in|i'?m in)$/i`, we save it and never call the model. The LLM is
the **fallback for the messy 30%**, not the default path. This keeps cost near zero and
means an API outage degrades to v1 behavior rather than breaking the bot.

### Layer 1 — Smart reply parsing

Replaces `interest: 'unclear' → needs_review` with structured extraction.

Today's regex fails on nearly every real message: _"cant do sat but sunday works"_,
_"how many ppl again?"_, _"im in if maya is doing it too"_, _"yes but only if it's not
the taco thing again"_. All of those currently land in the triage queue, which means a
human reads them anyway and the bot saved nobody any work.

Use **structured outputs** so the response is schema-valid rather than parsed prose:

```ts
// actions/whatsapp/parse.ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const REPLY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["interest", "confidence"],
  properties: {
    interest: { enum: ["yes", "no", "conditional", "question", "unrelated"] },
    confidence: { enum: ["high", "low"] },
    availableDates: { type: "array", items: { type: "string" } },
    conditions: { type: "array", items: { type: "string" } },
    question: { type: "string" },
    refCode: { type: "string" },
  },
} as const;

export async function parseReply(body: string, context: OpportunityContext) {
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: PARSE_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    output_config: { format: { type: "json_schema", schema: REPLY_SCHEMA } },
    messages: [{ role: "user", content: formatContext(body, context) }],
  });
  return extractJson(response);
}
```

**Model choice: Haiku 4.5** ($1/$5 per MTok). This is classification with a fixed
schema — the easiest possible LLM task. Opus would be waste. Cache the system prompt so
the instruction block is ~90% cheaper on every call after the first.

**Cost:** a reply is roughly 400 input + 100 output tokens ≈ **$0.0009**. At 120 replies
a month that's **≈ $0.11/month**. Against the WhatsApp bill of ~$0.41 this is noise.

**`confidence: "low"` still routes to `needs_review`.** The LLM shrinks the triage queue;
it does not eliminate human review. A wrong "yes" books a chef for a gig they declined,
so the bar for auto-accepting stays high.

### Layer 2 — Conversational replies

The chef asks _"how much does it pay?"_ and the bot answers from the opportunity record.

This needs **tool use** — the model reads data, it doesn't invent it:

```ts
const tools = [
  {
    name: "get_opportunity",
    description: "Fetch full details for one catering opportunity by ref code.",
    input_schema: {/* … */},
    strict: true,
  },
  {
    name: "record_response",
    description:
      "Save this chef's interest. Call only when intent is unambiguous.",
    input_schema: {/* … */},
    strict: true,
  },
];
```

Use the SDK's **tool runner** (`client.beta.messages.toolRunner`) rather than
hand-writing the `while (stop_reason === "tool_use")` loop — its per-turn hooks are
where the approval gate goes.

Three hard constraints:

1. **Read tools are free to run; write tools need a gate.** `get_opportunity` executes
   immediately. `record_response` is fine to auto-run (it's reversible and reviewable).
   Anything that _sends a message_ or _confirms a booking_ goes through human approval.
2. **The 24-hour window is a hard wall.** The bot can only free-form reply inside the
   window opened by the chef's message. Outside it, a template is required — so the bot
   physically cannot hold an open-ended conversation days later. Design around this;
   don't discover it in production.
3. **Never let the model quote money or commit the org to anything.** Pay rate comes out
   of the `opportunities` row verbatim via tool call, never from model generation.

**Model:** Sonnet 5 ($2/$10). Needs more judgment than classification but isn't
reasoning-heavy. Bump to Opus 5 only if Sonnet visibly mishandles real transcripts.

### Layer 3 — Agentic admin side

Admin types _"taco catering next fri, 80ppl, downtown oakland, $600"_ and gets a drafted
opportunity, drafted broadcast copy, and a ranked chef list.

```
admin free-text
  ↓
[LLM] extract structured opportunity fields  ← structured outputs, Sonnet 5
  ↓
[code] INSERT opportunity, generate ref_code   ← deterministic
  ↓
[code] SQL: chefs matching cuisine, not booked that date, past reliability
  ↓
[LLM] rank + explain: "Maya — 3 taco gigs, all on time"
  ↓
[LLM] draft broadcast copy for the template variables
  ↓
[HUMAN] admin reviews list + copy, edits, approves  ← REQUIRED GATE
  ↓
[code] send
```

The ranking is the one genuinely interesting use of the model: it weighs cuisine match,
past reliability, how recently someone got offered work, and fairness of distribution —
fuzzy tradeoffs that are miserable to encode as SQL `ORDER BY`. But the **candidate set
is fetched by SQL**, not chosen by the model. The model ranks and explains; it never
queries freely.

**Note this needs schema the current data model doesn't have** — `chefs.cuisines`,
`chefs.reliability_score` (or derived from a `gigs` table), `opportunities.pay_rate`.
Worth adding in the same migration if we're building toward this.

**The approval gate is non-negotiable.** An agent that auto-messages 30 chefs on a bad
extraction is a real-world incident with real people, not a bug report.

### Layer 4 — Autonomous ops loop

A scheduled agent that chases silence, because the failure mode of this whole system
isn't a crash — it's a gig quietly going unfilled because nobody replied and nobody
noticed.

```
daily cron
  ↓
[code] SQL: open opportunities, event_date within 7 days, response counts
  ↓
[LLM] for each at-risk gig, decide: nudge / escalate / widen / alert admin
  ↓
[HUMAN] admin approves the batch     ← gate stays
  ↓
[code] send nudges via template
```

Escalation ladder: silent chefs get one nudge; zero yeses 3 days out alerts the admin and
suggests widening to a backup roster; 24h out with nothing gets flagged urgent.

**Two options for running this:**

- **Vercel cron** hitting a route handler. Fits the existing deployment, no new infra,
  and the whole loop is ~50 lines. **Recommended for v1.**
- **Managed Agents** with a scheduled deployment — Anthropic runs the loop and hosts the
  sandbox, with session budgets as a hard dollar cap. Worth it only if the loop grows
  genuinely multi-step. Overkill for "query, decide, queue nudges."

**Hard rule: one nudge per chef per opportunity, enforced in code** with a unique
constraint, not by prompting the model to remember. An agent that re-nudges on every
cron tick because a retry lost state is how you get your number reported for spam —
which, per section I, is an unrecoverable outcome.

### Cost summary

Assuming ~30 chefs, 4 opportunities/month, ~120 replies:

| Layer              | Model     | Est. monthly   |
| ------------------ | --------- | -------------- |
| 1 — reply parsing  | Haiku 4.5 | ~$0.11         |
| 2 — conversation   | Sonnet 5  | ~$0.40         |
| 3 — admin drafting | Sonnet 5  | ~$0.15         |
| 4 — ops loop       | Sonnet 5  | ~$0.10         |
| **LLM total**      |           | **< $1/month** |
| WhatsApp (from §I) |           | ~$0.41–1.61    |

Estimates, not quotes — output tokens vary. But the order of magnitude holds: **the
agentic layer costs less than the messaging does**, and both are under $5/month. Cost is
not a reason to avoid this. Complexity and failure modes are the real budget.

### Build order

Ship these in sequence, not at once:

1. **v1 deterministic** (§II–III) — regex + keywords. Proves webhook, matching, dedupe.
2. **Layer 1** — swap the classifier. Smallest, highest-value change; shrinks triage.
3. **Layer 3** — admin drafting. Pure upside, human-gated, no inbound risk.
4. **Layer 2** — conversation. Most user-visible risk; needs real transcripts to tune.
5. **Layer 4** — ops loop. Only once there's enough history to know what "at risk" means.

Each step is independently shippable and independently revertable. If layer 2 makes
chefs feel like they're talking to a machine, roll it back without touching 1 or 3.

### What to verify before building this

- **Does Oakland Bloom want a bot that talks back?** A chef expecting a human and getting
  an LLM is a trust problem, not a feature. Ask before building layer 2.
- **Disclosure.** Chefs should know they're messaging an automated system. Ethical
  baseline, and cheap to do in the template copy.
- **Retention.** Chef messages go to Anthropic's API. Fine for this use case, but say so
  out loud to the org rather than assuming.
- **Template approval friction.** Every nudge/escalation variant in layer 4 is a separate
  Meta-approved template with a ~24h review. Batch the submissions.

### Links

- [Claude API: tool use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use) ·
  [structured outputs](https://docs.anthropic.com/en/docs/build-with-claude/structured-outputs) ·
  [prompt caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching) ·
  [pricing](https://www.anthropic.com/pricing#api)

---

## Links

**Meta**

- [Get started](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started)
- [About the platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform)
- [Business phone numbers](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers)
- [Groups API](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups) · [Groups get started](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/get-started)
- [Send messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages)
- [Templates overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview)
- [Messaging limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits)
- [Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing) · [Upcoming non-template pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages)
- [QR codes](https://developers.facebook.com/documentation/business-messaging/whatsapp/qr-codes/)
- [Graph API webhooks](https://developers.facebook.com/docs/graph-api/webhooks/getting-started)

**Twilio**

- [WhatsApp docs](https://www.twilio.com/docs/whatsapp) · [Sandbox](https://www.twilio.com/docs/whatsapp/sandbox) · [Pricing](https://www.twilio.com/en-us/whatsapp/pricing)
