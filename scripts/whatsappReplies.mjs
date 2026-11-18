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
  const url = new URL(required("NEXT_PUBLIC_SUPABASE_URL", env));
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (
    args.includes("--test") &&
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
  if (
    !/^\d+$/.test(portText) ||
    Number(portText) < 1 ||
    Number(portText) > 65535
  )
    throw new Error("PORT must be between 1 and 65535.");
  return {
    phones: [...new Set(phones)],
    port: Number(portText),
    host: env.HOST?.trim() || (production ? "0.0.0.0" : "127.0.0.1"),
  };
}

/** Coalesces callbacks without losing a wake that arrives during a database cycle. */
export function createWorkerWake() {
  let pending = false;
  let resume;
  return {
    wake() {
      pending = true;
      resume?.();
    },
    async wait(milliseconds = 30_000) {
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

/** Exposes signed Meta ingest and an authenticated, content-free database wake callback. */
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
  return createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url, "http://127.0.0.1:3001");
      let response;
      if (url.pathname === "/healthz" && incoming.method === "GET") {
        const ready = healthy();
        response = new Response(ready ? "OK" : "Unavailable", {
          status: ready ? 200 : 503,
          headers: { "Cache-Control": "no-store" },
        });
      } else if (
        url.pathname === "/api/whatsapp/database-events" &&
        incoming.method === "POST"
      ) {
        const timestamp = incoming.headers["x-wa-webhook-timestamp"] ?? "";
        const nonce = incoming.headers["x-wa-webhook-nonce"] ?? "";
        const signature = incoming.headers["x-wa-webhook-signature"] ?? "";
        // pg_net retains request headers. A short-lived signature never exposes the Vault token.
        const validHeaders =
          typeof timestamp === "string" &&
          /^\d{10}$/.test(timestamp) &&
          Math.abs(Date.now() / 1000 - Number(timestamp)) <= 300 &&
          typeof nonce === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
            nonce,
          ) &&
          typeof signature === "string" &&
          /^[0-9a-f]{64}$/.test(signature);
        const expected = createHmac("sha256", databaseWebhookToken ?? "")
          .update(`${timestamp}.${nonce}`)
          .digest();
        const supplied = validHeaders
          ? Buffer.from(signature, "hex")
          : Buffer.alloc(0);
        if (!databaseWebhookToken) {
          response = new Response("Unavailable", { status: 503 });
        } else if (
          !validHeaders ||
          supplied.length !== expected.length ||
          !timingSafeEqual(supplied, expected)
        ) {
          response = new Response("Unauthorized", { status: 401 });
        } else {
          const chunks = [];
          let size = 0;
          for await (const chunk of incoming) {
            size += chunk.length;
            if (size > 1024) {
              outgoing.writeHead(413);
              outgoing.end();
              return;
            }
            chunks.push(chunk);
          }
          let event;
          try {
            event = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          } catch {
            event = null;
          }
          if (
            event?.event !== "queue_changed" ||
            Object.keys(event).length !== 1
          ) {
            response = new Response("Invalid event", { status: 400 });
          } else {
            // Payloads cannot select a recipient or supply a message to send.
            wake();
            response = new Response(null, { status: 202 });
          }
        }
      } else if (
        url.pathname === "/api/whatsapp/privacy" &&
        incoming.method === "GET"
      ) {
        response = privacyNotice();
      } else if (
        url.pathname === "/api/whatsapp/webhook" &&
        incoming.method === "GET"
      ) {
        response = verifyMetaSubscription(url, verifyToken);
      } else if (
        url.pathname === "/api/whatsapp/webhook" &&
        incoming.method === "POST"
      ) {
        const chunks = [];
        let size = 0;
        for await (const chunk of incoming) {
          size += chunk.length;
          if (size > 262144) {
            outgoing.writeHead(413);
            outgoing.end();
            return;
          }
          chunks.push(chunk);
        }
        response = await handleMetaWebhook(
          new Request(url, {
            method: "POST",
            headers: {
              "x-hub-signature-256":
                incoming.headers["x-hub-signature-256"] ?? "",
            },
            body: Buffer.concat(chunks),
          }),
          {
            appSecret,
            verifyToken,
            phoneNumberId,
            // Acknowledge only after the inbox is saved, independently of the model loop.
            ingest,
            log: () => console.error("Webhook request could not be accepted."),
          },
        );
      } else {
        response = new Response("Not found", { status: 404 });
      }
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      if (!outgoing.headersSent) outgoing.writeHead(500);
      outgoing.end();
    }
  });
}

/** Runs allowlisted pilot workers until stopped; the webhook only saves incoming messages. */
async function main() {
  const args = process.argv.slice(2);
  const settings = runtimeSettings(process.env, args);
  const db = createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SECRET_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (url, options) =>
          fetch(url, { ...options, signal: AbortSignal.timeout(15_000) }),
      },
    },
  );
  const { model } = resolveAgentModel(process.env);
  const meta = createMetaClient({
    phoneNumberId: required("WHATSAPP_PHONE_NUMBER_ID"),
    accessToken: required("WHATSAPP_ACCESS_TOKEN"),
    apiVersion: required("WHATSAPP_GRAPH_API_VERSION"),
    fetch: (url, options) =>
      fetch(url, { ...options, signal: AbortSignal.timeout(20_000) }),
  });
  const templateName = process.env.WHATSAPP_ALERT_TEMPLATE_NAME?.trim();
  const template = templateName
    ? {
        name: templateName,
        language: required("WHATSAPP_ALERT_TEMPLATE_LANGUAGE"),
      }
    : undefined;
  const workers = settings.phones.map(phone => ({
    async recoverSends() {
      const { error } = await db.rpc("resume_wa_after_uncertain_send", {
        target_phone: phone,
      });
      if (error) throw new Error("Uncertain send recovery failed.");
    },
    replies: createReplyWorker({
      rpc: (name, args) => db.rpc(name, args),
      model,
      phone,
      meta,
    }),
    notifications: createNotificationWorker({
      rpc: (name, args) => db.rpc(name, args),
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
    phoneNumberId: required("WHATSAPP_PHONE_NUMBER_ID"),
    ingest: async batch => {
      const { error } = await db.rpc("ingest_inbound", { batch });
      if (error) throw new Error("Database ingest failed.");
      signal.wake();
    },
    healthy: () => running && Date.now() - lastHealthyCycle < 120_000,
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
  while (running) {
    for (const worker of workers) {
      if (!running) break;
      try {
        await worker.recoverSends();
      } catch {
        console.error("Uncertain send recovery failed.");
      }
      // Answer the chef before sending an unrelated proactive update.
      try {
        const result = await worker.replies.runOnce();
        if (result.processed) console.log("Saved an AI reply.");
        if (result.sent) console.log("Meta accepted a reply.");
        if (result.processed || result.sent) signal.wake();
        lastHealthyCycle = Date.now();
      } catch (error) {
        // Keep private message content and provider responses out of terminal logs.
        console.error(
          error instanceof MetaApiError
            ? `Meta rejected a reply (HTTP ${error.status}, code ${error.code ?? "unknown"}).`
            : "Reply attempt failed; check the database outbox and token validity.",
        );
      }
      try {
        if (await worker.notifications.sendNext()) {
          console.log("Meta accepted a notification.");
          signal.wake();
        }
      } catch (error) {
        console.error(
          error instanceof MetaApiError
            ? `Meta rejected a notice (HTTP ${error.status}, code ${error.code ?? "unknown"}).`
            : "Notice attempt failed; check the database outbox.",
        );
      }
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
