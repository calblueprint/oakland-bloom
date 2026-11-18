import type { LanguageModel } from "ai";
import type { MetaClient } from "../metaClient.ts";
import type { Rpc } from "./replies.ts";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { MetaApiError } from "../metaClient.ts";
import { styleAgentNotice } from "./noticeStyle.ts";

const notificationSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    id: z.uuid(),
    phone: z.string().regex(/^[1-9]\d{1,14}$/),
    kind: z.literal("text"),
    facts: z.unknown().optional(),
    body: z.string().min(1).max(4000),
  }),
  z.strictObject({
    id: z.uuid(),
    phone: z.string().regex(/^[1-9]\d{1,14}$/),
    kind: z.literal("template"),
    body: z.string().min(1).max(4000),
    template: z.strictObject({
      name: z.string().regex(/^[a-z0-9_]{1,512}$/),
      language: z.string().min(2).max(20),
      bodyParameters: z.tuple([z.string().min(1), z.string().min(1)]),
    }),
  }),
]);

/** Delivers approved templates, staff replies, and agent-written notices. */
export function createNotificationWorker({
  rpc,
  meta,
  model,
  phone,
  template,
  workerId = randomUUID(),
}: {
  rpc: Rpc;
  meta: Pick<MetaClient, "sendText" | "sendTemplate">;
  model?: LanguageModel;
  phone: string;
  template?: { name: string; language: string };
  workerId?: string;
}) {
  z.string()
    .regex(/^[1-9]\d{1,14}$/)
    .parse(phone);
  z.uuid().parse(workerId);
  if (template) {
    z.string()
      .regex(/^[a-z0-9_]{1,512}$/)
      .parse(template.name);
    z.string().min(2).max(20).parse(template.language);
  }

  /** Calls a server-only function without logging private messages or provider errors. */
  async function database(name: string, args: Record<string, unknown>) {
    const result = await rpc(name, args);
    if (result.error) throw new Error(`${name} failed.`);
    return result.data;
  }

  return {
    /** Claims one eligible notification; uncertain delivery remains held for staff review. */
    async sendNext() {
      const data = await database(
        model ? "claim_wa_notification_for_agent" : "claim_wa_notification",
        {
          target_phone: phone,
          worker_id: workerId,
          template_name: template?.name ?? null,
          template_language: template?.language ?? null,
        },
      );
      if (data === null) return false;
      const notification = notificationSchema.parse(data);
      if (notification.phone !== phone)
        throw new Error(
          "Notification does not belong to the configured test recipient.",
        );

      let body = notification.body;
      if (
        model &&
        notification.kind === "text" &&
        notification.facts !== undefined
      ) {
        body = await styleAgentNotice(model, notification.facts, body);
        // Recheck permission and current facts after drafting, then save the exact text to send.
        const ready = await database("prepare_wa_agent_notice", {
          notification_id: notification.id,
          worker_id: workerId,
          styled_body: body,
          target_phone: phone,
        });
        if (ready !== true) return false;
      }

      let sent;
      try {
        sent =
          notification.kind === "template"
            ? await meta.sendTemplate(phone, notification.template)
            : await meta.sendText(phone, body);
      } catch (error) {
        // Only a definite refusal is safe to label failed. Never retry an ambiguous send.
        if (
          error instanceof MetaApiError &&
          error.status >= 400 &&
          error.status < 500 &&
          error.status !== 408 &&
          error.status !== 429
        ) {
          await database("fail_wa_notification", {
            notification_id: notification.id,
            worker_id: workerId,
          });
        }
        throw error;
      }
      await database("finish_wa_notification", {
        notification_id: notification.id,
        worker_id: workerId,
        provider_id: sent.providerMessageId,
      });
      return true;
    },
  };
}
