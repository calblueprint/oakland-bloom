import type { LanguageModel } from "ai";
import { generateText, Output } from "ai";
import { z } from "zod";

// Supabase supplies the event facts. The model receives only their shape and the status.
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

type NoticeFacts = z.infer<typeof noticeFacts>;

const oaklandTimeZone = "America/Los_Angeles";
const localDate = new Intl.DateTimeFormat("en-US", {
  timeZone: oaklandTimeZone,
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const localClock = new Intl.DateTimeFormat("en-US", {
  timeZone: oaklandTimeZone,
  hour: "numeric",
  minute: "2-digit",
});

const localClockWithZone = new Intl.DateTimeFormat("en-US", {
  timeZone: oaklandTimeZone,
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

// Only the code below can write an approval, decline, or call to action.
const bookingHeadings: Record<string, string> = {
  approved: "Kitchen booking approved",
  pending: "Kitchen booking pending",
  denied: "Kitchen booking declined",
  removed: "Kitchen booking removed",
};

/** Shows a time-zone abbreviation when the two ends cross a daylight-saving change. */
function zoneAt(time: Date) {
  return localClockWithZone
    .formatToParts(time)
    .find(part => part.type === "timeZoneName")?.value;
}

/** Keeps both calendar dates visible for an overnight booking and uses Oakland time. */
function formatSchedule(start: string, end?: string) {
  const first = new Date(start);
  const startDate = localDate.format(first);
  if (!end) return `${startDate} at ${localClock.format(first)} (Oakland time)`;

  const last = new Date(end);
  const endDate = localDate.format(last);
  const clock =
    zoneAt(first) === zoneAt(last) ? localClock : localClockWithZone;
  const startLabel = `${startDate} at ${clock.format(first)}`;
  const endLabel =
    startDate === endDate
      ? clock.format(last)
      : `${endDate} at ${clock.format(last)}`;
  return `${startLabel}–${endLabel} (Oakland time)`;
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
function warmIntro(facts: NoticeFacts) {
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

/** Builds the more compact heading-and-title option, including the catering reference. */
function directIntro(facts: NoticeFacts) {
  const { notificationKind, status, reference, title } = facts;
  if (notificationKind === "booking_update") {
    const heading =
      status && Object.hasOwn(bookingHeadings, status)
        ? bookingHeadings[status]
        : "Kitchen booking update";
    return [`*${heading}*`, title].filter(Boolean).join("\n\n");
  }

  let heading = "Catering request updated";
  if (notificationKind === "catering_alert") heading = "New catering request";
  else if (status === "closed") heading = "Catering request closed";
  else if (status === "accepted") heading = "Catering request accepted";

  const stillOpen =
    notificationKind === "catering_update" && status === "open"
      ? "Still open for responses."
      : undefined;
  const summary = [title, stillOpen].filter(Boolean).join(" ");
  return [`*${heading} · ${reference}*`, summary].filter(Boolean).join("\n\n");
}

/** Formats factual lines. Compact layout groups time with place and equipment with headcount. */
function formatDetails(facts: NoticeFacts, layout: StyleChoice["layout"]) {
  const schedule =
    facts.startsAt && formatSchedule(facts.startsAt, facts.endsAt);
  const equipment = facts.amenities
    ?.map(name =>
      Object.hasOwn(amenityNames, name) ? amenityNames[name] : name,
    )
    .join(", ");
  const people =
    facts.guestCount &&
    `${facts.guestCount} ${facts.notificationKind === "booking_update" ? "people" : "guests"}`;
  const timeAndPlace = [schedule, facts.location].filter(Boolean);
  const equipmentAndPeople = [equipment, people].filter(Boolean);
  return layout === "compact"
    ? [timeAndPlace.join(" · "), equipmentAndPeople.join(" · ")]
        .filter(Boolean)
        .join("\n")
    : [...timeAndPlace, ...equipmentAndPeople].join("\n");
}

/** Combines an opening, current facts, and an invitation only when the request is open. */
function renderNotice(facts: NoticeFacts, choice: StyleChoice) {
  const intro = choice.tone === "warm" ? warmIntro(facts) : directIntro(facts);
  const bookingReference =
    facts.notificationKind === "booking_update"
      ? `Ref. ${facts.reference}`
      : undefined;
  const canShareDetails =
    facts.notificationKind === "catering_alert" ||
    (facts.notificationKind === "catering_update" && facts.status === "open");

  return [
    intro,
    formatDetails(facts, choice.layout),
    facts.details,
    bookingReference,
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
  // A timeout or invalid choice still produces a complete, readable notice.
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
  // Keep the original database text if formatting would overrun the send limit.
  return body.length <= 4000 ? body : original;
}
