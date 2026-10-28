import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  handleMetaWebhook,
  isValidSignature,
  verifyMetaSubscription,
} from "../lib/whatsapp/webhook.ts";

const SECRET = "app-secret";
const fixture = name =>
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "fixtures", "whatsapp", name),
    "utf8",
  );
const sign = (body, secret = SECRET) =>
  `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
const post = (body, signature = sign(body)) =>
  new Request("https://example.org/api/whatsapp/webhook", {
    method: "POST",
    headers: signature === null ? {} : { "x-hub-signature-256": signature },
    body,
  });
function setup(ingest = async () => {}) {
  const ingested = [];
  const logs = [];
  return {
    ingested,
    logs,
    config: {
      appSecret: SECRET,
      verifyToken: "verify-me",
      log: message => logs.push(message),
      ingest: async batch => {
        await ingest(batch);
        ingested.push(batch);
      },
    },
  };
}

test("a signed message is persisted before Meta gets its 200", async () => {
  // Acking first would lose the chef's message if the function is cut short.
  const { config, ingested } = setup();
  const response = await handleMetaWebhook(
    post(fixture("meta-valid-response.json")),
    config,
  );
  assert.equal(response.status, 200);
  assert.equal(ingested.length, 1);
  assert.equal(ingested[0].messages[0].text, "OB12 yes");
});

test("unsigned or forged requests never reach storage", async () => {
  // Anyone can POST to a public URL; only Meta knows the app secret.
  const body = fixture("meta-valid-response.json");
  for (const signature of [
    null,
    "sha256=deadbeef",
    sign(body, "wrong-secret"),
    sign(body).replace("sha256=", "sha1="),
  ]) {
    const { config, ingested } = setup();
    const response = await handleMetaWebhook(post(body, signature), config);
    assert.equal(response.status, 401);
    assert.equal(ingested.length, 0);
  }
});

test("the signature covers the exact raw bytes, so a re-serialized body fails", async () => {
  const body = fixture("meta-valid-response.json");
  const reformatted = JSON.stringify(JSON.parse(body));
  assert.notEqual(reformatted, body);
  assert.equal(isValidSignature(reformatted, sign(body), SECRET), false);
});

test("a storage failure returns 503 so Meta retries instead of dropping the message", async () => {
  const { config, logs } = setup(async () => {
    throw new Error("database unavailable");
  });
  const response = await handleMetaWebhook(
    post(fixture("meta-valid-response.json")),
    config,
  );
  assert.equal(response.status, 503);
  assert.match(logs.at(-1), /database unavailable/);
});

test("rejected messages in a batch are logged and still handed to storage", async () => {
  // The sender is kept so an unsupported voice note can still get a reply.
  const { config, ingested, logs } = setup();
  const response = await handleMetaWebhook(
    post(fixture("meta-partial-batch.json")),
    config,
  );
  assert.equal(response.status, 200);
  assert.ok(ingested[0].messages.length > 0);
  assert.equal(ingested[0].rejected.length, 1);
  assert.ok(ingested[0].rejected[0].from);
  assert.ok(
    logs.some(line => /Unsupported message type "location"/.test(line)),
  );
});

test("a signed but unreadable payload is a 400, not a retry loop", async () => {
  for (const body of ["{not json", JSON.stringify({ object: "page" })]) {
    const { config, ingested } = setup();
    const response = await handleMetaWebhook(post(body), config);
    assert.equal(response.status, 400);
    assert.equal(ingested.length, 0);
  }
});

test("status-only callbacks are acknowledged with an empty batch", async () => {
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      { id: "1", changes: [{ field: "messages", value: { statuses: [] } }] },
    ],
  });
  const { config, ingested } = setup();
  const response = await handleMetaWebhook(post(body), config);
  assert.equal(response.status, 200);
  assert.deepEqual(ingested[0], { messages: [], rejected: [] });
});

test("the subscription handshake echoes the challenge only for our token", () => {
  const url = token =>
    new URL(
      `https://example.org/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=12345`,
    );
  const ok = verifyMetaSubscription(url("verify-me"), "verify-me");
  assert.equal(ok.status, 200);
  assert.equal(verifyMetaSubscription(url("guess"), "verify-me").status, 403);
  assert.equal(
    verifyMetaSubscription(
      new URL("https://example.org/api/whatsapp/webhook?hub.challenge=1"),
      "verify-me",
    ).status,
    403,
  );
  return ok.text().then(text => assert.equal(text, "12345"));
});
