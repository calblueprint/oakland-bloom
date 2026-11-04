# WhatsApp Message Harness

Run provider fixtures through normalization and the strict catering reply parser.
No credentials, network, database, or installed dependencies are needed for the
harness; use Node 22.9+.

```bash
pnpm harness:whatsapp
pnpm test # Full test suite; install dependencies first
```

The harness processes 15 fictional fixtures, with 3 expected validation rejections
and 0 unexpected failures. Missing/unknown fixtures, unexpected exceptions, or a
result that differs from its declared outcome make the command fail.

## What the Code Does

- `parseMeta.ts` walks every batched message and returns accepted/rejected arrays.
  A bad message does not discard valid messages in the same batch.
- `parseTwilio.ts` converts one form-encoded WhatsApp message to the shared shape.
- `inboundMessage.ts` defines that shape, provider errors, and phone normalization.
- `parseCateringResponse.ts` recognizes only `OB12 yes` or `OB12 no`, ignoring case
  and whitespace. References cannot have leading zeros. Extra words are ambiguous;
  missing references and unsupported answers return an explicit reason.

Reply buttons become their visible label; `Yes` alone has no gig reference.
Unrecognized text is valid input, even when the strict parser cannot interpret it.
The conversational agent is a separate path and uses history and model tools.

Fixtures live in `tests/fixtures/whatsapp/`. Parser and catering tests are together
in `whatsappInbound.test.mjs`; `whatsappHarness.test.mjs` checks command failures
using temporary copies with no dependencies. Fixtures use fictional phone numbers
and unmistakably fake Twilio credentials. Confirm live provider payloads before
production use; fixture tests only verify our code.
