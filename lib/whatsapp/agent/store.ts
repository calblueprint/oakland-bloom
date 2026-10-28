import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

export const referenceSchema = z.string().regex(/^OB[1-9]\d*$/);
const id = z.string().min(1).max(500);
const phone = z.string().regex(/^[1-9]\d{1,14}$/);

const chefSchema = z.strictObject({
  id,
  name: z.string().min(1).max(200),
  phone,
});

const opportunitySchema = z.strictObject({
  reference: referenceSchema,
  title: z.string().min(1).max(300),
  startsAt: z.iso.datetime({ offset: true }),
  location: z.string().min(1).max(500),
  headcount: z.number().int().positive(),
  pay: z.string().max(200).nullable(),
  details: z.string().max(2000),
  status: z.enum(["open", "closed"]),
  chefIds: z.array(id),
});

export const seedSchema = z.strictObject({
  chefs: z.array(chefSchema),
  opportunities: z.array(opportunitySchema),
});

const pendingSchema = z.strictObject({
  reference: referenceSchema,
  interested: z.boolean(),
  sourceMessageId: id,
  expiresAt: z.iso.datetime(),
});

const traceSchema = z.strictObject({
  name: z.string(),
  input: z.json(),
  output: z.json(),
});

export const replySchema = z.strictObject({
  reply: z.string().min(1).max(4000),
  toolCalls: z.array(traceSchema),
  outcome: z.enum([
    "conversation",
    "confirmation-required",
    "recorded",
    "handoff",
  ]),
});

const messageSchema = z
  .strictObject({
    providerMessageId: z
      .string()
      .max(500)
      .regex(/^(meta|twilio):\S+$/),
    from: phone,
    text: z.string().max(4000),
    provider: z.enum(["meta", "twilio"]),
    media: z
      .strictObject({
        kind: z.enum(["image", "sticker"]),
        mediaId: z.string().min(1).max(2000),
        mimeType: z.string().min(1).max(200),
        sha256: z.string().max(200).optional(),
      })
      .optional(),
    contextMessageId: z.string().max(500).optional(),
    sentAt: z.iso.datetime().optional(),
  })
  .refine(value => value.providerMessageId.startsWith(`${value.provider}:`), {
    message: "Message ID must belong to its provider.",
  });

const stateSchema = seedSchema.extend({
  version: z.literal(1),
  conversations: z.array(
    z.strictObject({
      chefId: id,
      pending: pendingSchema.nullable(),
      turns: z
        .array(
          z.strictObject({
            messageId: id,
            text: z.string().max(4000),
            reply: z.string().max(4000),
          }),
        )
        .max(12),
    }),
  ),
  responses: z.array(
    z.strictObject({
      chefId: id,
      reference: referenceSchema,
      interested: z.boolean(),
      messageId: id,
      recordedAt: z.iso.datetime(),
    }),
  ),
  handoffs: z.array(
    z.strictObject({
      chefId: id,
      messageId: id,
      reason: z.string().min(1).max(500),
      createdAt: z.iso.datetime(),
    }),
  ),
  receipts: z.array(
    z.strictObject({
      message: messageSchema,
      result: replySchema,
    }),
  ),
});

export { messageSchema };
export type AgentSeed = z.infer<typeof seedSchema>;
export type AgentState = z.infer<typeof stateSchema>;
export type AgentReply = z.infer<typeof replySchema>;
export type AgentStore = {
  transaction<T>(run: (draft: AgentState) => Promise<T>): Promise<T>;
};

/** Local development store. The file lock covers read, model/tools, and commit. */
export class FileAgentStore implements AgentStore {
  private readonly seed: AgentSeed;

  constructor(privateFile: string, seed: AgentSeed) {
    this.path = privateFile;
    this.seed = seedSchema.parse(seed);
    for (const values of [
      this.seed.chefs.map(item => item.id),
      this.seed.chefs.map(item => item.phone),
      this.seed.opportunities.map(item => item.reference),
    ]) {
      if (new Set(values).size !== values.length) {
        throw new Error(
          "Chef IDs, phone numbers, and opportunity references must be unique.",
        );
      }
    }
  }

  private readonly path: string;

  async transaction<T>(run: (draft: AgentState) => Promise<T>): Promise<T> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const lockPath = `${this.path}.lock`;
    // Exclusive creation works across store instances/processes. Fail rather than
    // guessing a lock is stale and accidentally running two model turns at once.
    const lock = await open(lockPath, "wx", 0o600);
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      let data: unknown;
      try {
        data = JSON.parse(await readFile(this.path, "utf8"));
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !("code" in error) ||
          error.code !== "ENOENT"
        )
          throw error;
        data = {
          ...this.seed,
          version: 1,
          conversations: [],
          responses: [],
          handoffs: [],
          receipts: [],
        };
      }
      const draft = stateSchema.parse(data);
      const result = await run(draft);
      const file = await open(temporary, "wx", 0o600);
      try {
        await file.writeFile(JSON.stringify(stateSchema.parse(draft), null, 2));
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporary, this.path);
      return result;
    } finally {
      await rm(temporary, { force: true });
      await lock.close();
      await rm(lockPath, { force: true });
    }
  }
}
