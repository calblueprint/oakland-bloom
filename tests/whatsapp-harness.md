# WhatsApp inbound-message test harness

A local harness for inbound catering responses. No provider account, no
credentials, no network, no database — run it on a fresh clone.

## Run it

```bash
pnpm harness:whatsapp   # print normalized output for every fixture
pnpm test              # all unit tests, including the WhatsApp parser and harness tests
```

Needs Node 22.9+ (`package.json` sets `engines.node >= 22.9.0`). Both scripts use
Node's built-in test runner and TypeScript stripping, so there are no new
dependencies.

## Expected result

`pnpm harness:whatsapp` processes 10 fixtures and ends with:

```
10 fixtures processed, 3 rejected by validation.
0 unexpected failures.
```

Per fixture:

| Fixture                            | Result                                               |
| ---------------------------------- | ---------------------------------------------------- |
| `meta-valid-response.json`         | ok — `15555550123` / `"OB12 yes"`                    |
| `meta-button-reply.json`           | ok — quick-reply tap, text is the label `"Yes"`      |
| `meta-interactive-reply.json`      | ok — interactive button tap, text is `"No"`          |
| `meta-unrecognized-response.json`  | ok — unrecognized text, still valid                  |
| `meta-partial-batch.json`          | partial — `"OB12 yes"` kept, location share rejected |
| `meta-status-callback.json`        | no inbound messages (delivery receipt)               |
| `meta-malformed.json`              | rejected — ``Message is missing a string `id`.``     |
| `twilio-valid-response.txt`        | ok — `15555550123` / `"OB12 yes"`                    |
| `twilio-unrecognized-response.txt` | ok — unrecognized text, still valid                  |
| `twilio-malformed.txt`             | rejected — ``Missing `MessageSid`.``                 |

Each fixture declares one outcome in `EXPECTED_OUTCOMES`: `message`, `empty`,
`rejection`, or `partial` (some messages accepted, some rejected). Expected
rejections are successful checks. The harness exits with code 0 only when every
fixture has its declared expected outcome. The harness requires all ten named
fixtures and rejects unknown fixture names. Rejecting a valid fixture, accepting
a malformed fixture, a text fixture producing no messages, a status fixture
producing messages, invalid JSON, missing fixtures, and unexpected exceptions
count separately as unexpected failures and produce exit code 1. Adding a fixture
requires declaring its outcome in `EXPECTED_OUTCOMES` in the runner.

## What's being tested

**Unrecognized text is valid.** A message the bot can't interpret
(`"cant do sat but sunday works"`) normalizes fine. Deciding what it _means_ is
a later concern — a human or a parser reads it downstream. Only structurally
broken payloads are rejected.

**One bad message never blocks the batch.** Meta can batch several messages in
one POST and retries the whole POST on failure. `parseMetaPayload` returns
`{ messages, rejected }`: a bad message lands in `rejected` with its ID and
reason, and the valid ones still come through. Only a broken envelope (wrong
`object`, missing `entry`/`changes`/`value`) throws. Twilio sends one message
per POST, so `parseTwilioPayload` still throws on a bad one.

**Reply buttons count as text.** Messages outside WhatsApp's 24-hour window are
templates, which will likely use Yes/No quick-reply buttons. Meta `button` and
`interactive` (`button_reply` / `list_reply`) messages normalize with the tapped
label as `text`. Twilio already puts the label in `Body` (`MessageType=button`).
Location shares, media, and other types are rejected on both providers. Twilio
location shares are caught by `Latitude`/`Longitude` or `MessageType`, since they
arrive with an empty `Body`.

**Malformed payloads fail loudly.** `meta-malformed.json` omits the message
`id`; `twilio-malformed.txt` omits `MessageSid`. Both are the provider's
idempotency key, and silently accepting a message without one would let webhook
retries create duplicate responses.

**Both providers normalize to one shape.** A test asserts the Meta and Twilio
fixtures of the same message produce identical `from`, `text`, and field names.

**Validation preserves the normalized contract.** Sender numbers must pass a
digit-format and length check after normalization; this does not verify that a
phone number exists. Message IDs must be nonblank strings; opaque ID values are
preserved. Twilio senders must use the `whatsapp:` channel, record input values
must be strings, and duplicate core form fields are rejected. Media counts must
be nonnegative integers; nonzero counts are rejected because this harness handles
text only. Message text, including empty strings and surrounding whitespace, is
preserved.

**Harness failures fail the command.** Regression tests run the harness as a
subprocess against temporary copies of the parsers and fixtures. They check
expected rejections and inject valid-fixture rejection, malformed-fixture
acceptance, invalid JSON, a parser exception, missing or unknown fixtures, and
incorrect message-versus-empty outcomes. The repository fixtures remain untouched,
and the copies contain no installed dependencies. GitHub CI runs the WhatsApp test
suite alongside the existing lint, formatting, and TypeScript checks.

## Layout

```
lib/whatsapp/
  inboundMessage.ts   InboundMessage type, InboundParseError, normalizePhone
  parseMeta.ts        Meta Cloud API (JSON)  -> InboundBatch
  parseTwilio.ts      Twilio (form-encoded)  -> InboundMessage[]
  index.ts            re-exports
tests/
  whatsappHarness.mjs      the runner
  whatsappInbound.test.mjs assertions
  whatsappHarness.test.mjs subprocess regression tests
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
                                          InboundBatch.messages  ->  persistence
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
