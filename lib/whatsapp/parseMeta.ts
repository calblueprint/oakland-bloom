import type {
  InboundBatch,
  InboundMessage,
  RejectedMessage,
} from "./inboundMessage.ts";
import { InboundParseError, normalizePhone } from "./inboundMessage.ts";

/**
 * Meta Cloud API webhook payload (JSON).
 *
 * A single POST may batch several entries, changes, and messages, and batching
 * is explicitly not guaranteed, so every level is an array and all of them are
 * walked. Non-message changes (delivery statuses) carry no `messages` array and
 * are skipped rather than treated as errors.
 *
 * A broken envelope (wrong `object`, missing `entry`/`changes`/`value`) throws,
 * since nothing in it can be trusted. A single bad message is collected in
 * `rejected` instead: Meta retries the whole POST on failure, so throwing would
 * drop every valid message batched alongside it on every retry.
 *
 * Shape verified against Meta's docs — see docs/whatsapp-bot-research.md §III.4.
 */
export function parseMetaPayload(payload: unknown): InboundBatch {
  const fail = (reason: string): never => {
    throw new InboundParseError("meta", reason);
  };

  if (!isRecord(payload)) return fail("Payload is not an object.");

  if (payload.object !== "whatsapp_business_account") {
    fail(
      `Expected object "whatsapp_business_account", got ${JSON.stringify(payload.object)}.`,
    );
  }

  const entries = payload.entry;
  if (!Array.isArray(entries)) return fail("Missing `entry` array.");

  const messages: InboundMessage[] = [];
  const rejected: RejectedMessage[] = [];

  for (const entry of entries as unknown[]) {
    if (!isRecord(entry)) return fail("`entry` item is not an object.");
    const changes = entry.changes;
    if (!Array.isArray(changes)) fail("Entry is missing a `changes` array.");

    for (const change of changes as unknown[]) {
      if (!isRecord(change)) return fail("`changes` item is not an object.");
      const value = change.value;
      if (!isRecord(value)) return fail("Change is missing a `value` object.");

      const raw = value.messages;
      // Delivery/read status callbacks have no `messages` key. Not an error.
      if (raw === undefined) continue;
      if (!Array.isArray(raw)) fail("`value.messages` is not an array.");

      for (const message of raw as unknown[]) {
        try {
          messages.push(parseMetaMessage(message, fail));
        } catch (error) {
          if (!(error instanceof InboundParseError)) throw error;
          rejected.push({
            providerMessageId: messageId(message),
            from: senderPhone(message),
            reason: error.message,
          });
        }
      }
    }
  }

  return { messages, rejected };
}

function parseMetaMessage(
  message: unknown,
  fail: (reason: string) => never,
): InboundMessage {
  if (!isRecord(message)) return fail("`messages` item is not an object.");

  const id = messageId(message);
  const from = message.from;

  if (id === null) return fail("Message is missing a string `id`.");
  if (typeof from !== "string" || from === "")
    return fail("Message is missing a string `from`.");
  const phone = normalizePhone(from);
  if (!/^[1-9]\d{1,14}$/.test(phone))
    fail("Message has an invalid `from` number.");

  const parsed: InboundMessage = {
    providerMessageId: id,
    from: phone,
    ...messageContent(message, fail),
    provider: "meta",
  };

  // A swipe-reply carries the quoted message's ID. Forwarded messages also have
  // `context` but no `id`, so only a string ID is kept.
  const context = message.context;
  if (isRecord(context) && typeof context.id === "string" && context.id !== "")
    parsed.contextMessageId = `meta:${context.id}`;

  const timestamp = message.timestamp;
  if (timestamp !== undefined) {
    if (typeof timestamp !== "string" || !/^\d{1,12}$/.test(timestamp))
      fail("Message `timestamp` must be Unix seconds as a string.");
    parsed.sentAt = new Date(Number(timestamp) * 1000).toISOString();
  }

  return parsed;
}

/**
 * Quick-reply taps on template buttons arrive as `button`, and interactive
 * replies as `interactive`. Both carry the visible label the chef tapped, which
 * is what they would otherwise have typed, so it becomes the message text.
 * Images and stickers keep a media reference, with any caption as the text.
 * Audio, location, and other types fail loudly rather than being dropped.
 */
function messageContent(
  message: Record<string, unknown>,
  fail: (reason: string) => never,
): Pick<InboundMessage, "text" | "media"> {
  const type = message.type;

  if (type === "image" || type === "sticker") {
    const media = message[type];
    if (
      !isRecord(media) ||
      typeof media.id !== "string" ||
      media.id === "" ||
      typeof media.mime_type !== "string" ||
      media.mime_type === ""
    ) {
      return fail(
        `${type} message is missing \`${type}.id\` or \`mime_type\`.`,
      );
    }
    if (media.caption !== undefined && typeof media.caption !== "string")
      fail(`\`${type}.caption\` must be a string.`);
    if (media.sha256 !== undefined && typeof media.sha256 !== "string")
      fail(`\`${type}.sha256\` must be a string.`);
    return {
      text: (media.caption as string | undefined) ?? "",
      media: {
        kind: type,
        mediaId: media.id,
        mimeType: media.mime_type,
        ...(media.sha256 === undefined ? {} : { sha256: media.sha256 }),
      },
    };
  }

  return { text: messageText(message, type, fail) };
}

function messageText(
  message: Record<string, unknown>,
  type: unknown,
  fail: (reason: string) => never,
): string {
  if (type === "text") {
    const text = message.text;
    if (!isRecord(text) || typeof text.body !== "string")
      return fail("Message is missing `text.body`.");
    return text.body;
  }

  if (type === "button") {
    const button = message.button;
    if (!isRecord(button) || typeof button.text !== "string")
      return fail("Button reply is missing `button.text`.");
    return button.text;
  }

  if (type === "interactive") {
    const interactive = message.interactive;
    if (!isRecord(interactive))
      return fail("Interactive reply is missing an `interactive` object.");
    const reply = interactive.button_reply ?? interactive.list_reply;
    if (!isRecord(reply) || typeof reply.title !== "string") {
      return fail(
        "Interactive reply is missing `button_reply.title` or `list_reply.title`.",
      );
    }
    return reply.title;
  }

  return fail(
    `Unsupported message type ${JSON.stringify(type)}; only text, reply buttons, images, and stickers are handled.`,
  );
}

function senderPhone(message: unknown): string | null {
  if (!isRecord(message) || typeof message.from !== "string") return null;
  const phone = normalizePhone(message.from);
  return /^[1-9]\d{1,14}$/.test(phone) ? phone : null;
}

function messageId(message: unknown): string | null {
  if (!isRecord(message)) return null;
  const id = message.id;
  return typeof id === "string" && id.trim() !== "" ? `meta:${id}` : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
