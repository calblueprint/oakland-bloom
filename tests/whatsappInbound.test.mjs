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
  const batched = {
    object: "whatsapp_business_account",
    entry: [single.entry[0], single.entry[0]],
  };
  assert.equal(parseMetaPayload(batched).length, 2);
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
