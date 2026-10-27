import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseCateringResponse } from "../lib/whatsapp/parseCateringResponse.ts";
import { parseMetaPayload } from "../lib/whatsapp/parseMeta.ts";
import { parseTwilioPayload } from "../lib/whatsapp/parseTwilio.ts";

const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "whatsapp",
);
const read = name => readFileSync(join(FIXTURES, name), "utf8");
const fixtureText = name => {
  const [message] = name.startsWith("meta-")
    ? parseMetaPayload(JSON.parse(read(name))).messages
    : parseTwilioPayload(read(name).trim());
  return message.text;
};

const interested = opportunityRef => ({
  kind: "catering-response",
  opportunityRef,
  interested: true,
});
const notInterested = opportunityRef => ({
  kind: "catering-response",
  opportunityRef,
  interested: false,
});
const unrecognized = reason => ({ kind: "unrecognized", reason });

test("parses both supported replies from provider fixtures end to end", () => {
  // Fixtures go through the same normalization as the harness, so this proves
  // the parser works on real normalized text from both providers.
  for (const [name, expected] of [
    ["meta-valid-response.json", interested("OB12")],
    ["twilio-valid-response.txt", interested("OB12")],
    ["meta-reply-no.json", notInterested("OB12")],
    ["twilio-reply-mixed-case.txt", interested("OB12")],
    ["meta-reply-extra-whitespace.json", interested("OB12")],
    ["twilio-reply-missing-reference.txt", unrecognized("missing-reference")],
    ["meta-reply-unsupported-answer.json", unrecognized("unsupported-answer")],
  ]) {
    assert.deepEqual(parseCateringResponse(fixtureText(name)), expected, name);
  }
});

test("ignores capitalization and normalizes the reference to uppercase", () => {
  // One spelling per opportunity, so later lookups never miss on case.
  for (const text of ["ob12 yes", "Ob12 Yes", "oB12 YES", "OB12 yEs"]) {
    assert.deepEqual(parseCateringResponse(text), interested("OB12"), text);
  }
  assert.deepEqual(parseCateringResponse("ob7 NO"), notInterested("OB7"));
});

test("ignores surrounding and repeated whitespace", () => {
  for (const text of [
    " OB12 yes",
    "OB12 yes ",
    "OB12    yes",
    "\tOB12\tno\n",
    "\n\nOB12   no",
  ]) {
    assert.equal(parseCateringResponse(text).kind, "catering-response", text);
  }
});

test("needs an opportunity reference, since yes or no alone can't be matched to a request", () => {
  for (const text of [
    "",
    "   ",
    "yes",
    "No",
    "OB yes",
    "12 yes",
    "OB012 yes",
    "OB0 yes",
    "OB-12 yes",
    "OB12yes",
    "cant do sat but sunday works",
  ]) {
    assert.deepEqual(
      parseCateringResponse(text),
      unrecognized("missing-reference"),
      text,
    );
  }
});

test("rejects answers other than yes or no", () => {
  for (const text of [
    "OB12",
    "OB12 maybe",
    "OB12 y",
    "OB12 yeah",
    "OB12 yes.",
    "OB12 yes!",
    "OB12 sí",
  ]) {
    assert.deepEqual(
      parseCateringResponse(text),
      unrecognized("unsupported-answer"),
      text,
    );
  }
});

test("flags extra words, several references, or a misplaced reference as ambiguous", () => {
  // Guessing here could commit a chef to the wrong event, so a person decides.
  for (const text of [
    "OB12 yes no",
    "OB12 yes please",
    "OB12 OB13 yes",
    "OB12 yes OB13 no",
    "OB12 OB12 yes",
    "yes OB12",
    "sure OB12 yes",
  ]) {
    assert.deepEqual(
      parseCateringResponse(text),
      unrecognized("ambiguous"),
      text,
    );
  }
});

test("does not treat inherited object keys as answers", () => {
  for (const text of ["OB12 constructor", "OB12 toString", "OB12 __proto__"]) {
    assert.deepEqual(
      parseCateringResponse(text),
      unrecognized("unsupported-answer"),
      text,
    );
  }
});
