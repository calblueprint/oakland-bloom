import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import {
  createWebhookServer,
  runtimeSettings,
} from "../scripts/whatsappReplies.mjs";

const hosted = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  WHATSAPP_RECIPIENTS: "15555550101,15555550102,15555550101",
  PORT: "8080",
};

test("hosted runtime requires explicit pilot recipients and excludes synthetic settings", () => {
  assert.deepEqual(runtimeSettings(hosted, ["--production"]), {
    phones: ["15555550101", "15555550102"],
    host: "0.0.0.0",
    port: 8080,
  });
  for (const override of [
    { WHATSAPP_RECIPIENTS: "" },
    { WHATSAPP_RECIPIENTS: "*" },
    { WHATSAPP_RECIPIENTS: "15555550101," },
    { WHATSAPP_SYNTHETIC_DATABASE: "1" },
    { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55321" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://localhost" },
    { NEXT_PUBLIC_SUPABASE_URL: "http://example.supabase.co" },
    { PORT: "0" },
    { PORT: "65536" },
    { PORT: "8080no" },
  ])
    assert.throws(() =>
      runtimeSettings({ ...hosted, ...override }, ["--production"]),
    );
  assert.throws(() => runtimeSettings(hosted, ["--test", "--production"]));
  assert.throws(() => runtimeSettings(hosted, ["--unknown"]));
});

test("local test mode retains its isolated database and single recipient", () => {
  const local = {
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55321",
    WHATSAPP_TEST_RECIPIENT: "15555550101",
    WHATSAPP_SYNTHETIC_DATABASE: "1",
  };
  assert.deepEqual(runtimeSettings(local, ["--test"]), {
    phones: ["15555550101"],
    host: "127.0.0.1",
    port: 3001,
  });
  assert.throws(() =>
    runtimeSettings(
      { ...local, NEXT_PUBLIC_SUPABASE_URL: hosted.NEXT_PUBLIC_SUPABASE_URL },
      ["--test"],
    ),
  );
});

test("hosted HTTP server reports readiness and preserves signed, durable ingest", async t => {
  let healthy = false;
  let persisted = false;
  let rejectIngest = false;
  const server = createWebhookServer({
    appSecret: "test-secret",
    verifyToken: "test-verify",
    healthy: () => healthy,
    ingest: async () => {
      if (rejectIngest) throw new Error("private failure");
      persisted = true;
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise(resolve => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + "/healthz")).status, 503);
  healthy = true;
  const ready = await fetch(base + "/healthz");
  assert.equal(ready.status, 200);
  assert.equal(ready.headers.get("cache-control"), "no-store");
  assert.equal(await ready.text(), "OK");
  assert.equal(
    (
      await fetch(
        base +
          "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=test-verify&hub.challenge=123",
      )
    ).status,
    200,
  );
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [],
  });
  const post = signature =>
    fetch(base + "/api/whatsapp/webhook", {
      method: "POST",
      body,
      headers: { "x-hub-signature-256": signature },
    });
  assert.equal((await post("invalid")).status, 401);
  assert.equal(persisted, false);
  const signature =
    "sha256=" + createHmac("sha256", "test-secret").update(body).digest("hex");
  assert.equal((await post(signature)).status, 200);
  assert.equal(persisted, true);
  rejectIngest = true;
  assert.equal((await post(signature)).status, 503);
  assert.equal((await fetch(base + "/api/admin/whatsapp")).status, 404);
  assert.equal((await fetch(base + "/api/whatsapp/privacy")).status, 200);
});
