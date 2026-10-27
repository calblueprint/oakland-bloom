# WhatsApp inbound-message test harness

A local harness for inbound catering responses. No provider account, no
credentials, no network, no database — run it on a fresh clone.

## Run it

```bash
pnpm harness:whatsapp   # print each normalized message and its parsed reply
pnpm test              # all unit tests, including the WhatsApp parser and harness tests

# only the catering reply parser tests
node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/cateringResponse.test.mjs
```

Needs Node 22.9+ (`package.json` sets `engines.node >= 22.9.0`). Both scripts use
Node's built-in test runner and TypeScript stripping, so there are no new
dependencies.

## Catering replies

Chefs answer a catering opportunity with one of two replies:

| Reply      | Meaning                            |
| ---------- | ---------------------------------- |
| `OB12 yes` | interested in opportunity OB12     |
| `OB12 no`  | not interested in opportunity OB12 |

**Opportunity reference format:** `OB` followed by the opportunity number, with no
leading zeros: `OB7`, `OB12`, `OB305`. Write it this way in every outbound message
so chefs copy one spelling. `parseCateringResponse` returns it uppercase.

Capitalization doesn't matter (`ob12 YES` works), and surrounding or repeated
whitespace, tabs, and newlines are ignored. Everything else returns
`{ kind: "unrecognized", reason }` for a person to read:

| Reason               | When                                                           | Examples                                       |
| -------------------- | -------------------------------------------------------------- | ---------------------------------------------- |
| `missing-reference`  | no valid reference anywhere                                    | `yes`, `OB012 yes`, `OB12yes`, button `Yes`    |
| `unsupported-answer` | a reference followed by nothing, or one word that isn't yes/no | `OB12`, `OB12 maybe`, `OB12 yes.`              |
| `ambiguous`          | extra words, several references, or the reference not first    | `OB12 yes please`, `OB12 OB13 yes`, `yes OB12` |

Recognized replies return
`{ kind: "catering-response", opportunityRef: "OB12", interested: true }`.

The parser lives in `lib/whatsapp/parseCateringResponse.ts` and takes only
`InboundMessage.text`, so it never sees provider payloads. Punctuation such as
`OB12 yes!` is deliberately unrecognized for now; looser interpretation comes
with the later AI step. Reply-button taps normalize to their label (`Yes`), which
has no reference, so they are `missing-reference` until button payloads carry
the opportunity reference.

## Expected result

`pnpm harness:whatsapp` processes 15 fixtures and ends with:

```
15 fixtures processed, 3 rejected by validation.
0 unexpected failures.
```

Per fixture, each accepted message prints `from`, `text`, and `parsed`:

| Fixture                              | Normalized text                                  | Parsed                            |
| ------------------------------------ | ------------------------------------------------ | --------------------------------- |
| `meta-valid-response.json`           | `"OB12 yes"`                                     | OB12 interested                   |
| `meta-reply-no.json`                 | `"OB12 no"`                                      | OB12 not interested               |
| `twilio-reply-mixed-case.txt`        | `"ob12 YeS"`                                     | OB12 interested                   |
| `meta-reply-extra-whitespace.json`   | `"  OB12 \t  yes \n"`                            | OB12 interested                   |
| `twilio-reply-missing-reference.txt` | `"yes"`                                          | unrecognized (missing-reference)  |
| `meta-reply-unsupported-answer.json` | `"OB12 maybe"`                                   | unrecognized (unsupported-answer) |
| `twilio-valid-response.txt`          | `"OB12 yes"`                                     | OB12 interested                   |
| `meta-button-reply.json`             | `"Yes"` (quick-reply label)                      | unrecognized (missing-reference)  |
| `meta-interactive-reply.json`        | `"No"` (interactive label)                       | unrecognized (missing-reference)  |
| `meta-unrecognized-response.json`    | free text                                        | unrecognized (missing-reference)  |
| `twilio-unrecognized-response.txt`   | free text                                        | unrecognized (missing-reference)  |
| `meta-partial-batch.json`            | `"OB12 yes"`; location rejected                  | OB12 interested                   |
| `meta-status-callback.json`          | no inbound messages                              | —                                 |
| `meta-malformed.json`                | rejected — ``Message is missing a string `id`.`` | —                                 |
| `twilio-malformed.txt`               | rejected — ``Missing `MessageSid`.``             | —                                 |

Each fixture declares one outcome in `EXPECTED_OUTCOMES`: `message`, `empty`,
`rejection`, or `partial` (some messages accepted, some rejected). Expected
rejections are successful checks. The harness exits with code 0 only when every
fixture has its declared expected outcome. The harness requires all fifteen named
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
  parseCateringResponse.ts  message text -> CateringResponse
  index.ts            re-exports
tests/
  whatsappHarness.mjs      the runner
  whatsappInbound.test.mjs assertions
  whatsappHarness.test.mjs subprocess regression tests
  cateringResponse.test.mjs catering reply parser tests
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
