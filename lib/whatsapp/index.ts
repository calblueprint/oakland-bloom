// Shared parser entry point. Keep agent SDK imports separate so these parsers
// and their fixture harness can run without installing the agent's dependencies.
export {
  InboundParseError,
  normalizePhone,
  type InboundBatch,
  type InboundMedia,
  type InboundMessage,
  type Provider,
  type RejectedMessage,
} from "./inboundMessage.ts";
export {
  parseCateringResponse,
  type CateringResponse,
  type RecognizedCateringResponse,
  type UnrecognizedReason,
  type UnrecognizedResponse,
} from "./parseCateringResponse.ts";
export { parseMetaPayload } from "./parseMeta.ts";
export { parseTwilioPayload } from "./parseTwilio.ts";
