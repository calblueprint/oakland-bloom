import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { MockLanguageModelV4 } from "ai/test";
import { createNotificationWorker } from "../lib/whatsapp/agent/notifications.ts";
import { MetaApiError } from "../lib/whatsapp/metaClient.ts";

const phone = "15555550101";

/** Models the database's unknown-before-send state and records actual provider calls. */
function setup({
  template = false,
  refusal,
  finishFails = false,
  wrongPhone = false,
  model,
  facts,
  prepare = true,
  prepareError = false,
} = {}) {
  const events = [];
  const row = {
    id: randomUUID(),
    phone: wrongPhone ? "15555550102" : phone,
    kind: template ? "template" : "text",
    body: "New catering request OB300: Test lunch.",
    ...(facts ? { facts } : {}),
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
    model,
    template: template
      ? { name: "catering_request", language: "en_US" }
      : undefined,
    rpc: async (name, args) => {
      events.push({ name, args });
      if (
        name === "claim_wa_notification" ||
        name === "claim_wa_notification_for_agent"
      ) {
        if (status !== "pending") return { data: null, error: null };
        status = "unknown";
        return { data: row, error: null };
      }
      assert.equal(args.notification_id, row.id);
      if (name === "prepare_wa_agent_notice")
        return {
          data: prepare,
          error: prepareError ? { message: "failed" } : null,
        };
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

/** Supplies an agent draft without calling a live model service in CI. */
function draftModel(text) {
  return new MockLanguageModelV4({
    doGenerate: async () => {
      if (text === undefined) throw new Error("Unavailable");
      return {
        content: [{ type: "text", text }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
        warnings: [],
      };
    },
  });
}

const catering = {
  notificationKind: "catering_alert",
  reference: "OB300",
  title: "Test lunch",
};

const warmCompact = JSON.stringify({
  tone: "warm",
  layout: "compact",
  inviteDetails: true,
});

test("the agent chooses a style and the worker saves exactly what it sends", async () => {
  const model = draftModel(warmCompact);
  const app = setup({ facts: catering, model });
  assert.equal(await app.worker.sendNext(), true);
  const saved = app.events.find(
    event => event.name === "prepare_wa_agent_notice",
  );
  const send = app.events.find(event => event.name === "send");
  assert.equal(saved.args.styled_body, send.body);
  assert.equal(saved.args.target_phone, phone);
  assert.equal(
    send.body,
    "Hey, a new catering request came in for Test lunch (OB300).\n\nWant to take a look? Reply here and I can share the details.",
  );
  assert.doesNotMatch(
    JSON.stringify(model.doGenerateCalls),
    /OB300|Test lunch|15555550101/,
  );
});

test("invalid model choices and extra prose cannot change a declined booking", async () => {
  for (const draft of [
    "Your booking is approved.",
    JSON.stringify({
      tone: "warm",
      layout: "compact",
      inviteDetails: true,
      copy: "You're all set.",
    }),
    warmCompact,
    undefined,
  ]) {
    const app = setup({
      facts: {
        notificationKind: "booking_update",
        title: "Test booking",
        reference: "test",
        status: "denied",
      },
      model: draftModel(draft),
    });
    assert.equal(await app.worker.sendNext(), true);
    const body = app.events.find(event => event.name === "send").body;
    assert.equal(
      body,
      "Quick update: your kitchen booking for Test booking wasn't approved.\n\nRef. test",
    );
  }
});

test("the model can choose a direct tone with no invitation", async () => {
  const model = draftModel(
    JSON.stringify({ tone: "direct", layout: "spaced", inviteDetails: false }),
  );
  const app = setup({ model, facts: catering });
  assert.equal(await app.worker.sendNext(), true);
  assert.equal(
    app.events.find(event => event.name === "send").body,
    "*New catering request · OB300*\n\nTest lunch",
  );
});

test("a claim that becomes ineligible while the agent drafts does not send", async () => {
  const app = setup({
    facts: catering,
    model: draftModel(warmCompact),
    prepare: false,
  });
  assert.equal(await app.worker.sendNext(), false);
  assert.ok(!app.events.some(event => event.name === "send"));
});

test("a prepare error releases the same attempt before any Meta call", async () => {
  const app = setup({
    facts: catering,
    model: draftModel(warmCompact),
    prepareError: true,
  });
  await assert.rejects(app.worker.sendNext(), /prepare_wa_agent_notice failed/);
  const prepare = app.events.find(
    event => event.name === "prepare_wa_agent_notice",
  );
  const abandon = app.events.find(
    event => event.name === "abandon_wa_agent_notice",
  );
  assert.equal(abandon.args.worker_id, prepare.args.worker_id);
  assert.equal(abandon.args.notification_id, prepare.args.notification_id);
  assert.ok(!app.events.some(event => event.name === "send"));
});

test("staff text and approved Meta templates bypass agent styling", async () => {
  for (const template of [false, true]) {
    const model = draftModel("Never use this");
    const app = setup({ model, template });
    assert.equal(await app.worker.sendNext(), true);
    assert.equal(model.doGenerateCalls.length, 0);
    assert.ok(
      !app.events.some(event => event.name === "prepare_wa_agent_notice"),
    );
  }
});

test("a booking spanning midnight shows both Oakland dates and preserves its approval", async () => {
  const model = draftModel(warmCompact);
  const app = setup({
    model,
    facts: {
      notificationKind: "booking_update",
      status: "approved",
      reference: "1483ae37",
      title: "Test kitchen booking",
      startsAt: "2026-11-25T07:00:00Z",
      endsAt: "2026-11-25T09:00:00Z",
      amenities: ["bar_prep_table"],
      guestCount: "2",
    },
  });
  assert.equal(await app.worker.sendNext(), true);
  const body = app.events.find(event => event.name === "send").body;
  assert.match(
    body,
    /^Good news, your kitchen booking for Test kitchen booking is approved\./,
  );
  assert.match(
    body,
    /Tue, Nov 24, 2026 at 11:00 PM–Wed, Nov 25, 2026 at 1:00 AM \(Oakland time\)/,
  );
  assert.match(body, /Bar prep table · 2 people/);
  assert.match(body, /Ref\. 1483ae37$/);
});

test("a booking crossing fall-back distinguishes Pacific daylight and standard time", async () => {
  const app = setup({
    model: draftModel(warmCompact),
    facts: {
      notificationKind: "booking_update",
      status: "approved",
      reference: "test",
      startsAt: "2026-11-01T08:30:00Z",
      endsAt: "2026-11-01T09:30:00Z",
    },
  });
  await app.worker.sendNext();
  assert.match(
    app.events.find(event => event.name === "send").body,
    /1:30 AM PDT–1:30 AM PST/,
  );
});
