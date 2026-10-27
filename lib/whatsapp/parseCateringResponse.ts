/**
 * Catering reply parsing.
 *
 * Works on `InboundMessage.text` only, so it never sees provider payloads and
 * applies identically to Meta and Twilio messages. Supported replies:
 *
 *   OB12 yes   interested in opportunity OB12
 *   OB12 no    not interested in opportunity OB12
 *
 * An opportunity reference is `OB` followed by the opportunity number with no
 * leading zeros (`OB12`, not `OB012`), so each opportunity has exactly one
 * spelling. Case and surrounding or repeated whitespace are ignored. Anything
 * else is unrecognized and left for a person to read; see
 * tests/whatsapp-harness.md for the full rules.
 */
export type CateringResponse =
  RecognizedCateringResponse | UnrecognizedResponse;

export interface RecognizedCateringResponse {
  kind: "catering-response";
  /** Uppercase opportunity reference, e.g. `OB12`. */
  opportunityRef: string;
  interested: boolean;
}

export interface UnrecognizedResponse {
  kind: "unrecognized";
  reason: UnrecognizedReason;
}

/**
 * - `missing-reference`: no valid opportunity reference anywhere in the text.
 * - `unsupported-answer`: a reference followed by nothing, or by one word that
 *   is not `yes` or `no`.
 * - `ambiguous`: a reference plus extra words, several references, or a
 *   reference that does not come first.
 */
export type UnrecognizedReason =
  "missing-reference" | "unsupported-answer" | "ambiguous";

const OPPORTUNITY_REF = /^OB[1-9]\d*$/i;
const ANSWERS: Record<string, boolean> = { yes: true, no: false };

export function parseCateringResponse(text: string): CateringResponse {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const isRef = (word: string): boolean => OPPORTUNITY_REF.test(word);
  const unrecognized = (reason: UnrecognizedReason): UnrecognizedResponse => ({
    kind: "unrecognized",
    reason,
  });

  if (!words.some(isRef)) return unrecognized("missing-reference");

  // A reference exists, so if it isn't the first word it is somewhere in `rest`.
  const [ref, ...rest] = words;
  if (rest.length > 1 || rest.some(isRef)) return unrecognized("ambiguous");

  const answer = rest[0]?.toLowerCase();
  if (answer === undefined || !Object.hasOwn(ANSWERS, answer))
    return unrecognized("unsupported-answer");

  return {
    kind: "catering-response",
    opportunityRef: ref.toUpperCase(),
    interested: ANSWERS[answer],
  };
}
