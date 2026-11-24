import type { LanguageModel } from "ai";
import type { MetaClient } from "../metaClient.ts";
import type { Rpc } from "./replies.ts";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { isDefiniteMetaRefusal } from "../metaClient.ts";
import { styleAgentNotice } from "./noticeStyle.ts";

const phoneNumber = z.string().regex(/^[1-9]\d{1,14}$/);
const alertTemplate = z.object({
  name: z.string().regex(/^[a-z0-9_]{1,512}$/),
  language: z.string().min(2).max(20),
});
const claimedNotice = z.strictObject({
  id: z.uuid(),
  phone: phoneNumber,
  body: z.string().min(1).max(4000),
});

// Only automated free-form notices include facts for styling. Staff text and
// approved templates pass through unchanged.
const notificationSchema = z.discriminatedUnion("kind", [
  claimedNotice.extend({
    kind: z.literal("text"),
    facts: z.unknown().optional(),
  }),
  claimedNotice.extend({
    kind: z.literal("template"),
    template: z.strictObject({
      ...alertTemplate.shape,
      bodyParameters: z.tuple([z.string().min(1), z.string().min(1)]),
    }),
  }),
]);

type Notification = z.infer<typeof notificationSchema>;
type Claim = { notification_id: string; worker_id: string };

/** Sends one chef's notices through the database outbox and then through Meta. */
export function createNotificationWorker({
  rpc,
  meta,
  model,
  phone,
  template,
  workerId,
}: {
  rpc: Rpc;
  meta: Pick<MetaClient, "sendText" | "sendTemplate">;
  model?: LanguageModel;
  phone: string;
  template?: { name: string; language: string };
  workerId?: string;
}) {
  phoneNumber.parse(phone);
  if (workerId) z.uuid().parse(workerId);
  if (template) alertTemplate.parse(template);

  /** Keeps provider and database details out of logs while naming the operation that failed. */
  async function database(name: string, args: Record<string, unknown>) {
    const result = await rpc(name, args);
    if (result.error) throw new Error(`${name} failed.`);
    return result.data;
  }

  /**
   * Styles eligible notices and stores the exact text the chef will receive.
   * Preparation rechecks consent, ownership, and current facts. A null result
   * means the database withdrew the claim, so the worker must skip the send.
   */
  async function prepareBody(notice: Notification, claim: Claim) {
    if (!model || notice.kind !== "text" || notice.facts === undefined) {
      return notice.body;
    }

    try {
      const body = await styleAgentNotice(model, notice.facts, notice.body);
      const ready = await database("prepare_wa_agent_notice", {
        ...claim,
        styled_body: body,
        target_phone: phone,
      });
      return ready === true ? body : null;
    } catch (error) {
      // Meta has not been called. The claim ID lets us release only this attempt.
      // If release fails, an unprepared draft still expires on its own.
      await database("abandon_wa_agent_notice", claim).catch(() => {});
      throw error;
    }
  }

  /**
   * Once we contact Meta, only a definite refusal can mark a send as failed.
   * A lost response may mean the message went out, so leave it for review.
   */
  async function sendPrepared(
    notice: Notification,
    body: string,
    claim: Claim,
  ) {
    let sent;
    try {
      sent =
        notice.kind === "template"
          ? await meta.sendTemplate(phone, notice.template)
          : await meta.sendText(phone, body);
    } catch (error) {
      if (isDefiniteMetaRefusal(error)) {
        await database("fail_wa_notification", claim);
      }
      throw error;
    }

    // A failure saving this ID is different from a refusal by Meta. Keep it
    // outside the send handler so a confirmed send never becomes retryable.
    await database("finish_wa_notification", {
      ...claim,
      provider_id: sent.providerMessageId,
    });
  }

  return {
    /** Claims, prepares, and sends one notice. False means nothing was sent. */
    async sendNext() {
      // Use a separate claim ID for each attempt, including a retry of a stale draft.
      const claimId = workerId ?? randomUUID();
      const data = await database(
        model ? "claim_wa_notification_for_agent" : "claim_wa_notification",
        {
          target_phone: phone,
          worker_id: claimId,
          template_name: template?.name ?? null,
          template_language: template?.language ?? null,
        },
      );
      if (data === null) return false;
      const notice = notificationSchema.parse(data);
      if (notice.phone !== phone)
        throw new Error(
          "Notification does not belong to the configured test recipient.",
        );

      const claim = { notification_id: notice.id, worker_id: claimId };
      const body = await prepareBody(notice, claim);
      if (body === null) return false;
      await sendPrepared(notice, body, claim);
      return true;
    },
  };
}
