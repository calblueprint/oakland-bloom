import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { MockLanguageModelV4 } from "ai/test";
import { createReplyWorker } from "../lib/whatsapp/agent/replies.ts";
import { MetaApiError } from "../lib/whatsapp/metaClient.ts";

const phone = "15555550101";
const chefId = randomUUID();

/** Builds a fake inbox/outbox around the real agent so tests exercise the complete worker turn. */
function setup({ modelFails = false, commitFails = false, sendError } = {}) {
  const events = [];
  let inbound = {
    inboundId: randomUUID(),
    message: {
      provider: "meta",
      providerMessageId: "meta:in-1",
      from: phone,
      text: "yo",
    },
    state: {
      version: 1,
      chefs: [{ id: chefId, name: "Test Chef", phone }],
      opportunities: [],
      conversations: [],
      responses: [],
      handoffs: [],
      receipts: [],
    },
  };
  let outgoing = null;
  let saved;
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      events.push("model");
      if (modelFails) throw new Error("model failed");
      return {
        content: [
          {
            type: "text",
            text: "Hey! I'm Oakland Bloom's automated assistant.",
          },
        ],
        finishReason: { unified: "stop", raw: "stop" },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
        warnings: [],
      };
    },
  });
  const worker = createReplyWorker({
    phone,
    model,
    rpc: async (name, args) => {
      events.push(name);
      let data = null;
      if (name === "claim_wa_turn") data = inbound;
      if (name === "commit_wa_turn") {
        if (commitFails)
          return { data: null, error: { message: "private DB detail" } };
        saved = args.turn_state;
        outgoing = {
          id: randomUUID(),
          phone,
          body: saved.receipts[0].result.reply,
          replyTo: inbound.message.providerMessageId,
          status: "pending",
        };
        inbound = null;
        data = outgoing.id;
      }
      if (name === "claim_wa_reply" && outgoing?.status === "pending") {
        outgoing.status = "unknown";
        data = {
          id: outgoing.id,
          phone: outgoing.phone,
          body: outgoing.body,
          replyTo: outgoing.replyTo,
        };
      }
      if (name === "finish_wa_reply") outgoing.status = "sent";
      if (name === "fail_wa_reply") outgoing.status = "failed";
      return { data, error: null };
    },
    meta: {
      sendText: async (to, body, options) => {
        events.push("send");
        assert.equal(outgoing.status, "unknown");
        assert.equal(to, phone);
        assert.equal(body, outgoing.body);
        assert.equal(options.replyTo, outgoing.replyTo);
        if (sendError) throw sendError;
        return { providerMessageId: "meta:out-1" };
      },
    },
  });
  return {
    worker,
    events,
    get saved() {
      return saved;
    },
    get outgoing() {
      return outgoing;
    },
    get inbound() {
      return inbound;
    },
  };
}

test("AI reply and conversation commit before the real send; polling again does not duplicate it", async () => {
  const app = setup();
  assert.deepEqual(await app.worker.runOnce(), { processed: true, sent: true });
  assert.ok(app.events.indexOf("commit_wa_turn") < app.events.indexOf("send"));
  assert.equal(app.saved.conversations[0].turns[0].text, "yo");
  assert.equal(app.outgoing.status, "sent");
  assert.deepEqual(await app.worker.runOnce(), {
    processed: false,
    sent: false,
  });
  assert.equal(app.events.filter(item => item === "send").length, 1);
});

test("a model or commit failure releases the turn and sends nothing", async () => {
  for (const config of [{ modelFails: true }, { commitFails: true }]) {
    const app = setup(config);
    await assert.rejects(app.worker.runOnce());
    assert.ok(app.events.includes("release_wa_turn"));
    assert.ok(!app.events.includes("send"));
    assert.ok(app.inbound);
  }
});

test("uncertain send is left unknown and never automatically sent a second time", async () => {
  const app = setup({
    sendError: new Error("connection dropped after acceptance"),
  });
  await assert.rejects(app.worker.runOnce());
  assert.equal(app.outgoing.status, "unknown");
  await app.worker.runOnce();
  assert.equal(app.events.filter(item => item === "send").length, 1);
});

test("a confirmed token refusal becomes failed; server errors remain unknown", async () => {
  for (const status of [401, 500, 429, 408]) {
    const app = setup({
      sendError: new MetaApiError(status, 190, "test refusal"),
    });
    await assert.rejects(app.worker.runOnce());
    assert.equal(app.outgoing.status, status === 401 ? "failed" : "unknown");
  }
});

test("a queued reply is sent before a later turn is claimed", async () => {
  const app = setup();
  await app.worker.processNext();
  app.events.length = 0;
  await app.worker.runOnce();
  assert.ok(
    app.events.indexOf("finish_wa_reply") < app.events.indexOf("claim_wa_turn"),
  );
});

test("invalid stored input releases its lease and never reaches the model", async () => {
  const app = setup();
  app.inbound.message.text = "😀".repeat(4001);
  await assert.rejects(app.worker.runOnce());
  assert.ok(app.events.includes("release_wa_turn"));
  assert.ok(!app.events.includes("model"));
});
