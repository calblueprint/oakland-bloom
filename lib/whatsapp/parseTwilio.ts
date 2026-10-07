import type { InboundMessage } from "./inboundMessage.ts";
import { InboundParseError, normalizePhone } from "./inboundMessage.ts";

/**
 * Twilio inbound webhook payload.
 *
 * Twilio POSTs form-encoded bodies, not JSON, and sends exactly one message per
 * request — so this returns an array of 0 or 1 to match the Meta parser's shape.
 * Accepts either a parsed record or a raw `application/x-www-form-urlencoded`
 * string, since a webhook route may hand over either.
 *
 * Shape verified against Twilio's docs — see docs/whatsapp-bot-research.md §I.
 */
export function parseTwilioPayload(
  payload: Record<string, string> | URLSearchParams | string,
): InboundMessage[] {
  const fail = (reason: string): never => {
    throw new InboundParseError("twilio", reason);
  };

  const params = toParams(payload, fail);

  const sid = params.get("MessageSid");
  const from = params.get("From");
  const body = params.get("Body");

  if (sid === null || sid === "") fail("Missing `MessageSid`.");
  if (from === null || from === "") fail("Missing `From`.");
  // Twilio always sends Body for a text message, even when empty. A missing key
  // means this is not a text message webhook.
  if (body === null) fail("Missing `Body`; not a text message payload.");

  // Media messages carry NumMedia > 0. Out of scope this sprint, so fail loudly.
  const numMedia = params.get("NumMedia");
  if (numMedia !== null && numMedia !== "" && Number(numMedia) > 0) {
    fail(
      `Unsupported media message (NumMedia=${numMedia}); only text is handled.`,
    );
  }

  return [
    {
      providerMessageId: `twilio:${sid as string}`,
      from: normalizePhone(from as string),
      text: body as string,
      provider: "twilio",
    },
  ];
}

function toParams(
  payload: Record<string, string> | URLSearchParams | string,
  fail: (reason: string) => never,
): URLSearchParams {
  if (payload instanceof URLSearchParams) return payload;
  if (typeof payload === "string") return new URLSearchParams(payload);
  if (
    typeof payload === "object" &&
    payload !== null &&
    !Array.isArray(payload)
  ) {
    return new URLSearchParams(payload as Record<string, string>);
  }
  return fail(
    "Payload must be form-encoded text, URLSearchParams, or a string record.",
  );
}
