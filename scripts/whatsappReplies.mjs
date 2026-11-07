import { createServer } from "node:http";
import { setTimeout } from "node:timers/promises";
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
function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name} in .env.local.`);
  return value;
}

/** Exposes only the signed webhook and public privacy notice to the local Cloudflare connection. */
async function startWebhook(db) {
  const appSecret = required("WHATSAPP_APP_SECRET");
  const verifyToken = required("WHATSAPP_VERIFY_TOKEN");
  const server = createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url, "http://127.0.0.1:3001");
      let response;
      if (
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
            // Acknowledge only after the inbox is saved, independently of the model loop.
            ingest: async batch => {
              const { error } = await db.rpc("ingest_inbound", { batch });
              if (error) throw new Error("Database ingest failed.");
            },
            log: () => console.error("Webhook request could not be accepted."),
          },
        );
      } else {
        response = new Response("Not found", { status: 404 });
      }
      outgoing.writeHead(response.status, {
        "content-type": response.headers.get("content-type") ?? "text/plain",
      });
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      if (!outgoing.headersSent) outgoing.writeHead(500);
      outgoing.end();
    }
  });
  // Do not process messages until this process actually owns the webhook port.
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(3001, "127.0.0.1", resolve);
  });
  return server;
}

/** Runs the local reply worker until stopped; the webhook itself only saves incoming messages. */
async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== "--test"))
    throw new Error("Usage: pnpm whatsapp:replies [--test]");
  if (args.includes("--test")) {
    const url = new URL(required("NEXT_PUBLIC_SUPABASE_URL"));
    if (
      process.env.WHATSAPP_SYNTHETIC_DATABASE !== "1" ||
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      url.port !== "55321" ||
      url.protocol !== "http:"
    ) {
      throw new Error(
        "Test replies require the isolated local database. Run pnpm db:test first.",
      );
    }
  }
  const phone = required("WHATSAPP_TEST_RECIPIENT");
  const db = createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SECRET_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { model } = resolveAgentModel(process.env);
  const meta = createMetaClient({
    phoneNumberId: required("WHATSAPP_PHONE_NUMBER_ID"),
    accessToken: required("WHATSAPP_ACCESS_TOKEN"),
    apiVersion: required("WHATSAPP_GRAPH_API_VERSION"),
    fetch: (url, options) =>
      fetch(url, { ...options, signal: AbortSignal.timeout(20_000) }),
  });
  const worker = createReplyWorker({
    rpc: (name, args) => db.rpc(name, args),
    model,
    phone,
    meta,
  });
  const templateName = process.env.WHATSAPP_ALERT_TEMPLATE_NAME?.trim();
  const notifications = createNotificationWorker({
    rpc: (name, args) => db.rpc(name, args),
    meta,
    phone,
    template: templateName
      ? {
          name: templateName,
          language: required("WHATSAPP_ALERT_TEMPLATE_LANGUAGE"),
        }
      : undefined,
  });
  const server = await startWebhook(db);
  console.log(
    "WhatsApp replies running for the configured test recipient only.",
  );
  let running = true;
  process.on("SIGINT", () => {
    running = false;
  });
  process.on("SIGTERM", () => {
    running = false;
  });
  while (running) {
    try {
      if (await notifications.sendNext())
        console.log("Meta accepted a notification.");
      const result = await worker.runOnce();
      if (result.processed) console.log("Saved an AI reply.");
      if (result.sent) console.log("Meta accepted a reply.");
    } catch (error) {
      // Keep private message content and provider responses out of terminal logs.
      console.error(
        error instanceof MetaApiError
          ? `Meta rejected a reply (HTTP ${error.status}, code ${error.code ?? "unknown"}).`
          : "Reply attempt failed; check the database outbox and token validity.",
      );
    }
    await setTimeout(1500);
  }
  server.close();
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
