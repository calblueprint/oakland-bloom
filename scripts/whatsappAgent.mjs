import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { createCateringAgent } from "../lib/whatsapp/agent/conversation.ts";
import { resolveAgentModel } from "../lib/whatsapp/agent/model.ts";
import { FileAgentStore } from "../lib/whatsapp/agent/store.ts";
import {
  createDemoModel,
  DEMO_TURNS,
  FICTIONAL_CHEF,
  FICTIONAL_SEED,
} from "./whatsappAgentDemo.mjs";

function printResponse(response) {
  for (const trace of response.toolCalls) {
    console.log(
      `tool: ${trace.name}(${JSON.stringify(trace.input)}) -> ${JSON.stringify(trace.output)}`,
    );
  }
  console.log(`assistant [${response.outcome}]: ${response.reply}\n`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--live")) {
    throw new Error("Usage: pnpm agent:whatsapp [--live]");
  }
  const live = args[0] === "--live";
  const root = fileURLToPath(new URL("../", import.meta.url));
  const statePath = resolve(
    root,
    ".local",
    "whatsapp-agent",
    live ? "live.json" : "demo.json",
  );
  console.log(
    live
      ? "mode: LIVE MODEL, local fictional data; provider calls may incur charges."
      : "mode: SCRIPTED OFFLINE DEMO, SDK mock model; no model API calls.",
  );
  console.log(`state file: ${statePath}`);
  console.log(
    `fictional sender: ${FICTIONAL_CHEF.name} (${FICTIONAL_CHEF.phone})`,
  );
  console.log("Local replies only; no WhatsApp messages or Supabase writes.\n");

  let model;
  if (live) {
    const configured = resolveAgentModel(process.env);
    model = configured.model;
    console.log(`model: ${configured.label}\n`);
  } else {
    model = createDemoModel();
  }

  const store = new FileAgentStore(statePath, FICTIONAL_SEED);
  const agent = createCateringAgent({ model, store });
  const respond = async text =>
    agent.respond({
      provider: "meta",
      providerMessageId: `meta:local-${randomUUID()}`,
      from: FICTIONAL_CHEF.phone,
      text,
    });

  if (!live) {
    for (const text of DEMO_TURNS) {
      console.log(`chef: ${text}`);
      printResponse(await respond(text));
    }
    console.log(
      "Demo complete. Model decisions were scripted; this checks orchestration, not natural-language intent quality.",
    );
    return;
  }

  console.log("Type as the fictional chef. Use /exit to leave.");
  const reader = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  process.stdout.write("chef> ");
  try {
    for await (const text of reader) {
      if (text.trim() === "/exit") break;
      if (text.trim()) {
        try {
          printResponse(await respond(text));
        } catch (error) {
          console.error(`Turn failed: ${error.message}. You can retry.`);
        }
      }
      process.stdout.write("chef> ");
    }
  } finally {
    reader.close();
  }
}

main().catch(error => {
  console.error(`WhatsApp agent: ${error.message}`);
  process.exitCode = 1;
});
