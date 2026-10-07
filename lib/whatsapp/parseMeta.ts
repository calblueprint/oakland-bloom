import type { InboundMessage } from "./inboundMessage.ts";
import { InboundParseError, normalizePhone } from "./inboundMessage.ts";

/**
 * Meta Cloud API webhook payload (JSON).
 *
 * A single POST may batch several entries, changes, and messages, and batching
 * is explicitly not guaranteed, so every level is an array and all of them are
 * walked. Non-message changes (delivery statuses) carry no `messages` array and
 * are skipped rather than treated as errors.
 *
 * Shape verified against Meta's docs — see docs/whatsapp-bot-research.md §III.4.
 */
export function parseMetaPayload(payload: unknown): InboundMessage[] {
  const fail = (reason: string): never => {
    throw new InboundParseError("meta", reason);
  };

  if (!isRecord(payload)) fail("Payload is not an object.");
  const root = payload as Record<string, unknown>;

  if (root.object !== "whatsapp_business_account") {
    fail(
      `Expected object "whatsapp_business_account", got ${JSON.stringify(root.object)}.`,
    );
  }

  const entries = root.entry;
  if (!Array.isArray(entries)) fail("Missing `entry` array.");

  const messages: InboundMessage[] = [];

  for (const entry of entries as unknown[]) {
    if (!isRecord(entry)) fail("`entry` item is not an object.");
    const changes = (entry as Record<string, unknown>).changes;
    if (!Array.isArray(changes)) fail("Entry is missing a `changes` array.");

    for (const change of changes as unknown[]) {
      if (!isRecord(change)) fail("`changes` item is not an object.");
      const value = (change as Record<string, unknown>).value;
      if (!isRecord(value)) fail("Change is missing a `value` object.");

      const raw = (value as Record<string, unknown>).messages;
      // Delivery/read status callbacks have no `messages` key. Not an error.
      if (raw === undefined) continue;
      if (!Array.isArray(raw)) fail("`value.messages` is not an array.");

      for (const message of raw as unknown[]) {
        if (!isRecord(message)) fail("`messages` item is not an object.");
        messages.push(
          parseMetaMessage(message as Record<string, unknown>, fail),
        );
      }
    }
  }

  return messages;
}

function parseMetaMessage(
  message: Record<string, unknown>,
  fail: (reason: string) => never,
): InboundMessage {
  const id = message.id;
  const from = message.from;
  const type = message.type;

  if (typeof id !== "string" || id === "")
    fail("Message is missing a string `id`.");
  if (typeof from !== "string" || from === "")
    fail("Message is missing a string `from`.");

  // Only text is in scope this sprint. Media/location/interactive are real
  // message types, so they fail loudly rather than being silently dropped.
  if (type !== "text") {
    fail(
      `Unsupported message type ${JSON.stringify(type)}; only "text" is handled.`,
    );
  }

  const text = message.text;
  if (!isRecord(text)) fail("Text message is missing a `text` object.");
  const body = (text as Record<string, unknown>).body;
  if (typeof body !== "string") fail("Message is missing `text.body`.");

  return {
    providerMessageId: `meta:${id as string}`,
    from: normalizePhone(from as string),
    text: body,
    provider: "meta",
  };
}

function isRecord(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
