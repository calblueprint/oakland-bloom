import { createHash } from "node:crypto";

/**
 * Minimal Meta WhatsApp Cloud API client: the sends, read/typing, reactions,
 * and media transfer the agent needs. Server-only — it holds the access token.
 *
 * Payload shapes follow Meta's docs; see docs/whatsapp-agent-production-plan.md
 * §III.8 and §IV.1 for links. Message IDs in and out carry the `meta:` prefix
 * used everywhere else, and are stripped only at the API boundary.
 */
export interface MetaClientConfig {
  phoneNumberId: string;
  accessToken: string;
  /** Graph API version, e.g. "v26.0". */
  apiVersion: string;
  /** Injected for tests; defaults to global fetch. */
  fetch?: typeof fetch;
}

export interface SentMessage {
  /** `meta:`-prefixed wamid, the key delivery-status callbacks are matched on. */
  providerMessageId: string;
}

export interface TemplateMessage {
  name: string;
  /** Template language code, e.g. "en_US", "es", "prs_AF". */
  language: string;
  /** Named body variables ({{first_name}}) or positional ones ({{1}}, {{2}}…). */
  bodyParameters: Record<string, string> | string[];
  /** Uploaded media ID for a template with an image header. */
  headerImageId?: string;
}

export interface DownloadedMedia {
  bytes: Uint8Array;
  mimeType: string;
}

/** A Graph API error. `retryable` marks rate limits and server errors. */
export class MetaApiError extends Error {
  readonly status: number;
  readonly code: number | null;
  readonly retryable: boolean;

  constructor(status: number, code: number | null, message: string) {
    super(message);
    this.name = "MetaApiError";
    this.status = status;
    this.code = code;
    this.retryable = status === 429 || status >= 500;
  }
}

/** Media the agent will fetch: images up to 5 MB, stickers up to 500 KB. */
const MEDIA_LIMITS: Record<string, number> = {
  "image/jpeg": 5 * 1024 * 1024,
  "image/png": 5 * 1024 * 1024,
  "image/webp": 500 * 1024,
};

export function createMetaClient(config: MetaClientConfig) {
  const doFetch = config.fetch ?? fetch;
  const base = `https://graph.facebook.com/${config.apiVersion}`;
  const auth = { Authorization: `Bearer ${config.accessToken}` };

  async function graph(
    path: string,
    init: { method: "GET" | "POST"; json?: unknown; form?: FormData },
  ): Promise<Record<string, unknown>> {
    const response = await doFetch(`${base}/${path}`, {
      method: init.method,
      headers:
        init.json === undefined
          ? auth
          : { ...auth, "Content-Type": "application/json" },
      body: init.json === undefined ? init.form : JSON.stringify(init.json),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error =
        isRecord(body) && isRecord(body.error) ? body.error : undefined;
      throw new MetaApiError(
        response.status,
        typeof error?.code === "number" ? error.code : null,
        `Meta API ${response.status}: ${
          typeof error?.message === "string" ? error.message : "no error body"
        }`,
      );
    }
    if (!isRecord(body)) {
      throw new MetaApiError(
        response.status,
        null,
        "Meta API returned no JSON object.",
      );
    }
    return body;
  }

  async function send(to: string, message: Record<string, unknown>) {
    const body = await graph(`${config.phoneNumberId}/messages`, {
      method: "POST",
      json: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        ...message,
      },
    });
    const sent = Array.isArray(body.messages) ? body.messages[0] : undefined;
    if (!isRecord(sent) || typeof sent.id !== "string") {
      throw new MetaApiError(
        200,
        null,
        "Meta API accepted a send but returned no message ID.",
      );
    }
    return { providerMessageId: `meta:${sent.id}` } satisfies SentMessage;
  }

  return {
    /** Free-form text; only inside the 24h window. Optionally quotes a chef message. */
    async sendText(
      to: string,
      text: string,
      options: { replyTo?: string } = {},
    ): Promise<SentMessage> {
      return send(to, {
        type: "text",
        text: { body: text, preview_url: false },
        ...replyContext(options.replyTo),
      });
    },

    /** Approved template; the only send allowed outside the 24h window. */
    async sendTemplate(
      to: string,
      template: TemplateMessage,
    ): Promise<SentMessage> {
      const components: Record<string, unknown>[] = [];
      if (template.headerImageId !== undefined) {
        components.push({
          type: "header",
          parameters: [
            { type: "image", image: { id: template.headerImageId } },
          ],
        });
      }
      const parameters = Array.isArray(template.bodyParameters)
        ? template.bodyParameters.map(text => ({ type: "text", text }))
        : Object.entries(template.bodyParameters).map(([name, text]) => ({
            type: "text",
            parameter_name: name,
            text,
          }));
      if (parameters.length > 0) components.push({ type: "body", parameters });
      return send(to, {
        type: "template",
        template: {
          name: template.name,
          language: { code: template.language },
          components,
        },
      });
    },

    /** Uploaded image with an optional caption; only inside the 24h window. */
    async sendImage(
      to: string,
      mediaId: string,
      options: { caption?: string; replyTo?: string } = {},
    ): Promise<SentMessage> {
      return send(to, {
        type: "image",
        image: {
          id: mediaId,
          ...(options.caption === undefined
            ? {}
            : { caption: options.caption }),
        },
        ...replyContext(options.replyTo),
      });
    },

    /** React to a chef message, e.g. 🙏 for "thanks" instead of a text reply. */
    async sendReaction(
      to: string,
      messageId: string,
      emoji: string,
    ): Promise<SentMessage> {
      return send(to, {
        type: "reaction",
        reaction: { message_id: wamid(messageId), emoji },
      });
    },

    /**
     * Blue ticks plus "typing…" in one call. Show typing only when a reply will
     * follow: it clears when we reply or after 25 seconds.
     */
    async markReadAndTyping(
      messageId: string,
      options: { typing: boolean } = { typing: true },
    ): Promise<void> {
      await graph(`${config.phoneNumberId}/messages`, {
        method: "POST",
        json: {
          messaging_product: "whatsapp",
          status: "read",
          message_id: wamid(messageId),
          ...(options.typing ? { typing_indicator: { type: "text" } } : {}),
        },
      });
    },

    /** Upload once per gig; the returned ID can be reused for 30 days. */
    async uploadMedia(
      bytes: Uint8Array,
      mimeType: string,
      filename: string,
    ): Promise<string> {
      const form = new FormData();
      form.append("messaging_product", "whatsapp");
      form.append("type", mimeType);
      form.append(
        "file",
        new Blob([bytes.slice()], { type: mimeType }),
        filename,
      );
      const body = await graph(`${config.phoneNumberId}/media`, {
        method: "POST",
        form,
      });
      if (typeof body.id !== "string") {
        throw new MetaApiError(200, null, "Meta media upload returned no ID.");
      }
      return body.id;
    },

    /**
     * Fetch inbound media by ID and verify it before anyone stores or reads it.
     * The download URL expires after 5 minutes, so it is resolved fresh here
     * and never returned. Webhook media IDs themselves expire after 7 days.
     */
    async downloadMedia(
      mediaId: string,
      expectedSha256?: string,
    ): Promise<DownloadedMedia> {
      const info = await graph(
        `${encodeURIComponent(mediaId)}?phone_number_id=${encodeURIComponent(config.phoneNumberId)}`,
        { method: "GET" },
      );
      const mimeType =
        typeof info.mime_type === "string" ? info.mime_type.split(";")[0] : "";
      const limit = MEDIA_LIMITS[mimeType];
      if (limit === undefined) {
        throw new MediaRejectedError(
          `Unsupported media type ${JSON.stringify(info.mime_type)}.`,
        );
      }
      if (typeof info.url !== "string" || !info.url.startsWith("https://")) {
        throw new MetaApiError(
          200,
          null,
          "Meta media lookup returned no https URL.",
        );
      }
      if (Number(info.file_size) > limit) {
        throw new MediaRejectedError(
          `Media is ${info.file_size} bytes; limit is ${limit}.`,
        );
      }

      const response = await doFetch(info.url, { headers: auth });
      if (!response.ok) {
        throw new MetaApiError(
          response.status,
          null,
          `Meta media download ${response.status}.`,
        );
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > limit) {
        throw new MediaRejectedError(
          `Media is ${bytes.byteLength} bytes; limit is ${limit}.`,
        );
      }
      // The webhook's hash is checked when given, else the lookup's. Meta's
      // examples show base64, so both base64 and hex encodings are accepted.
      const expected =
        expectedSha256 ??
        (typeof info.sha256 === "string" ? info.sha256 : undefined);
      if (expected !== undefined && !sha256Matches(bytes, expected)) {
        throw new MediaRejectedError(
          "Downloaded media does not match its SHA-256.",
        );
      }
      return { bytes, mimeType };
    },
  };
}

export type MetaClient = ReturnType<typeof createMetaClient>;

/** Media we refuse to keep: wrong type, too large, or a hash mismatch. Not retryable. */
export class MediaRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaRejectedError";
  }
}

function wamid(messageId: string): string {
  if (!messageId.startsWith("meta:")) {
    throw new Error(
      `Expected a meta: message ID, got ${JSON.stringify(messageId)}.`,
    );
  }
  return messageId.slice("meta:".length);
}

function replyContext(replyTo: string | undefined) {
  return replyTo === undefined
    ? {}
    : { context: { message_id: wamid(replyTo) } };
}

function sha256Matches(bytes: Uint8Array, expected: string): boolean {
  const digest = createHash("sha256").update(bytes).digest();
  return (
    expected === digest.toString("base64") ||
    expected.toLowerCase() === digest.toString("hex")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
