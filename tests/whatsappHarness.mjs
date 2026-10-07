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

const files = readdirSync(FIXTURES).sort();
let failures = 0;

for (const name of files) {
  const contents = readFileSync(join(FIXTURES, name), "utf8");
  process.stdout.write(`\n${name}\n`);

  try {
    const messages = parseFixture(name, contents);

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
    failures += 1;
    if (error instanceof InboundParseError) {
      // Expected for the *-malformed fixtures: validation failed explicitly.
      process.stdout.write(
        `  rejected (${error.provider}): ${error.message}\n`,
      );
    } else {
      process.stdout.write(`  UNEXPECTED ${error.name}: ${error.message}\n`);
    }
  }
}

process.stdout.write(
  `\n${files.length} fixtures processed, ${failures} rejected by validation.\n` +
    "Rejections are expected for the *-malformed fixtures.\n",
);
