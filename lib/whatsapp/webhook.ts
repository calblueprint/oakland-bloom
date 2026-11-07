import type { InboundBatch } from "./inboundMessage.ts";
import { createHmac, timingSafeEqual } from "node:crypto";
import { InboundParseError } from "./inboundMessage.ts";
import { parseMetaPayload } from "./parseMeta.ts";

/**
 * Meta webhook handling, kept free of Next.js so it can be tested directly.
 *
 * The contract: verify the
 * signature on the raw body, persist the parsed batch, and only then return
 * 200. A persistence failure returns 503 so Meta retries (for up to 7 days);
 * acknowledging first would lose messages when the function is cut short.
 */
export interface MetaWebhookConfig {
  /** App secret used for X-Hub-Signature-256. */
  appSecret: string;
  /** Token we chose when registering the webhook in the Meta dashboard. */
  verifyToken: string;
  /** When configured, ignore messages addressed to another business number. */
  phoneNumberId?: string;
  /** Durably store the batch. Must be idempotent on provider message IDs. */
  ingest: (batch: InboundBatch) => Promise<void>;
  /** Server log sink; defaults to console. */
  log?: (message: string) => void;
}

/** Meta's subscription handshake: echo `hub.challenge` for our verify token. */
export function verifyMetaSubscription(
  url: URL,
  verifyToken: string,
): Response {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  // This GET checks that Meta reached our endpoint; it is not a chef message.
  // Echo the challenge only when the caller supplies our chosen verify token.
  if (
    mode === "subscribe" &&
    token !== null &&
    challenge !== null &&
    safeEqual(token, verifyToken)
  ) {
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return new Response("Forbidden", { status: 403 });
}

/** Checks a POST signature, parses/saves its batch, and returns the matching HTTP response. */
export async function handleMetaWebhook(
  request: Request,
  config: MetaWebhookConfig,
): Promise<Response> {
  const log = config.log ?? console.error;
  // Check the original text first. Reformatting JSON would change its signature.
  const raw = await request.text();

  if (
    !isValidSignature(
      raw,
      request.headers.get("x-hub-signature-256"),
      config.appSecret,
    )
  ) {
    log(
      "[whatsapp webhook] rejected a request with a bad or missing signature",
    );
    return new Response("Invalid signature", { status: 401 });
  }

  let batch: InboundBatch;
  try {
    // Only a signed body reaches the parser. The parser separates valid
    // messages from rejected ones so one bad attachment need not block a batch.
    batch = parseMetaPayload(JSON.parse(raw), config.phoneNumberId);
  } catch (error) {
    // Signed by Meta but unreadable: retrying the same body cannot help.
    if (error instanceof SyntaxError || error instanceof InboundParseError) {
      log(`[whatsapp webhook] unparseable signed payload: ${error.message}`);
      return new Response("Unparseable payload", { status: 400 });
    }
    throw error;
  }

  // Log rejected items, but still pass the whole batch to storage for review.
  for (const item of batch.rejected) {
    log(
      `[whatsapp webhook] rejected message ${item.providerMessageId ?? "(no id)"}: ${item.reason}`,
    );
  }

  try {
    // This is the important order: save first, then tell Meta we accepted it.
    // The webhook stops here; the separate reply worker runs the agent and sends replies.
    await config.ingest(batch);
  } catch (error) {
    log(
      `[whatsapp webhook] ingest failed, asking Meta to retry: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return new Response("Temporarily unavailable", { status: 503 });
  }
  return new Response("OK", { status: 200 });
}

/** HMAC-SHA256 of the exact raw body, compared in constant time. */
export function isValidSignature(
  raw: string,
  header: string | null,
  appSecret: string,
): boolean {
  // Recompute the signature using our private app secret. A matching value
  // proves the body was signed with that secret; a sender's phone alone cannot.
  if (header === null || !header.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(raw).digest("hex");
  return safeEqual(header.slice("sha256=".length), expected);
}

/** Compares equal-length secret/signature bytes without a timing-revealing string comparison. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // timingSafeEqual requires equal-length buffers and throws otherwise.
  return left.length === right.length && timingSafeEqual(left, right);
}
