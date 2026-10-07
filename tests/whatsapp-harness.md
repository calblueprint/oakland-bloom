# WhatsApp inbound-message test harness

A local harness for inbound catering responses. No provider account, no
credentials, no network, no database — run it on a fresh clone.

## Run it

```bash
pnpm harness:whatsapp   # print normalized output for every fixture
pnpm test:whatsapp      # assert the same behavior (13 tests)
```

Needs Node 22.9+ (`package.json` sets `engines.node >= 22.9.0`). Both scripts use
Node's built-in test runner and TypeScript stripping, so there are no new
dependencies.

## Expected result

`pnpm harness:whatsapp` processes 7 fixtures and ends with:

```
7 fixtures processed, 2 rejected by validation.
```

Per fixture:

| Fixture                            | Result                                           |
| ---------------------------------- | ------------------------------------------------ |
| `meta-valid-response.json`         | ok — `15555550123` / `"OB12 yes"`                |
| `meta-unrecognized-response.json`  | ok — unrecognized text, still valid              |
| `meta-status-callback.json`        | no inbound messages (delivery receipt)           |
| `meta-malformed.json`              | rejected — ``Message is missing a string `id`.`` |
| `twilio-valid-response.txt`        | ok — `15555550123` / `"OB12 yes"`                |
| `twilio-unrecognized-response.txt` | ok — unrecognized text, still valid              |
| `twilio-malformed.txt`             | rejected — ``Missing `MessageSid`.``             |

The two rejections are the point, not a failure: malformed payloads fail
validation explicitly instead of silently producing a half-built message.

## What's being tested

**Unrecognized text is valid.** A message the bot can't interpret
(`"cant do sat but sunday works"`) normalizes fine. Deciding what it _means_ is
a later concern — a human or a parser reads it downstream. Only structurally
broken payloads are rejected.

**Malformed payloads fail loudly.** `meta-malformed.json` omits the message
`id`; `twilio-malformed.txt` omits `MessageSid`. Both are the provider's
idempotency key, and silently accepting a message without one would let webhook
retries create duplicate responses.

**Both providers normalize to one shape.** A test asserts the Meta and Twilio
fixtures of the same message produce identical `from`, `text`, and field names.

## Layout

```
lib/whatsapp/
  inboundMessage.ts   InboundMessage type, InboundParseError, normalizePhone
  parseMeta.ts        Meta Cloud API (JSON)  -> InboundMessage[]
  parseTwilio.ts      Twilio (form-encoded)  -> InboundMessage[]
  index.ts            re-exports
tests/
  whatsappHarness.mjs      the runner
  whatsappInbound.test.mjs assertions
  fixtures/whatsapp/       sanitized payloads
```

Provider parsing is deliberately separate from the normalized type. Everything
downstream depends only on `InboundMessage`, so choosing Twilio or Meta later
means adding or deleting one `parse*.ts` — nothing else changes. See
`docs/whatsapp-bot-research.md` (PR #1) for why that choice is still open.

## Where a real webhook connects

The provider POSTs to a route handler, which calls the same parser this harness
calls:

```
provider  ->  app/api/whatsapp/webhook/route.ts  ->  parseMetaPayload(body)
                                                        |
                                                        v
                                                 InboundMessage[]  ->  persistence
```

That route does not exist yet, and is out of scope for this sprint. When it is
built it will also need, in order:

1. **Signature verification before parsing** — `X-Hub-Signature-256` (HMAC-SHA256,
   Meta) or `X-Twilio-Signature` (HMAC-SHA1, Twilio). The endpoint is public.
2. **Persist before acknowledging** — providers retry on non-200 and guarantee no
   exactly-once delivery. `providerMessageId` is the idempotency key; a repeat
   must be a successful no-op.
3. **A `GET` handler** for Meta's `hub.challenge` verification handshake.

None of that is in this harness, which covers normalization only.

## Fixtures

All payloads are fictional — `+1 555 555 01xx` numbers, invented message IDs,
no real chef data. Twilio SIDs deliberately read `ACexample…` / `SMexample…`
rather than hex: a realistic-looking `AC` + 32-hex value trips GitHub's secret
scanner, and fixtures should be unmistakably fake rather than allow-listed. Field shapes follow Meta's and Twilio's documented payloads
(cited in `docs/whatsapp-bot-research.md`) but the values are made up, so they
verify our parsing, not the providers' live behavior. Confirm against a real
sandbox message before trusting them for production.
