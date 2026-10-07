/**
 * Normalized inbound WhatsApp message.
 *
 * Provider payloads (Meta Cloud API, Twilio) are parsed into this shape so the
 * rest of the system never depends on which provider we ship. See
 * docs/whatsapp-bot-research.md for the provider comparison behind this split.
 */
export interface InboundMessage {
  /**
   * Provider-assigned message ID. Meta sends `wamid.…`, Twilio sends `SM…`.
   * Carries a provider prefix so IDs stay unique if we ever run both.
   * This is the idempotency key: providers retry and guarantee no exactly-once
   * delivery, so the eventual persistence layer must treat repeats as no-ops.
   */
  providerMessageId: string;
  /** Sender's phone number, digits only, no `+` or `whatsapp:` prefix. */
  from: string;
  /** Message body as the sender typed it, including empty text and whitespace. */
  text: string;
  /** Which provider produced this message. */
  provider: Provider;
}

export type Provider = "meta" | "twilio";

/**
 * Thrown when a payload cannot be normalized — missing fields, wrong shape, or
 * an unsupported message type. Distinct from a message whose *text* we don't
 * recognize: unrecognized text is still a valid message.
 */
export class InboundParseError extends Error {
  readonly provider: Provider;

  constructor(provider: Provider, message: string) {
    super(message);
    this.name = "InboundParseError";
    this.provider = provider;
  }
}

/** Strips transport prefixes; the provider parsers validate the remaining number. */
export function normalizePhone(raw: string): string {
  return raw.replace(/^whatsapp:/, "").replace(/^\+/, "");
}
