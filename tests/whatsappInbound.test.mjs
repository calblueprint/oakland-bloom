import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  InboundParseError,
  normalizePhone,
} from "../lib/whatsapp/inboundMessage.ts";
import { parseMetaPayload } from "../lib/whatsapp/parseMeta.ts";
import { parseTwilioPayload } from "../lib/whatsapp/parseTwilio.ts";

const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "whatsapp",
);
const json = name => JSON.parse(readFileSync(join(FIXTURES, name), "utf8"));
const text = name => readFileSync(join(FIXTURES, name), "utf8").trim();

test("normalizes a valid Meta response", () => {
  const [message, ...rest] = parseMetaPayload(json("meta-valid-response.json"));
  assert.equal(rest.length, 0);
  assert.equal(message.provider, "meta");
  assert.equal(message.from, "15555550123");
  assert.equal(message.text, "OB12 yes");
  assert.ok(message.providerMessageId.startsWith("meta:wamid."));
});

test("normalizes a valid Twilio response to the same shape", () => {
  const [message] = parseTwilioPayload(text("twilio-valid-response.txt"));
  assert.equal(message.provider, "twilio");
  // The `whatsapp:+` prefix is stripped so both providers agree on `from`.
  assert.equal(message.from, "15555550123");
  assert.equal(message.text, "OB12 yes");
  assert.ok(message.providerMessageId.startsWith("twilio:SM"));
});

test("both providers produce identical fields for the same message", () => {
  const [meta] = parseMetaPayload(json("meta-valid-response.json"));
  const [twilio] = parseTwilioPayload(text("twilio-valid-response.txt"));
  // This is the point of the normalized type: downstream code can't tell them
  // apart except by the provider tag and ID.
  assert.equal(meta.from, twilio.from);
  assert.equal(meta.text, twilio.text);
  assert.deepEqual(Object.keys(meta).sort(), Object.keys(twilio).sort());
});

test("keeps unrecognized text as a valid message", () => {
  // Unrecognized intent is NOT a parse failure — a human still needs to read it.
  const [meta] = parseMetaPayload(json("meta-unrecognized-response.json"));
  assert.equal(meta.text, "cant do sat but sunday works, whats the headcount?");

  const [twilio] = parseTwilioPayload(text("twilio-unrecognized-response.txt"));
  assert.equal(twilio.text, "who is this?");
});

test("rejects a malformed Meta payload explicitly", () => {
  assert.throws(
    () => parseMetaPayload(json("meta-malformed.json")),
    error => {
      assert.ok(error instanceof InboundParseError);
      assert.equal(error.provider, "meta");
      assert.match(error.message, /missing a string `id`/);
      return true;
    },
  );
});

test("rejects a malformed Twilio payload explicitly", () => {
  assert.throws(
    () => parseTwilioPayload(text("twilio-malformed.txt")),
    error => {
      assert.ok(error instanceof InboundParseError);
      assert.equal(error.provider, "twilio");
      assert.match(error.message, /MessageSid/);
      return true;
    },
  );
});

test("ignores Meta delivery-status callbacks without failing", () => {
  // Status callbacks share the webhook URL but carry no `messages` array.
  assert.deepEqual(parseMetaPayload(json("meta-status-callback.json")), []);
});

test("walks every entry, change, and message in a batch", () => {
  // Meta explicitly does not guarantee batching, so all levels must be walked.
  const single = json("meta-valid-response.json");
  const makeMessage = id => ({
    ...single.entry[0].changes[0].value.messages[0],
    id,
  });
  const makeChange = ids => ({
    field: "messages",
    value: { messages: ids.map(makeMessage) },
  });
  const batched = {
    object: "whatsapp_business_account",
    entry: [
      { changes: [makeChange(["first", "second"]), makeChange(["third"])] },
      { changes: [single.entry[0].changes[0], makeChange(["fourth"])] },
    ],
  };
  assert.deepEqual(
    parseMetaPayload(batched).map(message => message.providerMessageId),
    [
      "meta:first",
      "meta:second",
      "meta:third",
      `meta:${single.entry[0].changes[0].value.messages[0].id}`,
      "meta:fourth",
    ],
  );
});

test("rejects non-text Meta message types", () => {
  const payload = json("meta-valid-response.json");
  const message = payload.entry[0].changes[0].value.messages[0];
  delete message.text;
  message.type = "image";
  message.image = { id: "media-id", mime_type: "image/jpeg" };
  assert.throws(
    () => parseMetaPayload(payload),
    /Unsupported message type "image"/,
  );
});

test("rejects Twilio media messages", () => {
  const payload = text("twilio-valid-response.txt").replace(
    "NumMedia=0",
    "NumMedia=1",
  );
  assert.throws(() => parseTwilioPayload(payload), /Unsupported media message/);
});

test("rejects payloads that are not WhatsApp webhooks", () => {
  assert.throws(
    () => parseMetaPayload({ object: "page", entry: [] }),
    InboundParseError,
  );
  assert.throws(() => parseMetaPayload(null), InboundParseError);
  assert.throws(
    () => parseMetaPayload({ object: "whatsapp_business_account" }),
    InboundParseError,
  );
});

test("accepts Twilio payloads as a record or URLSearchParams", () => {
  const raw = text("twilio-valid-response.txt");
  const fromParams = parseTwilioPayload(new URLSearchParams(raw));
  const fromRecord = parseTwilioPayload(
    Object.fromEntries(new URLSearchParams(raw)),
  );
  assert.deepEqual(fromParams, fromRecord);
});

test("normalizePhone strips whatsapp and plus prefixes", () => {
  assert.equal(normalizePhone("whatsapp:+15555550123"), "15555550123");
  assert.equal(normalizePhone("+15555550123"), "15555550123");
  assert.equal(normalizePhone("15555550123"), "15555550123");
});

const twilioRecord = () =>
  Object.fromEntries(new URLSearchParams(text("twilio-valid-response.txt")));
const metaWithMessage = overrides => {
  const payload = json("meta-valid-response.json");
  Object.assign(payload.entry[0].changes[0].value.messages[0], overrides);
  return payload;
};
const rejectsFrom = (provider, fn) =>
  assert.throws(fn, error => {
    assert.ok(error instanceof InboundParseError);
    assert.equal(error.provider, provider);
    return true;
  });

test("rejects non-string Twilio record values before URLSearchParams can coerce them", () => {
  for (const field of ["MessageSid", "From", "Body", "NumMedia"]) {
    for (const value of [null, undefined, 123, false, {}, []]) {
      rejectsFrom("twilio", () =>
        parseTwilioPayload({ ...twilioRecord(), [field]: value }),
      );
    }
  }
});

test("rejects non-record Twilio input with a provider-specific parse error", () => {
  for (const value of [null, undefined, 123, [], new Date(), new Map()]) {
    rejectsFrom("twilio", () => parseTwilioPayload(value));
  }
});

test("rejects blank provider message IDs without rewriting valid opaque IDs", () => {
  for (const id of ["", " ", "\n\t"]) {
    rejectsFrom("meta", () => parseMetaPayload(metaWithMessage({ id })));
    rejectsFrom("twilio", () =>
      parseTwilioPayload({ ...twilioRecord(), MessageSid: id }),
    );
  }
  assert.equal(
    parseMetaPayload(metaWithMessage({ id: "opaque-example-id" }))[0]
      .providerMessageId,
    "meta:opaque-example-id",
  );
});

test("rejects malformed sender numbers instead of producing invalid lookup keys", () => {
  for (const from of [
    "",
    " ",
    "+",
    "garbage",
    "+1 555-555-0123",
    "012345",
    "1234567890123456",
  ]) {
    rejectsFrom("meta", () => parseMetaPayload(metaWithMessage({ from })));
    rejectsFrom("twilio", () =>
      parseTwilioPayload({ ...twilioRecord(), From: `whatsapp:${from}` }),
    );
  }
});

test("rejects ordinary SMS and other Twilio channels", () => {
  for (const from of ["+15555550123", "15555550123", "messenger:12345"]) {
    rejectsFrom("twilio", () =>
      parseTwilioPayload({ ...twilioRecord(), From: from }),
    );
  }
});

test("rejects malformed media counts rather than silently treating them as zero", () => {
  for (const numMedia of ["", " ", "junk", "-1", "0.5", "NaN", "Infinity"]) {
    rejectsFrom("twilio", () =>
      parseTwilioPayload({ ...twilioRecord(), NumMedia: numMedia }),
    );
  }
  const noMediaCount = twilioRecord();
  delete noMediaCount.NumMedia;
  assert.equal(parseTwilioPayload(noMediaCount).length, 1);
});

test("rejects duplicate Twilio fields in raw forms and URLSearchParams", () => {
  const raw = text("twilio-valid-response.txt");
  for (const field of ["MessageSid", "From", "Body", "NumMedia"]) {
    const duplicated = `${raw}&${field}=different`;
    rejectsFrom("twilio", () => parseTwilioPayload(duplicated));
    rejectsFrom("twilio", () =>
      parseTwilioPayload(new URLSearchParams(duplicated)),
    );
  }
});

test("preserves empty text, whitespace, Unicode, and form-encoded punctuation", () => {
  for (const body of [
    "",
    "  \n\t",
    "sí, 我可以",
    "OB12 + yes & maybe=tomorrow",
  ]) {
    assert.equal(
      parseMetaPayload(metaWithMessage({ text: { body } }))[0].text,
      body,
    );
    const record = { ...twilioRecord(), Body: body };
    for (const input of [
      record,
      new URLSearchParams(record),
      new URLSearchParams(record).toString(),
    ]) {
      assert.equal(parseTwilioPayload(input)[0].text, body);
    }
  }
});

test("rejects malformed Meta batches instead of returning partially parsed messages", () => {
  for (const payload of [
    [],
    { object: "whatsapp_business_account", entry: [null] },
    { object: "whatsapp_business_account", entry: [{ changes: {} }] },
    { object: "whatsapp_business_account", entry: [{ changes: [null] }] },
    {
      object: "whatsapp_business_account",
      entry: [{ changes: [{ value: { messages: {} } }] }],
    },
  ]) {
    rejectsFrom("meta", () => parseMetaPayload(payload));
  }
  const payload = json("meta-valid-response.json");
  payload.entry[0].changes[0].value.messages.push({ from: "15555550123" });
  rejectsFrom("meta", () => parseMetaPayload(payload));
});
