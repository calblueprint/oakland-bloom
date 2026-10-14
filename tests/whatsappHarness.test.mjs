import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const TESTS = dirname(fileURLToPath(import.meta.url));

// Copy only the runner, parser source, and fixtures: no installed dependencies,
// credentials, or network, and test mutations never touch repository fixtures.
function runHarness(change = () => {}) {
  const root = mkdtempSync(join(tmpdir(), "whatsapp-harness-"));
  const fixtures = join(root, "tests", "fixtures", "whatsapp");
  const library = join(root, "lib", "whatsapp");
  try {
    cpSync(join(TESTS, "fixtures", "whatsapp"), fixtures, { recursive: true });
    cpSync(join(TESTS, "..", "lib", "whatsapp"), library, { recursive: true });
    cpSync(
      join(TESTS, "whatsappHarness.mjs"),
      join(root, "tests", "whatsappHarness.mjs"),
    );
    change(fixtures, library);
    const result = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
        join(root, "tests", "whatsappHarness.mjs"),
      ],
      { cwd: root, encoding: "utf8" },
    );
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    return result;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("harness succeeds offline with the two expected validation rejections", () => {
  const result = runHarness();
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /7 fixtures processed, 2 rejected by validation\./,
  );
  assert.match(result.stdout, /0 unexpected failures\./);
});

test("harness fails when a valid fixture is rejected", () => {
  const result = runHarness(fixtures => {
    const path = join(fixtures, "meta-valid-response.json");
    const payload = JSON.parse(readFileSync(path, "utf8"));
    delete payload.entry[0].changes[0].value.messages[0].id;
    writeFileSync(path, JSON.stringify(payload));
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /UNEXPECTED InboundParseError:/);
  assert.match(result.stdout, /2 rejected by validation\./);
  assert.match(result.stdout, /1 unexpected failures\./);
});

test("harness fails when a malformed fixture is accepted", () => {
  const result = runHarness(fixtures => {
    cpSync(
      join(fixtures, "meta-valid-response.json"),
      join(fixtures, "meta-malformed.json"),
    );
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(
    result.stdout,
    /Expected validation rejection, but fixture was accepted/,
  );
  assert.match(result.stdout, /1 rejected by validation\./);
  assert.match(result.stdout, /1 unexpected failures\./);
});

test("harness fails on invalid JSON even in a malformed fixture", () => {
  const result = runHarness(fixtures => {
    writeFileSync(join(fixtures, "meta-malformed.json"), "{");
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /UNEXPECTED SyntaxError:/);
  assert.match(result.stdout, /1 rejected by validation\./);
  assert.match(result.stdout, /1 unexpected failures\./);
});

test("harness fails on unexpected parser exceptions", () => {
  const result = runHarness((fixtures, library) => {
    const path = join(library, "parseTwilio.ts");
    const source = readFileSync(path, "utf8");
    writeFileSync(
      path,
      source.replace(
        "const params = toParams(payload, fail);",
        'throw new TypeError("synthetic parser regression");',
      ),
    );
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(
    result.stdout,
    /UNEXPECTED TypeError: synthetic parser regression/,
  );
  assert.match(result.stdout, /1 rejected by validation\./);
  assert.match(result.stdout, /3 unexpected failures\./);
});

test("harness fails when an expected fixture is missing", () => {
  const result = runHarness(fixtures => {
    rmSync(join(fixtures, "meta-valid-response.json"));
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(
    result.stdout,
    /meta-valid-response.json\n  UNEXPECTED Error: Expected fixture is missing/,
  );
  assert.match(
    result.stdout,
    /6 fixtures processed, 2 rejected by validation\./,
  );
  assert.match(result.stdout, /1 unexpected failures\./);
});

test("harness fails when the fixture directory is empty", () => {
  const result = runHarness(fixtures => {
    for (const name of [
      "meta-valid-response.json",
      "meta-unrecognized-response.json",
      "meta-status-callback.json",
      "meta-malformed.json",
      "twilio-valid-response.txt",
      "twilio-unrecognized-response.txt",
      "twilio-malformed.txt",
    ]) {
      rmSync(join(fixtures, name));
    }
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(
    result.stdout,
    /0 fixtures processed, 0 rejected by validation\./,
  );
  assert.match(result.stdout, /7 unexpected failures\./);
});

test("harness fails when a fixture has no declared outcome", () => {
  const result = runHarness(fixtures => {
    cpSync(
      join(fixtures, "meta-valid-response.json"),
      join(fixtures, "meta-new-response.json"),
    );
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /Fixture has no declared expected outcome/);
  assert.match(result.stdout, /1 unexpected failures\./);
});

test("harness fails when a text fixture produces no messages", () => {
  const result = runHarness(fixtures => {
    cpSync(
      join(fixtures, "meta-status-callback.json"),
      join(fixtures, "meta-valid-response.json"),
    );
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(
    result.stdout,
    /Expected an inbound message, but fixture produced none/,
  );
  assert.match(result.stdout, /1 unexpected failures\./);
});

test("harness fails when a status fixture produces messages", () => {
  const result = runHarness(fixtures => {
    cpSync(
      join(fixtures, "meta-valid-response.json"),
      join(fixtures, "meta-status-callback.json"),
    );
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(
    result.stdout,
    /Expected no inbound messages, but fixture produced a message/,
  );
  assert.match(result.stdout, /1 unexpected failures\./);
});
