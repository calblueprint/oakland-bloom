import type { LanguageModel } from "ai";
import { generateText, Output } from "ai";
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

const clockWithZone = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
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
  // A fall-back interval can have identical wall-clock times with different offsets.
  const zone = (value: Date) =>
    clockWithZone
      .formatToParts(value)
      .find(part => part.type === "timeZoneName")?.value;
  const times = zone(first) === zone(last) ? clock : clockWithZone;
  return `${startDate} at ${times.format(first)}–${startDate === endDate ? "" : `${endDate} at `}${times.format(last)} (Oakland time)`;
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
  const parts: Record<string, string | undefined> = {
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

const styleChoice = z.strictObject({
  tone: z.enum(["warm", "direct"]),
  layout: z.enum(["compact", "spaced"]),
  inviteDetails: z.boolean(),
});
type StyleChoice = z.infer<typeof styleChoice>;

const defaultStyle: StyleChoice = {
  tone: "warm",
  layout: "compact",
  inviteDetails: true,
};

/** Uses a conversational first line whose wording is tied to the actual event and outcome. */
function warmIntro(facts: z.infer<typeof noticeFacts>) {
  const { notificationKind, status, reference } = facts;
  const title = facts.title?.replace(/\s+/g, " ").trim();
  const forTitle = title ? ` for ${title}` : "";
  if (notificationKind === "booking_update") {
    switch (status) {
      case "approved":
        return `Good news, your kitchen booking${forTitle} is approved.`;
      case "pending":
        return `Your kitchen booking request${forTitle} came through. It's still pending.`;
      case "denied":
        return `Quick update: your kitchen booking${forTitle} wasn't approved.`;
      case "removed":
        return `Your kitchen booking${forTitle} was removed.`;
      default:
        return `There's an update to your kitchen booking${forTitle}.`;
    }
  }

  const event = title ? `${title} (${reference})` : reference;
  if (notificationKind === "catering_alert")
    return `Hey, a new catering request came in for ${event}.`;
  if (status === "closed")
    return `Quick update: the catering request for ${event} has closed.`;
  if (status === "accepted")
    return `Quick update: the catering request for ${event} was accepted.`;
  if (status === "open")
    return `Quick update on ${event}. It's still open for responses.`;
  return `There's an update to the catering request for ${event}.`;
}

/** Renders the full notice from canonical facts and the agent's style choice. */
function renderNotice(facts: z.infer<typeof noticeFacts>, choice: StyleChoice) {
  const parts = makeParts(facts);
  const intro =
    choice.tone === "warm"
      ? warmIntro(facts)
      : [parts.HEADLINE, [parts.TITLE, parts.STATUS].filter(Boolean).join(" ")]
          .filter(Boolean)
          .join("\n\n");

  const joined = (...items: (string | undefined)[]) =>
    items.filter(Boolean).join(" · ");
  const details =
    choice.layout === "compact"
      ? [joined(parts.WHEN, parts.WHERE), joined(parts.EQUIPMENT, parts.PEOPLE)]
      : [parts.WHEN, parts.WHERE, parts.EQUIPMENT, parts.PEOPLE];
  const canShareDetails =
    facts.notificationKind === "catering_alert" ||
    (facts.notificationKind === "catering_update" && facts.status === "open");
  return [
    intro,
    details.filter(Boolean).join("\n"),
    parts.DETAILS,
    parts.REFERENCE,
    choice.inviteDetails && canShareDetails
      ? "Want to take a look? Reply here and I can share the details."
      : undefined,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Lets the conversation model choose tone and layout while code controls every word sent. */
export async function styleAgentNotice(
  model: LanguageModel,
  data: unknown,
  original: string,
) {
  const parsed = noticeFacts.safeParse(data);
  if (!parsed.success) return original;
  const facts = parsed.data;
  let choice = defaultStyle;
  try {
    const draft = await generateText({
      model,
      system: `Choose how Oakland Bloom should format this WhatsApp notice.
Prefer "warm" for a notice that reads like a brief text from a coordinator. Use "direct" for a compact status card.
"compact" combines related details on a line. "spaced" gives each detail its own line.
Include an invitation when offering to share details would help the chef. The app permits it for open catering requests only.
The app writes the actual words and enforces the status and any action the chef can take.`,
      prompt: JSON.stringify({
        event: facts.notificationKind,
        status: facts.status,
        hasSchedule: Boolean(facts.startsAt),
        hasLocation: Boolean(facts.location),
        hasEquipment: Boolean(facts.amenities?.length),
      }),
      output: Output.object({ schema: styleChoice }),
      maxOutputTokens: 512,
      maxRetries: 0,
      timeout: 8_000,
    });
    if (draft.finishReason === "stop") choice = styleChoice.parse(draft.output);
  } catch {
    // The notice can still send if the model times out or returns an invalid choice.
  }
  const body = renderNotice(facts, choice);
  return body.length <= 4000 ? body : original;
}
