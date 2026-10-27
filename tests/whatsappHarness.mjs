/**
 * Local inbound-message harness.
 *
 * Runs every fixture in tests/fixtures/whatsapp through the provider parsers and
 * prints the normalized result or a readable validation error. No network, no
 * provider credentials, no database.
 *
 * Run with: pnpm harness:whatsapp
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { InboundParseError } from "../lib/whatsapp/inboundMessage.ts";
import { parseMetaPayload } from "../lib/whatsapp/parseMeta.ts";
import { parseTwilioPayload } from "../lib/whatsapp/parseTwilio.ts";

const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "whatsapp",
);

/**
 * Meta fixtures are JSON; Twilio fixtures are raw form-encoded text. Twilio
 * sends one message per request and throws on a bad one, so it never has
 * per-message rejections.
 */
function parseFixture(name, contents) {
  if (name.startsWith("meta-")) return parseMetaPayload(JSON.parse(contents));
  if (name.startsWith("twilio-")) {
    return { messages: parseTwilioPayload(contents.trim()), rejected: [] };
  }
  throw new Error(`Fixture ${name} must start with "meta-" or "twilio-".`);
}

/** Classifies a parsed batch so it can be compared to the declared outcome. */
function outcomeOf({ messages, rejected }) {
  if (messages.length > 0) return rejected.length > 0 ? "partial" : "message";
  return rejected.length > 0 ? "rejection" : "empty";
}

const OUTCOME_DESCRIPTIONS = {
  rejection: "validation rejection",
  message: "an inbound message",
  empty: "no inbound messages",
  partial: "accepted and rejected messages",
};

const EXPECTED_OUTCOMES = new Map([
  ["meta-button-reply.json", "message"],
  ["meta-interactive-reply.json", "message"],
  ["meta-malformed.json", "rejection"],
  ["meta-partial-batch.json", "partial"],
  ["meta-status-callback.json", "empty"],
  ["meta-unrecognized-response.json", "message"],
  ["meta-valid-response.json", "message"],
  ["twilio-malformed.txt", "rejection"],
  ["twilio-unrecognized-response.txt", "message"],
  ["twilio-valid-response.txt", "message"],
]);
const files = readdirSync(FIXTURES).sort();
let rejections = 0;
let unexpectedFailures = 0;

for (const name of EXPECTED_OUTCOMES.keys()) {
  if (!files.includes(name)) {
    unexpectedFailures += 1;
    process.stdout.write(
      `\n${name}\n  UNEXPECTED Error: Expected fixture is missing.\n`,
    );
  }
}

for (const name of files) {
  process.stdout.write(`\n${name}\n`);
  const expected = EXPECTED_OUTCOMES.get(name);

  try {
    if (expected === undefined) {
      throw new Error("Fixture has no declared expected outcome.");
    }
    const contents = readFileSync(join(FIXTURES, name), "utf8");
    const batch = parseFixture(name, contents);
    const actual = outcomeOf(batch);

    if (actual !== expected) {
      throw new Error(
        `Expected ${OUTCOME_DESCRIPTIONS[expected]}, but fixture produced ${OUTCOME_DESCRIPTIONS[actual]}.`,
      );
    }

    if (actual === "empty") {
      process.stdout.write(
        "  no inbound messages (status callback or empty batch)\n",
      );
    }

    for (const message of batch.messages) {
      process.stdout.write(
        `  ok  ${message.provider}  ${message.providerMessageId}\n` +
          `      from: ${message.from}\n` +
          `      text: ${JSON.stringify(message.text)}\n`,
      );
    }
    for (const { providerMessageId, reason } of batch.rejected) {
      rejections += 1;
      process.stdout.write(
        `  rejected (meta) ${providerMessageId ?? "<no id>"}: ${reason}\n`,
      );
    }
  } catch (error) {
    if (error instanceof InboundParseError && expected === "rejection") {
      rejections += 1;
      process.stdout.write(
        `  rejected (${error.provider}): ${error.message}\n`,
      );
    } else {
      unexpectedFailures += 1;
      process.stdout.write(`  UNEXPECTED ${error.name}: ${error.message}\n`);
    }
  }
}

process.stdout.write(
  `\n${files.length} fixtures processed, ${rejections} rejected by validation.\n` +
    `${unexpectedFailures} unexpected failures.\n` +
    "Rejections are expected for the *-malformed and *-partial-batch fixtures.\n",
);
process.exitCode = unexpectedFailures > 0 ? 1 : 0;
