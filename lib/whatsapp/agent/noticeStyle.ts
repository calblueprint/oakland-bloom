import type { LanguageModel } from "ai";
import { generateText } from "ai";
import { z } from "zod";

const noticeFacts = z.object({
  notificationKind: z.enum([
    "catering_alert",
    "catering_update",
    "booking_update",
  ]),
  title: z.string().min(1).optional(),
  reference: z.string().min(1),
  status: z.string().optional(),
  startsAt: z.iso.datetime({ offset: true }).optional(),
  endsAt: z.iso.datetime({ offset: true }).optional(),
  guestCount: z
    .string()
    .regex(/^-?\d+$/)
    .optional(),
  location: z.string().optional(),
  details: z.string().optional(),
  amenities: z.array(z.string()).optional(),
});

const date = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const clock = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  hour: "numeric",
  minute: "2-digit",
});

const amenityNames: Record<string, string> = {
  oven: "Oven",
  kitchen: "Kitchen",
  bar_prep_table: "Bar prep table",
  salad_bar_table: "Salad bar table",
};

/** Formats the reservation's time range in Oakland, including both dates for overnight bookings. */
function when(start: string, end?: string) {
  const first = new Date(start);
  const startDate = date.format(first);
  const starts = `${startDate} at ${clock.format(first)}`;
  if (!end) return `${starts} (Oakland time)`;
  const last = new Date(end);
  const endDate = date.format(last);
  return `${starts}–${startDate === endDate ? "" : `${endDate} at `}${clock.format(last)} (Oakland time)`;
}

/** Builds the facts that the model may arrange but may not edit or omit. */
function makeParts(facts: z.infer<typeof noticeFacts>) {
  const { notificationKind, status, reference } = facts;
  const booking = notificationKind === "booking_update";
  const headings: Record<string, string> = {
    approved: "Kitchen booking approved",
    pending: "Kitchen booking pending",
    denied: "Kitchen booking declined",
    removed: "Kitchen booking removed",
  };
  const heading = booking
    ? status && Object.hasOwn(headings, status)
      ? headings[status]
      : "Kitchen booking update"
    : notificationKind === "catering_alert"
      ? "New catering request"
      : status === "closed"
        ? "Catering request closed"
        : status === "accepted"
          ? "Catering request accepted"
          : "Catering request updated";
  const parts: Record<string, string> = {
    HEADLINE: `*${heading}${booking ? "" : ` · ${reference}`}*`,
  };
  if (facts.title) parts.TITLE = facts.title;
  if (notificationKind === "catering_update" && status === "open")
    parts.STATUS = "Still open for responses.";
  if (facts.startsAt) parts.WHEN = when(facts.startsAt, facts.endsAt);
  if (facts.location) parts.WHERE = facts.location;
  if (facts.amenities?.length)
    parts.EQUIPMENT = facts.amenities
      .map(name =>
        Object.hasOwn(amenityNames, name) ? amenityNames[name] : name,
      )
      .join(", ");
  if (facts.guestCount)
    parts.PEOPLE = `${facts.guestCount} ${booking ? "people" : "guests"}`;
  if (facts.details) parts.DETAILS = facts.details;
  if (booking) parts.REFERENCE = `Ref. ${reference}`;
  return parts;
}

/** Resolves slots only after validating that the draft includes every fact exactly once. */
function fillDraft(draft: string, parts: Record<string, string>) {
  const slots = [...draft.matchAll(/\[\[([A-Z]+)\]\]/g)].map(match => match[1]);
  if (
    (!draft.startsWith("[[HEADLINE]]\n\n") && draft !== "[[HEADLINE]]") ||
    slots.length !== Object.keys(parts).length ||
    Object.keys(parts).some(
      name => slots.filter(slot => slot === name).length !== 1,
    )
  )
    return null;
  const prose = draft.replace(/\[\[[A-Z]+\]\]/g, "").trim();
  if (
    prose.length > 140 ||
    /\b(status|when|where|headcount|equipment|reference):/i.test(prose) ||
    /[0-9@\[\]<>*_`~]|https?:|\bwww\./i.test(prose)
  )
    return null;
  const message = draft.replace(
    /\[\[([A-Z]+)\]\]/g,
    (_, name: string) => parts[name],
  );
  return message.length <= 4000 ? message : null;
}

/** Lets the conversation model write a short notice without tools or private field values. */
export async function styleAgentNotice(
  model: LanguageModel,
  data: unknown,
  original: string,
) {
  const parsed = noticeFacts.safeParse(data);
  if (!parsed.success) return original;
  const facts = parsed.data;
  const parts = makeParts(facts);
  const fallback = [
    parts.HEADLINE,
    Object.values(parts).slice(1).join("\n"),
    ...(facts.notificationKind === "catering_alert"
      ? ["Reply here if you want the details."]
      : []),
  ]
    .filter(Boolean)
    .join("\n\n");
  try {
    const draft = await generateText({
      model,
      system: `You write short WhatsApp notifications for Oakland Bloom chefs. Sound like a friendly coordinator.
Start with [[HEADLINE]] on its own line, followed by a blank line. The headline already states the event and its outcome.
Use each supplied placeholder verbatim and exactly once. Put the title in a short natural sentence or on its own line.
Keep related details together on short lines. The slots already include natural wording where needed.
Avoid field labels like "Status:", "When:", "Equipment:", "Headcount:", or "Reference:". Avoid "Here are the details" and generic closings.
Example for an approved booking: [[HEADLINE]]\n\nYou're all set for [[TITLE]].\n\n[[WHEN]]\n[[EQUIPMENT]] · [[PEOPLE]]\n\n[[REFERENCE]]
Example for an open catering update: [[HEADLINE]]\n\nQuick update on [[TITLE]]. [[STATUS]]\n\n[[WHEN]] · [[WHERE]]\n[[PEOPLE]]
These are examples of tone only. Use only the slots listed in the input.
You may invite the chef to ask for details when that helps, but don't ask for confirmation, propose a new action, or imply anything was booked or accepted beyond the headline.
Add no facts, numbers, links, extra markup, filler greeting, or signature. Write only the message draft.`,
      prompt: JSON.stringify({
        event: facts.notificationKind,
        status: facts.status,
        slots: Object.keys(parts).map(name => `[[${name}]]`),
      }),
      maxOutputTokens: 512,
      maxRetries: 0,
      timeout: 8_000,
    });
    if (draft.finishReason === "stop") {
      const message = fillDraft(draft.text.trim(), parts);
      if (message) return message;
    }
  } catch {
    // The notice can still send if the model times out or is unavailable.
  }
  return fallback.length <= 4000 ? fallback : original;
}
