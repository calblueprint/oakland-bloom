import type { JSONValue } from "ai";
import type { InboundMessage } from "../inboundMessage.ts";
import type { AgentState } from "./store.ts";
import { tool } from "ai";
import { z } from "zod";

// JavaScript Dates and the RPC response format preserve milliseconds, not finer precision.
const timestamp = z.iso
  .datetime({ offset: true })
  .refine(
    value => !/\.\d{4}/.test(value),
    "Use at most millisecond precision.",
  );
const amenity = z.string().trim().min(1).max(255);
const noInput = z.strictObject({});
const queryLimitMs = 31 * 86_400_000;
const localTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  dateStyle: "medium",
  timeStyle: "short",
});
// Review reasons also identify the exact request, including sub-minute changes.
const reviewTime = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  fractionalSecondDigits: 3,
  timeZoneName: "shortOffset",
  hourCycle: "h23",
});
const availabilityNotice =
  "This checks approved booking conflicts only. Opening hours, capacity and staff approval are not confirmed.";

export const kitchenBookingSchema = z.strictObject({
  id: z.uuid(),
  amenity,
  startAt: timestamp,
  endAt: timestamp,
  people: z.number().int().positive(),
  status: z.string().min(1).max(255),
});
export const kitchenBookingsSchema = z.array(kitchenBookingSchema);
export const kitchenAvailabilityInputSchema = z.strictObject({
  amenity,
  startAt: timestamp,
  endAt: timestamp,
});
export const kitchenAvailabilitySchema = z.strictObject({
  ...kitchenAvailabilityInputSchema.shape,
  status: z.enum(["no_approved_conflicts", "busy", "unknown_amenity"]),
});

export type KitchenBooking = z.infer<typeof kitchenBookingSchema>;
export type KitchenAvailabilityInput = z.infer<
  typeof kitchenAvailabilityInputSchema
>;
export type KitchenAvailability = z.infer<typeof kitchenAvailabilitySchema>;
export interface KitchenAccess {
  listBookings(): Promise<KitchenBooking[]>;
  checkAvailability(
    input: KitchenAvailabilityInput,
  ): Promise<KitchenAvailability>;
}

/** Adds Oakland time labels without exposing another chef's schedule or identity. */
function withLocalTimes<T extends KitchenAvailabilityInput>(value: T) {
  return {
    ...value,
    startsLocal: localTime.format(new Date(value.startAt)),
    endsLocal: localTime.format(new Date(value.endAt)),
    timeZone: "America/Los_Angeles",
  };
}

/** Builds read-only kitchen tools and a staff-review request; none writes a booking. */
export function createKitchenTools({
  kitchen,
  state,
  chefId,
  message,
  now,
  runTool,
  activity,
}: {
  kitchen?: KitchenAccess;
  state: AgentState;
  chefId: string;
  message: InboundMessage;
  now: Date;
  runTool: (
    name: string,
    input: unknown,
    action: () => unknown | Promise<unknown>,
  ) => Promise<JSONValue>;
  activity: { handedOff: boolean; kitchenReview?: boolean };
}) {
  /** Requires the sender's server-bound web account before using kitchen records. */
  function accessAvailable() {
    const chef = state.chefs.find(
      item => item.id === chefId && item.phone === message.from,
    );
    return Boolean(kitchen && chef?.userId);
  }

  /** Keeps query windows finite; the 31-day bound is not a booking policy. */
  function validInterval(input: KitchenAvailabilityInput) {
    const start = Date.parse(input.startAt);
    const end = Date.parse(input.endAt);
    return (
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      start > now.getTime() &&
      end > start &&
      end - start <= queryLimitMs
    );
  }

  /** Validates the backend result and binds it to exactly the requested interval. */
  async function availability(input: KitchenAvailabilityInput) {
    const query = {
      amenity: input.amenity,
      startAt: input.startAt,
      endAt: input.endAt,
    };
    const result = kitchenAvailabilitySchema.parse(
      await kitchen!.checkAvailability(query),
    );
    if (
      result.amenity !== input.amenity ||
      Date.parse(result.startAt) !== Date.parse(input.startAt) ||
      Date.parse(result.endAt) !== Date.parse(input.endAt)
    ) {
      throw new Error("Kitchen result does not match the request.");
    }
    return result;
  }

  return {
    list_my_kitchen_bookings: tool({
      description:
        "List this chef's kitchen bookings, including pending and denied requests. Requires a linked approved web account.",
      inputSchema: noInput,
      execute: async input =>
        runTool("list_my_kitchen_bookings", input, async () => {
          if (!accessAvailable()) return { error: "kitchen_unavailable" };
          try {
            const bookings = kitchenBookingsSchema.parse(
              await kitchen!.listBookings(),
            );
            if (
              bookings.some(
                row => Date.parse(row.endAt) <= Date.parse(row.startAt),
              )
            ) {
              return { error: "kitchen_unavailable" };
            }
            return bookings.map(withLocalTimes);
          } catch {
            return { error: "kitchen_unavailable" };
          }
        }),
    }),
    check_kitchen_availability: tool({
      description:
        "Check approved booking conflicts for a known amenity and explicit start/end timestamps with timezone offsets. This does not confirm opening hours, capacity, or a booking. Each query can span at most 31 days.",
      inputSchema: kitchenAvailabilityInputSchema,
      execute: async input =>
        runTool("check_kitchen_availability", input, async () => {
          if (!accessAvailable()) return { error: "kitchen_unavailable" };
          if (!validInterval(input))
            return { error: "invalid_kitchen_interval" };
          try {
            return {
              ...withLocalTimes(await availability(input)),
              notice: availabilityNotice,
            };
          } catch {
            return { error: "kitchen_unavailable" };
          }
        }),
    }),
    request_kitchen_booking_review: tool({
      description:
        "Queue staff review of an explicit kitchen request with amenity, start/end timestamps and people count. Quote this user's current message exactly. This does not create, approve, or confirm a booking.",
      inputSchema: z.strictObject({
        ...kitchenAvailabilityInputSchema.shape,
        people: z.number().int().positive(),
        sourceQuote: z.string().trim().min(1).max(500),
      }),
      execute: async input =>
        runTool("request_kitchen_booking_review", input, async () => {
          if (!accessAvailable()) return { error: "kitchen_unavailable" };
          if (
            !message.text.includes(input.sourceQuote) ||
            /^(confirm|yes|yes please|correct|sí|si|cancel|never mind|nevermind)[.!]?$/i.test(
              message.text.trim(),
            )
          ) {
            return { error: "clarification_required" };
          }
          if (!validInterval(input))
            return { error: "invalid_kitchen_interval" };
          try {
            const result = await availability(input);
            if (result.status !== "no_approved_conflicts") {
              return { ...result, bookingConfirmed: false };
            }
            const starts = reviewTime.format(new Date(input.startAt));
            const ends = reviewTime.format(new Date(input.endAt));
            const reason = `Kitchen review: ${input.amenity}; ${starts} to ${ends} (Oakland); ${input.people} people. Not booked.`;
            const existing = state.handoffs.find(
              row =>
                row.chefId === chefId &&
                row.messageId === message.providerMessageId,
            );
            if (existing && existing.reason !== reason) {
              return { error: "clarification_required" };
            }
            if (!existing) {
              state.handoffs.push({
                chefId,
                messageId: message.providerMessageId,
                reason,
                createdAt: now.toISOString(),
              });
            }
            activity.handedOff = true;
            activity.kitchenReview = true;
            return { status: "queued_for_review", bookingConfirmed: false };
          } catch {
            return { error: "kitchen_unavailable" };
          }
        }),
    }),
  };
}
