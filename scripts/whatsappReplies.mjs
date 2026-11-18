import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { GET as privacyNotice } from "../app/api/whatsapp/privacy/route.ts";
import { resolveAgentModel } from "../lib/whatsapp/agent/conversation.ts";
import { createNotificationWorker } from "../lib/whatsapp/agent/notifications.ts";
import { createReplyWorker } from "../lib/whatsapp/agent/replies.ts";
import { createMetaClient, MetaApiError } from "../lib/whatsapp/metaClient.ts";
import {
  handleMetaWebhook,
  verifyMetaSubscription,
} from "../lib/whatsapp/webhook.ts";

// Separate limits for Meta's message batches and the tiny database wake events.
const META_WEBHOOK_MAX_BYTES = 256 * 1024;
const DATABASE_WAKE_MAX_BYTES = 1024;
const WAKE_SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

// Periodic polling keeps the worker moving if a database wake callback is lost.
const RECOVERY_POLL_MS = 30_000;
const HEALTH_WINDOW_MS = 120_000;
const DATABASE_TIMEOUT_MS = 15_000;
const META_TIMEOUT_MS = 20_000;

/** Reads required private configuration without ever printing the configured value. */
function required(name, env = process.env) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Set ${name} in the runtime environment.`);
  return value;
}

/** Validates the deployment target and keeps every pilot recipient explicitly allowlisted. */
export function runtimeSettings(env, args) {
  if (
    args.some(arg => !["--test", "--production"].includes(arg)) ||
    (args.includes("--test") && args.includes("--production"))
  )
    throw new Error("Usage: pnpm whatsapp:replies [--test|--production]");
  const production = args.includes("--production");
  const test = args.includes("--test");
  const url = new URL(required("NEXT_PUBLIC_SUPABASE_URL", env));
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  // Reject a real database in test mode, and a local or fake database in production.
  if (
    test &&
    (env.WHATSAPP_SYNTHETIC_DATABASE !== "1" ||
      !local ||
      url.port !== "55321" ||
      url.protocol !== "http:")
  )
    throw new Error(
      "Test replies require the isolated local database. Run pnpm db:test first.",
    );
  if (
    production &&
    (env.WHATSAPP_SYNTHETIC_DATABASE === "1" ||
      local ||
      url.protocol !== "https:")
  )
    throw new Error(
      "Production requires the intended hosted HTTPS database, not synthetic settings.",
    );
  const phones = production
    ? required("WHATSAPP_RECIPIENTS", env)
        .split(",")
        .map(phone => phone.trim())
    : [required("WHATSAPP_TEST_RECIPIENT", env)];
  if (
    phones.length > 25 ||
    phones.some(phone => !/^[1-9]\d{1,14}$/.test(phone))
  )
    throw new Error(
      "Configure 1–25 pilot recipients, country code and digits only. Wildcards are not allowed.",
    );
  const portText = env.PORT?.trim() || "3001";
  const port = Number(portText);
  if (!/^\d+$/.test(portText) || port < 1 || port > 65535)
    throw new Error("PORT must be between 1 and 65535.");
  return {
    phones: [...new Set(phones)],
    port,
    host: env.HOST?.trim() || (production ? "0.0.0.0" : "127.0.0.1"),
  };
}

/**
 * Signals the next poll. A wake during an active cycle is remembered, and
 * multiple wakes only ask for one more cycle because the database owns the queue.
 */
export function createWorkerWake() {
  let pending = false;
  let resume;
  return {
    wake() {
      pending = true;
      resume?.();
    },
    async wait(milliseconds = RECOVERY_POLL_MS) {
      if (!pending) {
        await new Promise(resolve => {
          const timer = setTimeout(resolve, milliseconds);
          resume = () => {
            clearTimeout(timer);
            resolve();
          };
        });
      }
      resume = undefined;
      pending = false;
    },
  };
}

/** Buffers the exact bytes for signature verification, or returns null when too large. */
async function readBody(incoming, maxBytes) {
  const chunks = [];
  let size = 0;
  // Keep the stream alive long enough to send 413 before Node closes the request.
  for await (const chunk of incoming.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > maxBytes) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** Checks the short-lived HMAC signed by the database, without exposing its Vault key. */
function validWakeSignature(headers, token) {
  const timestamp = headers["x-wa-webhook-timestamp"];
  const nonce = headers["x-wa-webhook-nonce"];
  const signature = headers["x-wa-webhook-signature"];
  if (
    typeof timestamp !== "string" ||
    !/^\d{10}$/.test(timestamp) ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) >
      WAKE_SIGNATURE_TOLERANCE_SECONDS ||
    typeof nonce !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      nonce,
    ) ||
    typeof signature !== "string" ||
    !/^[0-9a-f]{64}$/.test(signature)
  )
    return false;

  // Supabase's pg_net queue can retain headers, so it carries a signature rather
  // than the long-lived token. The validated hex and digest are both 32 bytes.
  const expected = createHmac("sha256", token)
    .update(`${timestamp}.${nonce}`)
    .digest();
  return timingSafeEqual(Buffer.from(signature, "hex"), expected);
}

/** Accepts only a signal to check the database. The request cannot enqueue or send messages. */
async function handleDatabaseWake(incoming, token, wake) {
  if (!token) return new Response("Unavailable", { status: 503 });
  if (!validWakeSignature(incoming.headers, token))
    return new Response("Unauthorized", { status: 401 });

  const body = await readBody(incoming, DATABASE_WAKE_MAX_BYTES);
  if (body === null) return new Response(null, { status: 413 });
  let event;
  try {
    event = JSON.parse(body.toString("utf8"));
  } catch {
    return new Response("Invalid event", { status: 400 });
  }
  if (event?.event !== "queue_changed" || Object.keys(event).length !== 1)
    return new Response("Invalid event", { status: 400 });

  wake();
  return new Response(null, { status: 202 });
}

/** Passes Meta's raw request to the shared signature check and durable inbox handler. */
async function handleMetaPost(incoming, url, config) {
  const body = await readBody(incoming, META_WEBHOOK_MAX_BYTES);
  if (body === null) return new Response(null, { status: 413 });
  const request = new Request(url, {
    method: "POST",
    headers: {
      "x-hub-signature-256": incoming.headers["x-hub-signature-256"] ?? "",
    },
    body,
  });
  return handleMetaWebhook(request, config);
}

/** Exposes the pilot's health, privacy notice, and its two authenticated webhook endpoints. */
export function createWebhookServer({
  appSecret,
  verifyToken,
  phoneNumberId,
  ingest,
  healthy,
  databaseWebhookToken,
  wake = () => {},
}) {
  if (databaseWebhookToken && databaseWebhookToken.length < 32)
    throw new Error(
      "Database webhook token must contain at least 32 characters.",
    );

  const metaConfig = {
    appSecret,
    verifyToken,
    phoneNumberId,
    // Acknowledge only after the inbox is saved, independently of the model loop.
    ingest,
    log: () => console.error("Webhook request could not be accepted."),
  };

  /** Routes only the supported method and path pairs, with no admin API on this server. */
  function route(incoming) {
    const url = new URL(incoming.url, "http://127.0.0.1:3001");
    switch (`${incoming.method} ${url.pathname}`) {
      case "GET /healthz": {
        const ready = healthy();
        return new Response(ready ? "OK" : "Unavailable", {
          status: ready ? 200 : 503,
          headers: { "Cache-Control": "no-store" },
        });
      }
      case "POST /api/whatsapp/database-events":
        return handleDatabaseWake(incoming, databaseWebhookToken, wake);
      case "GET /api/whatsapp/privacy":
        return privacyNotice();
      case "GET /api/whatsapp/webhook":
        return verifyMetaSubscription(url, verifyToken);
      case "POST /api/whatsapp/webhook":
        return handleMetaPost(incoming, url, metaConfig);
      default:
        return new Response("Not found", { status: 404 });
    }
  }

  return createServer(async (incoming, outgoing) => {
    try {
      const response = await route(incoming);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      if (!outgoing.headersSent) outgoing.writeHead(500);
      outgoing.end();
    }
  });
}

/** Reports the delivery stage and provider codes without logging message text or credentials. */
function logSendError(error, kind, fallback) {
  console.error(
    error instanceof MetaApiError
      ? `Meta rejected a ${kind} (HTTP ${error.status}, code ${error.code ?? "unknown"}).`
      : fallback,
  );
}

/** Runs one recipient's recovery, incoming replies, then one proactive notice. */
async function runWorkerCycle(worker, signal, markHealthy) {
  try {
    await worker.recoverSends();
  } catch {
    console.error("Uncertain send recovery failed.");
  }

  // Answer the chef before sending an unrelated proactive update. A failure in
  // one stage should not prevent the worker from trying the other stages.
  try {
    const result = await worker.replies.runOnce();
    if (result.processed) console.log("Saved an AI reply.");
    if (result.sent) console.log("Meta accepted a reply.");
    if (result.processed || result.sent) signal.wake();
    markHealthy();
  } catch (error) {
    logSendError(
      error,
      "reply",
      "Reply attempt failed; check the database outbox and token validity.",
    );
  }

  try {
    if (await worker.notifications.sendNext()) {
      console.log("Meta accepted a notification.");
      signal.wake();
    }
  } catch (error) {
    logSendError(
      error,
      "notice",
      "Notice attempt failed; check the database outbox.",
    );
  }
}

/** Runs allowlisted pilot workers until stopped; the webhook only saves incoming messages. */
async function main() {
  const settings = runtimeSettings(process.env, process.argv.slice(2));
  const db = createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SECRET_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (url, options) =>
          fetch(url, {
            ...options,
            signal: AbortSignal.timeout(DATABASE_TIMEOUT_MS),
          }),
      },
    },
  );
  const rpc = (name, args) => db.rpc(name, args);
  const { model } = resolveAgentModel(process.env);
  const phoneNumberId = required("WHATSAPP_PHONE_NUMBER_ID");
  const meta = createMetaClient({
    phoneNumberId,
    accessToken: required("WHATSAPP_ACCESS_TOKEN"),
    apiVersion: required("WHATSAPP_GRAPH_API_VERSION"),
    fetch: (url, options) =>
      fetch(url, { ...options, signal: AbortSignal.timeout(META_TIMEOUT_MS) }),
  });
  const templateName = process.env.WHATSAPP_ALERT_TEMPLATE_NAME?.trim();
  const template = templateName
    ? {
        name: templateName,
        language: required("WHATSAPP_ALERT_TEMPLATE_LANGUAGE"),
      }
    : undefined;
  const workers = settings.phones.map(phone => ({
    /** Moves aged uncertain sends to review so they do not block the next reply. */
    async recoverSends() {
      const { error } = await rpc("resume_wa_after_uncertain_send", {
        target_phone: phone,
      });
      if (error) throw new Error("Uncertain send recovery failed.");
    },
    replies: createReplyWorker({
      rpc,
      model,
      phone,
      meta,
    }),
    notifications: createNotificationWorker({
      rpc,
      meta,
      model,
      phone,
      template,
    }),
  }));
  const signal = createWorkerWake();
  let running = true;
  let lastHealthyCycle = 0;
  const server = createWebhookServer({
    appSecret: required("WHATSAPP_APP_SECRET"),
    databaseWebhookToken: process.env.WHATSAPP_DATABASE_WEBHOOK_TOKEN?.trim(),
    wake: signal.wake,
    verifyToken: required("WHATSAPP_VERIFY_TOKEN"),
    phoneNumberId,
    // Persist before reporting success to Meta. A wake only shortens the next poll.
    ingest: async batch => {
      const { error } = await rpc("ingest_inbound", { batch });
      if (error) throw new Error("Database ingest failed.");
      signal.wake();
    },
    healthy: () => running && Date.now() - lastHealthyCycle < HEALTH_WINDOW_MS,
  });
  // Bind before polling: a second process that cannot own the port must not send.
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(settings.port, settings.host, resolve);
  });
  console.log(
    "WhatsApp worker running for explicitly configured pilot recipients only.",
  );
  /** Stop accepting callbacks, then finish the bounded in-flight turn before exiting. */
  function stop() {
    running = false;
    signal.wake();
    server.close();
  }
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  /** Readiness reflects recent reply processing, even if no message was waiting. */
  function markHealthy() {
    lastHealthyCycle = Date.now();
  }

  while (running) {
    for (const worker of workers) {
      if (!running) break;
      await runWorkerCycle(worker, signal, markHealthy);
    }
    if (running) await signal.wait();
  }
  server.close();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
