import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createNotificationWorker } from "../lib/whatsapp/agent/notifications.ts";
import { MetaApiError } from "../lib/whatsapp/metaClient.ts";

const phone = "15555550101";

/** Models the database's unknown-before-send state and records actual provider calls. */
function setup({
  template = false,
  refusal,
  finishFails = false,
  wrongPhone = false,
} = {}) {
  const events = [];
  const row = {
    id: randomUUID(),
    phone: wrongPhone ? "15555550102" : phone,
    kind: template ? "template" : "text",
    body: "New catering request OB300: Test lunch.",
    ...(template
      ? {
          template: {
            name: "catering_request",
            language: "en_US",
            bodyParameters: ["OB300", "Test lunch"],
          },
        }
      : {}),
  };
  let status = "pending";
  const worker = createNotificationWorker({
    phone,
    template: template
      ? { name: "catering_request", language: "en_US" }
      : undefined,
    rpc: async (name, args) => {
      events.push({ name, args });
      if (name === "claim_wa_notification") {
        if (status !== "pending") return { data: null, error: null };
        status = "unknown";
        return { data: row, error: null };
      }
      assert.equal(args.notification_id, row.id);
      if (name === "finish_wa_notification") {
        if (finishFails)
          return { data: null, error: { message: "private database detail" } };
        assert.equal(args.provider_id, "meta:notification-1");
        status = "sent";
      }
      if (name === "fail_wa_notification") status = "failed";
      return { data: null, error: null };
    },
    meta: {
      sendText: async (to, body) => send("text", to, body),
      sendTemplate: async (to, body) => send("template", to, body),
    },
  });
  /** Verifies delivery happens only after the database has retired automatic retries. */
  async function send(kind, to, body) {
    events.push({ name: "send", kind, to, body });
    assert.equal(status, "unknown");
    assert.equal(to, phone);
    if (refusal) throw refusal;
    return { providerMessageId: "meta:notification-1" };
  }
  return {
    worker,
    events,
    get status() {
      return status;
    },
  };
}

test("queued text alert sends once without a model call", async () => {
  const app = setup();
  assert.equal(await app.worker.sendNext(), true);
  assert.equal(app.status, "sent");
  assert.equal(await app.worker.sendNext(), false);
  assert.equal(app.events.filter(row => row.name === "send").length, 1);
});

test("an approved template uses the template sender and exact persisted variables", async () => {
  const app = setup({ template: true });
  await app.worker.sendNext();
  const sent = app.events.find(row => row.name === "send");
  assert.equal(sent.kind, "template");
  assert.deepEqual(sent.body, {
    name: "catering_request",
    language: "en_US",
    bodyParameters: ["OB300", "Test lunch"],
  });
});

test("unknown network acceptance and failed completion never resend", async () => {
  for (const options of [
    { refusal: new Error("connection lost") },
    { finishFails: true },
  ]) {
    const app = setup(options);
    await assert.rejects(app.worker.sendNext());
    assert.equal(app.status, "unknown");
    assert.equal(await app.worker.sendNext(), false);
    assert.equal(app.events.filter(row => row.name === "send").length, 1);
  }
});

test("only definite provider refusals become failed", async () => {
  for (const status of [400, 401, 403, 408, 429, 500]) {
    const app = setup({
      refusal: new MetaApiError(status, 190, "fictional refusal"),
    });
    await assert.rejects(app.worker.sendNext());
    assert.equal(
      app.status,
      [400, 401, 403].includes(status) ? "failed" : "unknown",
    );
  }
});

test("a database row cannot send to someone outside the configured test phone", async () => {
  const app = setup({ wrongPhone: true });
  await assert.rejects(app.worker.sendNext(), /configured test recipient/);
  assert.ok(!app.events.some(row => row.name === "send"));
});
