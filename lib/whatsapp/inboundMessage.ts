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

/** A single message dropped from a batch, kept so callers can log or alert. */
export interface RejectedMessage {
  /** Provider message ID with prefix, or null when the message had none. */
  providerMessageId: string | null;
  reason: string;
}

/**
 * Result of parsing one webhook POST. Per-message problems land in `rejected`
 * so one unsupported message never blocks the valid ones batched with it.
 */
export interface InboundBatch {
  messages: InboundMessage[];
  rejected: RejectedMessage[];
}

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
