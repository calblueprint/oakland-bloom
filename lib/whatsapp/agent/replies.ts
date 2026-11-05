import type { LanguageModel } from "ai";
import type { MetaClient } from "../metaClient.ts";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { MetaApiError } from "../metaClient.ts";
import { createCateringAgent } from "./conversation.ts";
import { messageSchema, stateSchema } from "./store.ts";

type Rpc = (
  name: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

const turnSchema = z.strictObject({
  inboundId: z.uuid(),
  message: messageSchema,
  state: stateSchema,
});
const outgoingSchema = z.strictObject({
  id: z.uuid(),
  phone: z.string().regex(/^[1-9]\d{1,14}$/),
  body: z.string().min(1).max(4000),
  replyTo: z.string().regex(/^meta:\S+$/),
});

/** Processes one chef at a time; only this explicitly configured test phone can receive replies. */
export function createReplyWorker({
  rpc,
  model,
  meta,
  phone,
  workerId = randomUUID(),
}: {
  rpc: Rpc;
  model: LanguageModel;
  meta: Pick<MetaClient, "sendText">;
  phone: string;
  workerId?: string;
}) {
  z.string()
    .regex(/^[1-9]\d{1,14}$/)
    .parse(phone);
  z.uuid().parse(workerId);

  /** Calls a private database function without exposing message contents or credentials in errors. */
  async function database(name: string, args: Record<string, unknown>) {
    const result = await rpc(name, args);
    if (result.error) throw new Error(`${name} failed.`);
    return result.data;
  }

  /** Claims one inbound, lets the existing agent use its tools, and commits its reply with all writes. */
  async function processNext() {
    const claimed = await database("claim_wa_turn", {
      target_phone: phone,
      worker_id: workerId,
    });
    if (claimed === null) return false;
    // Read only the lease identity first, so even invalid saved context can release its lock.
    const identity = z
      .object({
        state: z.object({
          chefs: z.array(z.object({ id: z.uuid() })).length(1),
        }),
      })
      .safeParse(claimed);
    try {
      const turn = turnSchema.parse(claimed);
      const chef = turn.state.chefs.find(item => item.phone === phone);
      if (
        !chef ||
        turn.message.from !== phone ||
        turn.message.provider !== "meta" ||
        turn.state.chefs.length !== 1
      ) {
        throw new Error("Claimed turn does not belong to the test recipient.");
      }
      const agent = createCateringAgent({
        model,
        store: {
          // The database lease protects this draft while the model is running.
          // commit checks ownership again and saves the outbox in the same transaction.
          async transaction(run) {
            const draft = structuredClone(turn.state);
            const result = await run(draft);
            await database("commit_wa_turn", {
              inbound_id: turn.inboundId,
              worker_id: workerId,
              turn_state: stateSchema.parse(draft),
            });
            return result;
          },
        },
      });
      await agent.respond(turn.message);
      return true;
    } catch (error) {
      // A model failure leaves the inbound available for a later attempt.
      if (identity.success) {
        await database("release_wa_turn", {
          chef_id: identity.data.state.chefs[0].id,
          worker_id: workerId,
        }).catch(() => {});
      }
      throw error;
    }
  }

  /** Sends a saved reply once; an uncertain network result is never automatically sent again. */
  async function sendNext() {
    const claimed = await database("claim_wa_reply", {
      target_phone: phone,
      worker_id: workerId,
    });
    if (claimed === null) return false;
    const outgoing = outgoingSchema.parse(claimed);
    if (outgoing.phone !== phone)
      throw new Error("Outgoing reply does not belong to the test recipient.");
    // claim changes pending to unknown BEFORE this external call. If Meta accepts
    // the message but the connection drops, restarting cannot send it a second time.
    let sent;
    try {
      sent = await meta.sendText(phone, outgoing.body, {
        replyTo: outgoing.replyTo,
      });
    } catch (error) {
      // A definite API refusal means no message was accepted. A timeout, rate
      // limit or server failure stays unknown for review rather than risking a duplicate.
      if (
        error instanceof MetaApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408 &&
        error.status !== 429
      ) {
        await database("fail_wa_reply", {
          outbound_id: outgoing.id,
          worker_id: workerId,
        });
      }
      throw error;
    }
    await database("finish_wa_reply", {
      outbound_id: outgoing.id,
      worker_id: workerId,
      provider_id: sent.providerMessageId,
    });
    return true;
  }

  return {
    processNext,
    sendNext,
    /** Handles one incoming message and one pending reply without keeping Meta's webhook waiting. */
    async runOnce() {
      // Finish an older queued reply first so a follow-up sees the answer it follows.
      const previousSent = await sendNext();
      const processed = await processNext();
      const sent = await sendNext();
      return { processed, sent: previousSent || sent };
    },
  };
}
