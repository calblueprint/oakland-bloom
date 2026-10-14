import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runSeed } from "../scripts/seedReservations.mjs";

const databaseUrl = "postgresql://test:secret@example.invalid:5432/postgres";

test("rejects missing/invalid configuration without creating a connection", async () => {
  const createClient = () => {
    throw new Error("Must not connect");
  };
  for (const value of ["", " ", "bad-url", "https://example.invalid"]) {
    await assert.rejects(
      runSeed({ databaseUrl: value, createClient }),
      /SEED_DATABASE_URL/,
    );
  }
  await assert.rejects(
    runSeed({ databaseUrl, environment: "production", createClient }),
    /development/,
  );
  await assert.rejects(
    runSeed({ databaseUrl: databaseUrl.replace("5432", "6543"), createClient }),
    /session-pooler/,
  );
});

test("runs the exact seed file in simple-query mode and closes the connection", async () => {
  const events = [];
  await runSeed({
    databaseUrl,
    environment: "test",
    createClient: (value, options) => {
      assert.equal(value, databaseUrl);
      assert.equal(options.max, 1);
      assert.equal(options.ssl.rejectUnauthorized, true);
      return {
        unsafe(source) {
          assert.equal(
            source,
            readFileSync(
              new URL("../scripts/seedReservations.sql", import.meta.url),
              "utf8",
            ),
          );
          return {
            async simple() {
              events.push("execute");
            },
          };
        },
        async end() {
          events.push("close");
        },
      };
    },
  });
  assert.deepEqual(events, ["execute", "close"]);
});

test("database failures propagate and the connection still closes", async () => {
  let closed = false;
  const failure = new Error("simulated SQL failure");
  await assert.rejects(
    runSeed({
      databaseUrl,
      environment: "test",
      createClient: () => ({
        unsafe() {
          return {
            async simple() {
              throw failure;
            },
          };
        },
        async end() {
          closed = true;
        },
      }),
    }),
    error => error === failure,
  );
  assert.equal(closed, true);
});
