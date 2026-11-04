import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

// These schemas check the shape of saved JSON. The TypeScript types below are
// derived from the same rules, so validation and type definitions stay in sync.
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
  // This assignment list controls who may see or respond to the gig.
  chefIds: z.array(id),
});

export const seedSchema = z.strictObject({
  chefs: z.array(chefSchema),
  opportunities: z.array(opportunitySchema),
});

// Keep the exact proposed gig/answer separate from the model's chat text.
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
  // Short conversation history helps the model understand follow-up questions.
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
  // Confirmed decisions are separate from chat history and never overwritten.
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
  // A receipt saves the original reply so a delivery retry does not repeat work.
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
export type Conversation = AgentState["conversations"][number];
export type Opportunity = z.infer<typeof opportunitySchema>;
export type PendingConfirmation = z.infer<typeof pendingSchema>;
export type AgentStore = {
  // Agent code uses this interface so a future database store can replace files.
  transaction<T>(run: (draft: AgentState) => Promise<T>): Promise<T>;
};

/** Local development store. The file lock covers read, model/tools, and commit. */
export class FileAgentStore implements AgentStore {
  private readonly seed: AgentSeed;

  /** Sets the file path and validates initial data; files are created on the first turn. */
  constructor(privateFile: string, seed: AgentSeed) {
    this.path = privateFile;
    this.seed = seedSchema.parse(seed);
    // Duplicate identities would make phone lookups and opportunity lookups ambiguous.
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

  /** Loads and validates saved JSON, or creates initial state if no file exists yet. */
  private async readState(): Promise<AgentState> {
    let data: unknown;
    try {
      data = JSON.parse(await readFile(this.path, "utf8"));
    } catch (error) {
      // Only a missing file starts a new store. Corrupt data must fail visibly.
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
    // Parsing catches a broken saved file before any tool can act on its data.
    return stateSchema.parse(data);
  }

  /** Runs a callback on a locked draft, saves it on success, and returns the callback's result. */
  async transaction<T>(run: (draft: AgentState) => Promise<T>): Promise<T> {
    // 0700 allows only the current user to access the state directory;
    // files below use 0600 so only that user can read or write them.
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const lockPath = `${this.path}.lock`;
    // Exclusive creation works across store instances/processes. Fail rather than
    // guessing a lock is stale and accidentally running two model turns at once.
    const lock = await open(lockPath, "wx", 0o600);
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      // This draft lives in memory. Tools change it, not the saved file.
      const draft = await this.readState();
      const result = await run(draft);
      // Write a private temporary file first. A failed turn or write leaves the
      // existing file intact; rename replaces it only after the write completes.
      const file = await open(temporary, "wx", 0o600);
      try {
        // Validate again after the tools ran, before replacing good saved state.
        await file.writeFile(JSON.stringify(stateSchema.parse(draft), null, 2));
        // Ask the OS to flush the new file before making it the current state.
        await file.sync();
      } finally {
        await file.close();
      }
      // Readers see the old complete file or the new complete file.
      await rename(temporary, this.path);
      return result;
    } finally {
      // This also runs when the model or storage throws, allowing a later retry.
      await rm(temporary, { force: true });
      await lock.close();
      await rm(lockPath, { force: true });
    }
  }
}
