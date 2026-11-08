import type { InboundMessage } from "../inboundMessage.ts";
import type { KitchenAccess } from "./kitchen.ts";
import type {
  AgentReply,
  AgentState,
  Conversation,
  Opportunity,
  PendingConfirmation,
} from "./store.ts";
import { tool } from "ai";
import { z } from "zod";
import { createKitchenTools } from "./kitchen.ts";
import { referenceSchema } from "./store.ts";

// A strict schema rejects extra fields instead of quietly accepting them.
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
    startsLocal: opportunity.startsAt
      ? formatLocalTime(new Date(opportunity.startsAt))
      : null,
    location: opportunity.location,
    headcount: opportunity.headcount,
    pay: opportunity.pay,
    details: opportunity.details,
    status: opportunity.status,
    // An older acceptance and a new interest response are separate business facts.
    accepted: opportunity.accepted ?? false,
    responseStatus: opportunity.responseStatus ?? "unknown",
  };
}

/** Builds guarded catering and kitchen tools for one chef and one incoming message. */
export function createCateringTools({
  state,
  chefId,
  conversation,
  message,
  confirmation,
  now,
  kitchen,
}: {
  state: AgentState;
  chefId: string;
  conversation: Conversation;
  message: InboundMessage;
  confirmation: PendingConfirmation | null;
  now: Date;
  kitchen?: KitchenAccess;
}) {
  // These values belong to one incoming message. They are reset on every turn.
  // chefId comes from our sender lookup, never from the model's arguments.
  const toolCalls: AgentReply["toolCalls"] = [];
  // conversation.ts uses these flags to explain blocked writes or human help.
  const activity = {
    handedOff: false,
    blockedWrite: false,
    kitchenReview: false,
  };
  let actionsStarted = 0;
  let recorded: { reference: string; interested: boolean } | null = null;
  let proposed: { reference: string; interested: boolean } | null = null;

  /** Finds a catering request assigned to this chef, including their closed requests. */
  function findAssignedRequest(reference: string) {
    // Knowing an OB code does not give access. Reads require assignment;
    // writes also check that the request is open and not already accepted.
    return state.opportunities.find(
      opportunity =>
        opportunity.reference === reference &&
        opportunity.chefIds.includes(chefId),
    );
  }

  /** Runs and logs a tool action, or returns a budget error after eight actions. */
  // Changes stay in the draft until store.transaction saves the whole turn.
  async function runTool(
    name: string,
    input: unknown,
    action: () => unknown | Promise<unknown>,
  ) {
    // Reserve a slot before awaiting so parallel reads cannot exceed the budget.
    if (actionsStarted >= 8) return { error: "tool_budget_exceeded" };
    actionsStarted++;
    const output = z.json().parse(await action());
    // Keep the requested inputs and actual result so the CLI/tests can explain
    // what happened. Tool results also go back to the model through the SDK.
    toolCalls.push({ name, input: z.json().parse(input), output });
    return output;
  }

  // description tells the model when to ask for a tool; inputSchema checks its
  // arguments; execute is our code that decides whether the action is allowed.
  const tools = {
    /** Takes no arguments and returns only this chef's assigned catering requests. */
    list_my_catering_requests: tool({
      description:
        "List this chef's catering requests and their status. Closed or accepted requests are read-only.",
      inputSchema: noInput,
      execute: async input =>
        runTool("list_my_catering_requests", input, () =>
          state.opportunities
            .filter(opportunity => opportunity.chefIds.includes(chefId))
            .map(opportunityDetails),
        ),
    }),
    /** Takes a reference and returns allowed gig details, or an unavailable error. */
    get_catering_request: tool({
      description:
        "Read one of this chef's catering requests. Missing dates, location or headcount are null, not guesses.",
      inputSchema: z.strictObject({ reference: referenceSchema }),
      execute: async input =>
        runTool("get_catering_request", input, () => {
          const opportunity = findAssignedRequest(input.reference);
          if (!opportunity) return { error: "opportunity_unavailable" };
          return opportunityDetails(opportunity);
        }),
    }),
    /** Takes a gig, yes/no value, and source quote; stores a pending proposal, not interest. */
    propose_catering_response: tool({
      description:
        "Propose this chef's interest for confirmation. Does not save a response. Quote the current user message exactly.",
      inputSchema: z.strictObject({
        reference: referenceSchema,
        interested: z.boolean(),
        sourceQuote: z.string().trim().min(1).max(500),
      }),
      execute: async input =>
        runTool("propose_catering_response", input, () => {
          // A confirmation or cancellation cannot also start a new proposal.
          if (
            confirmation ||
            isCancellation(message.text) ||
            /^confirm[.!]?$/i.test(message.text.trim())
          ) {
            return { error: "clarification_required" };
          }
          const opportunity = findAssignedRequest(input.reference);
          const quoteIsFromThisMessage = message.text.includes(
            input.sourceQuote,
          );
          // A quote must actually appear in this message. This check does not
          // understand intent; interpreting the quote is still the model's job.
          if (!opportunity || !quoteIsFromThisMessage) {
            return { error: "clarification_required" };
          }
          if (opportunity.status !== "open" || opportunity.accepted) {
            return { error: "request_is_read_only", needsHumanHelp: true };
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
          // Save a proposal the server can name in its confirmation question.
          // No interest response is written until a later confirmed turn.
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
    confirm_catering_response: tool({
      description:
        "Save only the server-bound pending proposal after this chef confirms on a later message. No arguments.",
      // No chef ID or gig fields: the model cannot change what the chef confirmed.
      inputSchema: noInput,
      execute: async input =>
        runTool("confirm_catering_response", input, () => {
          // Recheck access because the gig may have closed since the proposal.
          const opportunity = confirmation
            ? findAssignedRequest(confirmation.reference)
            : undefined;
          if (
            !confirmation ||
            !opportunity ||
            opportunity.status !== "open" ||
            opportunity.accepted
          ) {
            activity.blockedWrite = true;
            return { error: "confirmation_required" };
          }
          // The model may request this tool repeatedly; write only once per turn.
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
          // Store one request locally. Sending a staff notification is separate
          // integration work, so this tool must not claim anyone was contacted.
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

  return {
    tools: {
      ...tools,
      ...createKitchenTools({
        kitchen,
        state,
        chefId,
        message,
        now,
        runTool,
        activity,
      }),
    },
    toolCalls,
    activity,
  };
}
