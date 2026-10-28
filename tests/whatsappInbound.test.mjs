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
  const { messages, rejected } = parseMetaPayload(
    json("meta-valid-response.json"),
  );
  const [message, ...rest] = messages;
  assert.deepEqual(rejected, []);
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
  const [meta] = parseMetaPayload(json("meta-valid-response.json")).messages;
  const [twilio] = parseTwilioPayload(text("twilio-valid-response.txt"));
  // This is the point of the normalized type: downstream code can't tell them
  // apart except by the provider tag and ID.
  assert.equal(meta.from, twilio.from);
  assert.equal(meta.text, twilio.text);
  assert.deepEqual(Object.keys(meta).sort(), Object.keys(twilio).sort());
});

test("keeps unrecognized text as a valid message", () => {
  // Unrecognized intent is NOT a parse failure — a human still needs to read it.
  const [meta] = parseMetaPayload(
    json("meta-unrecognized-response.json"),
  ).messages;
  assert.equal(meta.text, "cant do sat but sunday works, whats the headcount?");

  const [twilio] = parseTwilioPayload(text("twilio-unrecognized-response.txt"));
  assert.equal(twilio.text, "who is this?");
});

test("rejects a malformed Meta message explicitly", () => {
  // A message without an ID can't be deduplicated across webhook retries.
  assert.deepEqual(parseMetaPayload(json("meta-malformed.json")), {
    messages: [],
    rejected: [
      { providerMessageId: null, reason: "Message is missing a string `id`." },
    ],
  });
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
  assert.deepEqual(parseMetaPayload(json("meta-status-callback.json")), {
    messages: [],
    rejected: [],
  });
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
    parseMetaPayload(batched).messages.map(
      message => message.providerMessageId,
    ),
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
  rejectsMessage(payload, /Unsupported message type "image"/);
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
const rejectsMessage = (payload, reason) => {
  const { messages, rejected } = parseMetaPayload(payload);
  assert.deepEqual(messages, []);
  assert.equal(rejected.length, 1);
  assert.match(rejected[0].reason, reason);
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
    rejectsMessage(metaWithMessage({ id }), /missing a string `id`/);
    rejectsFrom("twilio", () =>
      parseTwilioPayload({ ...twilioRecord(), MessageSid: id }),
    );
  }
  assert.equal(
    parseMetaPayload(metaWithMessage({ id: "opaque-example-id" })).messages[0]
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
    rejectsMessage(metaWithMessage({ from }), /`from`/);
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
      parseMetaPayload(metaWithMessage({ text: { body } })).messages[0].text,
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

test("rejects malformed Meta envelopes outright", () => {
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
});

test("keeps valid messages when another message in the batch is rejected", () => {
  // Meta retries the whole POST on failure, so throwing here would drop chef
  // A's "OB12 yes" on every retry just because chef B sent a location.
  const { messages, rejected } = parseMetaPayload(
    json("meta-partial-batch.json"),
  );
  assert.deepEqual(
    messages.map(message => message.text),
    ["OB12 yes"],
  );
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0].providerMessageId.startsWith("meta:wamid."));
  assert.match(rejected[0].reason, /Unsupported message type "location"/);

  const payload = json("meta-valid-response.json");
  payload.entry[0].changes[0].value.messages.push(null, {
    from: "15555550123",
  });
  const mixed = parseMetaPayload(payload);
  assert.equal(mixed.messages.length, 1);
  assert.deepEqual(
    mixed.rejected.map(({ providerMessageId }) => providerMessageId),
    [null, null],
  );
});

test("uses the tapped label as text for Meta quick-reply and interactive replies", () => {
  // Template messages outside the 24-hour window use reply buttons, so a tap
  // is the most likely catering reply and must not be dropped.
  assert.equal(
    parseMetaPayload(json("meta-button-reply.json")).messages[0].text,
    "Yes",
  );
  assert.equal(
    parseMetaPayload(json("meta-interactive-reply.json")).messages[0].text,
    "No",
  );
  const listReply = metaWithMessage({
    type: "interactive",
    interactive: {
      type: "list_reply",
      list_reply: { id: "OB12_YES", title: "OB12 yes" },
    },
  });
  delete listReply.entry[0].changes[0].value.messages[0].text;
  assert.equal(parseMetaPayload(listReply).messages[0].text, "OB12 yes");
});

test("rejects reply messages that are missing their label", () => {
  rejectsMessage(
    metaWithMessage({ type: "button", button: { payload: "OB12_YES" } }),
    /button\.text/,
  );
  rejectsMessage(
    metaWithMessage({
      type: "interactive",
      interactive: { type: "nfm_reply" },
    }),
    /button_reply\.title/,
  );
});

test("rejects Twilio location shares instead of passing them as empty text", () => {
  const location = {
    ...twilioRecord(),
    Body: "",
    Latitude: "37.8044",
    Longitude: "-122.2712",
  };
  rejectsFrom("twilio", () => parseTwilioPayload(location));
  rejectsFrom("twilio", () =>
    parseTwilioPayload({ ...location, MessageType: "location" }),
  );
  for (const messageType of ["location", "image", "interactive"]) {
    rejectsFrom("twilio", () =>
      parseTwilioPayload({ ...twilioRecord(), MessageType: messageType }),
    );
  }
});

test("accepts Twilio quick-reply taps, which carry the label in Body", () => {
  const [message] = parseTwilioPayload({
    ...twilioRecord(),
    Body: "Yes",
    MessageType: "button",
    ButtonText: "Yes",
    ButtonPayload: "OB12_YES",
  });
  assert.equal(message.text, "Yes");
  assert.equal(
    parseTwilioPayload({ ...twilioRecord(), MessageType: "text" })[0].text,
    "OB12 yes",
  );
});
