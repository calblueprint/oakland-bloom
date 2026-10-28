import type { InboundMedia, InboundMessage } from "./inboundMessage.ts";
import { InboundParseError, normalizePhone } from "./inboundMessage.ts";

/**
 * Twilio inbound webhook payload.
 *
 * Twilio POSTs form-encoded bodies, not JSON, and sends exactly one message per
 * request — so this returns a one-message array to match the Meta parser's shape.
 * Accepts either a parsed record or a raw `application/x-www-form-urlencoded`
 * string, since a webhook route may hand over either.
 *
 * Shape verified against Twilio's docs — see docs/whatsapp-bot-research.md §I.
 */
export function parseTwilioPayload(payload: unknown): InboundMessage[] {
  const fail = (reason: string): never => {
    throw new InboundParseError("twilio", reason);
  };

  const params = toParams(payload, fail);
  for (const field of [
    "MessageSid",
    "From",
    "Body",
    "NumMedia",
    "MediaUrl0",
    "MediaContentType0",
    "OriginalRepliedMessageSid",
  ]) {
    if (params.getAll(field).length > 1) fail(`Duplicate \`${field}\` field.`);
  }

  const sid = params.get("MessageSid");
  const from = params.get("From");
  const body = params.get("Body");

  if (sid === null || sid.trim() === "") fail("Missing `MessageSid`.");
  if (from === null || from === "") fail("Missing `From`.");
  if (!(from as string).startsWith("whatsapp:+")) {
    fail("`From` must be a WhatsApp channel address (whatsapp:+number).");
  }
  const phone = normalizePhone(from as string);
  if (!/^[1-9]\d{1,14}$/.test(phone)) fail("Invalid `From` number.");
  // Twilio always sends Body for a text message, even when empty. A missing key
  // means this is not a text message webhook.
  if (body === null) fail("Missing `Body`; not a text message payload.");

  // Location shares send `Body=""` plus coordinates, so they would otherwise
  // pass as empty text. Quick-reply taps send `MessageType=button` with the
  // button label in `Body`, so they are handled like typed text. Image and
  // sticker messages are checked against their media fields below.
  const messageType = params.get("MessageType");
  if (
    messageType !== null &&
    !["text", "button", "image", "sticker"].includes(messageType)
  )
    fail(
      `Unsupported message type ${JSON.stringify(messageType)}; only text, reply buttons, images, and stickers are handled.`,
    );
  if (params.has("Latitude") || params.has("Longitude"))
    fail("Unsupported location message; only text is handled.");

  const message: InboundMessage = {
    providerMessageId: `twilio:${sid as string}`,
    from: phone,
    text: body as string,
    provider: "twilio",
  };

  // Media messages carry NumMedia > 0 and the file as MediaUrl0. WhatsApp sends
  // one attachment per message; anything else fails loudly.
  const numMedia = params.get("NumMedia");
  if (numMedia !== null) {
    if (!/^\d+$/.test(numMedia))
      fail("`NumMedia` must be a nonnegative integer.");
    if (Number(numMedia) > 1)
      fail(`Unsupported media message (NumMedia=${numMedia}); expected one.`);
    if (Number(numMedia) === 1) message.media = twilioMedia(params, fail);
  }
  if (
    (messageType === "image" || messageType === "sticker") &&
    message.media === undefined
  )
    fail(`\`MessageType=${messageType}\` is missing its media fields.`);

  const repliedTo = params.get("OriginalRepliedMessageSid");
  if (repliedTo !== null && repliedTo.trim() !== "")
    message.contextMessageId = `twilio:${repliedTo}`;

  return [message];
}

/** Images are JPEG/PNG; WhatsApp stickers arrive as WebP. */
function twilioMedia(
  params: URLSearchParams,
  fail: (reason: string) => never,
): InboundMedia {
  const url = params.get("MediaUrl0");
  const mimeType = params.get("MediaContentType0");
  if (url === null || !url.startsWith("https://"))
    fail("Media message is missing an https `MediaUrl0`.");
  if (mimeType === "image/jpeg" || mimeType === "image/png")
    return { kind: "image", mediaId: url as string, mimeType };
  if (mimeType === "image/webp")
    return { kind: "sticker", mediaId: url as string, mimeType };
  return fail(
    `Unsupported media type ${JSON.stringify(mimeType)}; only images and stickers are handled.`,
  );
}

function toParams(
  payload: unknown,
  fail: (reason: string) => never,
): URLSearchParams {
  if (payload instanceof URLSearchParams) return payload;
  if (typeof payload === "string") return new URLSearchParams(payload);
  if (
    typeof payload === "object" &&
    payload !== null &&
    !Array.isArray(payload)
  ) {
    const prototype = Object.getPrototypeOf(payload);
    if (prototype !== Object.prototype && prototype !== null) {
      fail("Payload must be a plain string record.");
    }
    for (const [field, value] of Object.entries(payload)) {
      if (typeof value !== "string") fail(`\`${field}\` must be a string.`);
    }
    return new URLSearchParams(payload as Record<string, string>);
  }
  return fail(
    "Payload must be form-encoded text, URLSearchParams, or a string record.",
  );
}
