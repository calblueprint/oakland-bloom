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

/** Meta fixtures are JSON; Twilio fixtures are raw form-encoded text. */
function parseFixture(name, contents) {
  if (name.startsWith("meta-")) return parseMetaPayload(JSON.parse(contents));
  if (name.startsWith("twilio-")) return parseTwilioPayload(contents.trim());
  throw new Error(`Fixture ${name} must start with "meta-" or "twilio-".`);
}

const EXPECTED_OUTCOMES = new Map([
  ["meta-malformed.json", "rejection"],
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
    const messages = parseFixture(name, contents);

    if (expected === "rejection") {
      throw new Error(
        "Expected validation rejection, but fixture was accepted.",
      );
    }
    if (expected === "message" && messages.length === 0) {
      throw new Error(
        "Expected an inbound message, but fixture produced none.",
      );
    }
    if (expected === "empty" && messages.length !== 0) {
      throw new Error(
        "Expected no inbound messages, but fixture produced a message.",
      );
    }

    if (messages.length === 0) {
      process.stdout.write(
        "  no inbound messages (status callback or empty batch)\n",
      );
      continue;
    }

    for (const message of messages) {
      process.stdout.write(
        `  ok  ${message.provider}  ${message.providerMessageId}\n` +
          `      from: ${message.from}\n` +
          `      text: ${JSON.stringify(message.text)}\n`,
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
    "Rejections are expected for the *-malformed fixtures.\n",
);
process.exitCode = unexpectedFailures > 0 ? 1 : 0;
