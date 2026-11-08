import assert from "node:assert/strict";
import { test } from "node:test";
import { createStaffApi } from "../lib/whatsapp/staffApi.ts";

const actorId = "10000000-0000-4000-8000-000000000001";
const chefId = "20000000-0000-4000-8000-000000000001";
const requestId = "30000000-0000-4000-8000-000000000001";
const origin = "http://localhost:3000";

/** Records privileged calls so tests prove rejected requests never create a server client. */
function setup({
  account = { userId: actorId, isAdmin: true },
  rpcError,
  throws = false,
} = {}) {
  const calls = [];
  let clients = 0;
  const api = createStaffApi({
    getAccount: async () => account,
    createRpc: () => {
      clients++;
      return async (name, args) => {
        calls.push({ name, args });
        if (throws)
          throw new Error("private database credentials and conversation text");
        return { data: [{ id: requestId }], error: rpcError ?? null };
      };
    },
  });
  return {
    api,
    calls,
    get clients() {
      return clients;
    },
  };
}

/** Creates browser-style same-origin staff mutations with explicit fake fixture IDs. */
function post(body, headers = {}) {
  return new Request(`${origin}/api/admin/whatsapp`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("staff API rejects signed-out and non-admin callers before creating a privileged client", async () => {
  for (const [account, expected] of [
    [null, 401],
    [{ userId: actorId, isAdmin: false }, 403],
  ]) {
    const app = setup({ account });
    const response = await app.api.GET(
      new Request(`${origin}/api/admin/whatsapp`),
    );
    assert.equal(response.status, expected);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(app.clients, 0);
  }
});

test("queue and conversation reads bind the verified actor and do not share-cache their results", async () => {
  const app = setup();
  const queue = await app.api.GET(new Request(`${origin}/api/admin/whatsapp`));
  assert.equal(queue.status, 200);
  assert.deepEqual(await queue.json(), { data: [{ id: requestId }] });
  assert.equal(queue.headers.get("cache-control"), "private, no-store");
  const conversation = await app.api.GET(
    new Request(`${origin}/api/admin/whatsapp?chefId=${chefId}`),
  );
  assert.equal(conversation.status, 200);
  assert.deepEqual(app.calls, [
    { name: "get_wa_staff_queue", args: { actor_id: actorId } },
    {
      name: "get_wa_staff_conversation",
      args: { actor_id: actorId, chef_id: chefId },
    },
  ]);
});

test("invalid or caller-supplied actor query parameters are rejected", async () => {
  for (const query of [
    "chefId=not-an-id",
    `chefId=${chefId}&chefId=${chefId}`,
    `actor_id=${chefId}`,
    "chefId=",
  ]) {
    const app = setup();
    const response = await app.api.GET(
      new Request(`${origin}/api/admin/whatsapp?${query}`),
    );
    assert.equal(response.status, 400);
    assert.equal(app.clients, 0);
  }
});

test("staff mutations call only the validated operation with the session actor", async () => {
  const app = setup();
  for (const takeover of [true, false]) {
    assert.equal(
      (await app.api.POST(post({ action: "takeover", chefId, takeover })))
        .status,
      200,
    );
  }
  assert.equal(
    (await app.api.POST(post({ action: "resolve", handoffId: requestId })))
      .status,
    200,
  );
  assert.equal(
    (
      await app.api.POST(
        post({ action: "reply", chefId, requestId, body: " A staff reply " }),
      )
    ).status,
    200,
  );
  assert.deepEqual(app.calls, [
    {
      name: "set_wa_staff_takeover",
      args: { actor_id: actorId, chef_id: chefId, takeover: true },
    },
    {
      name: "set_wa_staff_takeover",
      args: { actor_id: actorId, chef_id: chefId, takeover: false },
    },
    {
      name: "resolve_wa_handoff",
      args: { actor_id: actorId, handoff_id: requestId },
    },
    {
      name: "queue_wa_staff_reply",
      args: {
        actor_id: actorId,
        chef_id: chefId,
        request_id: requestId,
        body: "A staff reply",
      },
    },
  ]);
});

test("strict mutation schemas reject spoofed actors, extra fields, empty replies and malformed IDs", async () => {
  const inputs = [
    { action: "resolve", handoffId: requestId, actor_id: chefId },
    { action: "takeover", chefId, takeover: "true" },
    { action: "reply", chefId, requestId, body: " " },
    { action: "reply", chefId, requestId, body: "x".repeat(4001) },
    { action: "reply", chefId, requestId: "bad", body: "Hello" },
    { action: "consent", chefId, optedIn: true, evidence: " " },
    {
      action: "consent",
      chefId,
      optedIn: "true",
      evidence: "Chef requested alerts.",
    },
    { action: "consent", chefId, optedIn: true, evidence: "x".repeat(501) },
    { action: "delete", chefId },
    "not JSON",
  ];
  for (const input of inputs) {
    const app = setup();
    const response = await app.api.POST(post(input));
    assert.equal(response.status, 400);
    assert.equal(app.clients, 0);
  }
});

test("consent records explicit staff evidence for either opt-in or withdrawal", async () => {
  const app = setup();
  for (const optedIn of [true, false]) {
    const response = await app.api.POST(
      post({
        action: "consent",
        chefId,
        optedIn,
        evidence: " Chef requested this change in person. ",
      }),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(app.calls.at(-1), {
      name: "set_wa_alert_consent",
      args: {
        actor_id: actorId,
        chef_id: chefId,
        opted_in: optedIn,
        evidence: "Chef requested this change in person.",
      },
    });
  }
});

test("cookie-authenticated mutations require a same-origin JSON request", async () => {
  const inputs = [
    [{ origin: "https://attacker.example" }, 403],
    [{ origin: "null" }, 403],
    [{ "sec-fetch-site": "cross-site" }, 403],
    [{ "content-type": "text/plain" }, 415],
  ];
  for (const [headers, expected] of inputs) {
    const app = setup();
    const response = await app.api.POST(
      post({ action: "resolve", handoffId: requestId }, headers),
    );
    assert.equal(response.status, expected);
    assert.equal(app.clients, 0);
  }
  const app = setup();
  const request = post({ action: "resolve", handoffId: requestId });
  request.headers.delete("origin");
  assert.equal((await app.api.POST(request)).status, 403);
  assert.equal(app.clients, 0);
});

test("same-origin checks use the direct Host when Next normalizes Request.url to localhost", async () => {
  const app = setup();
  const response = await app.api.POST(
    post(
      { action: "resolve", handoffId: requestId },
      {
        host: "127.0.0.1:3000",
        origin: "http://127.0.0.1:3000",
        "sec-fetch-site": "same-origin",
      },
    ),
  );
  assert.equal(response.status, 200);
  assert.equal(app.calls[0].name, "resolve_wa_handoff");
});

test("forwarded hosts, malformed direct hosts and internal origins cannot authorize mutations", async () => {
  const headers = [
    { host: "127.0.0.1:3000", origin, "x-forwarded-host": "localhost:3000" },
    {
      host: "localhost:3000",
      origin: "https://attacker.example",
      "x-forwarded-host": "attacker.example",
    },
    { host: "localhost:3000/path" },
    { host: "user@localhost:3000" },
    { host: "localhost:3000, attacker.example" },
    { host: "localhost:99999" },
    { host: "localhost:3000", origin: "https://localhost:3000" },
  ];
  for (const header of headers) {
    const app = setup();
    const response = await app.api.POST(
      post({ action: "resolve", handoffId: requestId }, header),
    );
    assert.equal(response.status, 403);
    assert.equal(app.clients, 0);
  }
});

test("oversized bodies fail before privileged calls with absent, accurate or misleading Content-Length", async () => {
  for (const headers of [
    {},
    { "content-length": "17000" },
    { "content-length": "1" },
  ]) {
    const app = setup();
    const response = await app.api.POST(post("x".repeat(17000), headers));
    assert.equal(response.status, 413);
    assert.equal(app.clients, 0);
  }
});

test("database errors preserve deliberate status codes without disclosing private details", async () => {
  for (const [code, status] of [
    ["42501", 403],
    ["P0002", 404],
    ["22023", 400],
    ["55000", 409],
    ["XX000", 503],
  ]) {
    const app = setup({
      rpcError: { code, message: "secret connection details" },
    });
    const response = await app.api.GET(
      new Request(`${origin}/api/admin/whatsapp`),
    );
    assert.equal(response.status, status);
    assert.ok(!(await response.text()).includes("secret connection"));
  }
  const app = setup({ throws: true });
  const response = await app.api.GET(
    new Request(`${origin}/api/admin/whatsapp`),
  );
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes("private database"));
});
