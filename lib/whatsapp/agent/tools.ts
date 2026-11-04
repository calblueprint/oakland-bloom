import type { InboundMessage } from "../inboundMessage.ts";
import type {
  AgentReply,
  AgentState,
  Conversation,
  Opportunity,
  PendingConfirmation,
} from "./store.ts";
import { tool } from "ai";
import { z } from "zod";
import { referenceSchema } from "./store.ts";

const noInput = z.strictObject({});
const confirmationLifetime = 15 * 60_000;
const localTime = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Los_Angeles",
  timeZoneName: "short",
});

/** Converts a Date to a readable Oakland date/time string for messages and tool results. */
export function formatLocalTime(date: Date): string {
  return localTime.format(date);
}

/** Returns true for a short, explicit cancellation such as "cancel" or "never mind". */
export function isCancellation(text: string): boolean {
  return /^(cancel|never mind|nevermind)[.!]?$/i.test(text.trim());
}

/** Builds the confirmation question from the exact gig and interest value being proposed. */
export function proposalReply(reference: string, interested: boolean): string {
  return `Should I record that you're ${interested ? "interested" : "not interested"} in ${reference}? Reply "confirm" or "cancel". This records your interest; it does not book the event.`;
}

/** Returns model-visible gig details, including local time but excluding assigned chef IDs. */
function opportunityDetails(opportunity: Opportunity) {
  return {
    reference: opportunity.reference,
    title: opportunity.title,
    startsAt: opportunity.startsAt,
    startsLocal: formatLocalTime(new Date(opportunity.startsAt)),
    location: opportunity.location,
    headcount: opportunity.headcount,
    pay: opportunity.pay,
    details: opportunity.details,
    status: opportunity.status,
  };
}

/** Builds five guarded tools for one chef/turn, plus a trace and flags describing their effects. */
export function createCateringTools({
  state,
  chefId,
  conversation,
  message,
  confirmation,
  now,
}: {
  state: AgentState;
  chefId: string;
  conversation: Conversation;
  message: InboundMessage;
  confirmation: PendingConfirmation | null;
  now: Date;
}) {
  const toolCalls: AgentReply["toolCalls"] = [];
  const activity = { handedOff: false, blockedWrite: false };
  let recorded: { reference: string; interested: boolean } | null = null;
  let proposed: { reference: string; interested: boolean } | null = null;

  /** Finds an open gig assigned to the bound chef, or returns undefined if unavailable. */
  function findOpenOpportunity(reference: string) {
    return state.opportunities.find(
      opportunity =>
        opportunity.reference === reference &&
        opportunity.status === "open" &&
        opportunity.chefIds.includes(chefId),
    );
  }

  /** Runs and logs a tool action, or returns a budget error after eight actions. */
  // Changes stay in the draft until store.transaction saves the whole turn.
  function runTool(name: string, input: unknown, action: () => unknown) {
    if (toolCalls.length >= 8) return { error: "tool_budget_exceeded" };
    const output = z.json().parse(action());
    toolCalls.push({ name, input: z.json().parse(input), output });
    return output;
  }

  const tools = {
    /** Takes no arguments and returns this chef's assigned, open gigs. */
    list_opportunities: tool({
      description:
        "List the current chef's open catering opportunities. Does not expose other chefs.",
      inputSchema: noInput,
      execute: async input =>
        runTool("list_opportunities", input, () =>
          state.opportunities
            .filter(
              opportunity =>
                opportunity.status === "open" &&
                opportunity.chefIds.includes(chefId),
            )
            .map(opportunityDetails),
        ),
    }),
    /** Takes a reference and returns allowed gig details, or an unavailable error. */
    get_opportunity: tool({
      description:
        "Read current details for an opportunity this chef is allowed to see.",
      inputSchema: z.strictObject({ reference: referenceSchema }),
      execute: async input =>
        runTool("get_opportunity", input, () => {
          const opportunity = findOpenOpportunity(input.reference);
          if (!opportunity) return { error: "opportunity_unavailable" };
          return opportunityDetails(opportunity);
        }),
    }),
    /** Takes a gig, yes/no value, and source quote; stores a pending proposal, not interest. */
    propose_interest: tool({
      description:
        "Propose this chef's interest for confirmation. Does not save a response. Quote the current user message exactly.",
      inputSchema: z.strictObject({
        reference: referenceSchema,
        interested: z.boolean(),
        sourceQuote: z.string().trim().min(1).max(500),
      }),
      execute: async input =>
        runTool("propose_interest", input, () => {
          // A confirmation or cancellation cannot also start a new proposal.
          if (confirmation || isCancellation(message.text)) {
            return { error: "clarification_required" };
          }
          const opportunity = findOpenOpportunity(input.reference);
          const quoteIsFromThisMessage = message.text.includes(
            input.sourceQuote,
          );
          if (!opportunity || !quoteIsFromThisMessage) {
            return { error: "clarification_required" };
          }
          // If the chef named a different gig or several gigs, ask instead of guessing.
          const references = message.text.match(/\bOB\d+\b/gi) ?? [];
          if (
            references.some(
              reference => reference.toUpperCase() !== input.reference,
            )
          ) {
            return { error: "clarification_required" };
          }
          // Calling this tool twice must not silently replace the first proposal.
          if (
            proposed &&
            (proposed.reference !== input.reference ||
              proposed.interested !== input.interested)
          ) {
            return { error: "clarification_required" };
          }
          proposed = {
            reference: input.reference,
            interested: input.interested,
          };
          conversation.pending = {
            ...proposed,
            sourceMessageId: message.providerMessageId,
            expiresAt: new Date(
              now.getTime() + confirmationLifetime,
            ).toISOString(),
          };
          return { status: "confirmation_required", ...proposed };
        }),
    }),
    /** Takes no arguments; records the previously confirmed proposal once, or returns an error. */
    record_interest: tool({
      description:
        "Save only the server-bound pending proposal after this chef confirms on a later message. No arguments.",
      // No chef ID or gig fields: the model cannot change what the chef confirmed.
      inputSchema: noInput,
      execute: async input =>
        runTool("record_interest", input, () => {
          if (!confirmation || !findOpenOpportunity(confirmation.reference)) {
            activity.blockedWrite = true;
            return { error: "confirmation_required" };
          }
          if (!recorded) {
            recorded = {
              reference: confirmation.reference,
              interested: confirmation.interested,
            };
            // Append a new response so a later change of mind preserves history.
            state.responses.push({
              chefId,
              ...recorded,
              messageId: message.providerMessageId,
              recordedAt: now.toISOString(),
            });
          }
          return { status: "recorded", ...recorded };
        }),
    }),
    /** Takes a reason and queues one local review request for this chef/message. */
    request_human_help: tool({
      description:
        "Create one local review request for this chef and inbound message. Sends no external notification.",
      inputSchema: z.strictObject({
        reason: z.string().trim().min(1).max(500),
      }),
      execute: async input =>
        runTool("request_human_help", input, () => {
          if (!activity.handedOff) {
            state.handoffs.push({
              chefId,
              messageId: message.providerMessageId,
              reason: input.reason,
              createdAt: now.toISOString(),
            });
          }
          activity.handedOff = true;
          return { status: "queued_for_review" };
        }),
    }),
  };

  return { tools, toolCalls, activity };
}
