import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runSeed as seed } from "../scripts/seedReservations.mjs";

const defaults = {
  target: "development",
  user1: "11111111-1111-4111-a111-111111111111",
  user2: "22222222-2222-4222-a222-222222222222",
};
function runSeed(options) {
  return seed({ ...defaults, ...options });
}
function transactionClient(unsafe) {
  return async callback => {
    const transaction = async (strings, ...values) => {
      assert.match(strings.join("?"), /set_config/);
      assert.deepEqual(values, [defaults.user1, defaults.user2]);
    };
    transaction.unsafe = unsafe;
    await callback(transaction);
  };
}

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
        begin: transactionClient(function (source) {
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
        }),
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
        begin: transactionClient(function () {
          return {
            async simple() {
              throw failure;
            },
          };
        }),
        async end() {
          closed = true;
        },
      }),
    }),
    error => error === failure,
  );
  assert.equal(closed, true);
});

test("Supabase connections use the official CA and keep certificate verification enabled", async () => {
  let checked = false;
  await runSeed({
    databaseUrl:
      "postgresql://test:secret@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
    environment: "test",
    caFile: "",
    createClient: (value, options) => {
      assert.equal(options.ssl.rejectUnauthorized, true);
      assert.equal(
        options.ssl.ca,
        readFileSync(
          new URL(
            "../scripts/certs/supabase-prod-ca-2021.crt",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      checked = true;
      return {
        begin: transactionClient(function () {
          return { async simple() {} };
        }),
        async end() {},
      };
    },
  });
  assert.equal(checked, true);
});

test("an explicit CA override is passed to the driver while verification stays enabled", async () => {
  await runSeed({
    databaseUrl,
    environment: "test",
    caFile: "scripts/certs/supabase-prod-ca-2021.crt",
    createClient: (value, options) => {
      assert.equal(options.ssl.rejectUnauthorized, true);
      assert.match(options.ssl.ca, /BEGIN CERTIFICATE/);
      return {
        begin: transactionClient(function () {
          return { async simple() {} };
        }),
        async end() {},
      };
    },
  });
});

test("a missing CA override fails before connecting", async () => {
  await assert.rejects(
    runSeed({
      databaseUrl,
      environment: "test",
      caFile: "/private/tmp/oak10-nonexistent-certificate.crt",
      createClient: () => {
        throw new Error("Must not connect");
      },
    }),
    error => error.code === "ENOENT",
  );
});

test("requires explicit development confirmation even without NODE_ENV", async () => {
  for (const target of [undefined, "", "production"]) {
    await assert.rejects(
      runSeed({
        databaseUrl,
        target,
        environment: undefined,
        createClient() {
          throw new Error("Must not connect");
        },
      }),
      /SEED_TARGET/,
    );
  }
});

test("requires distinct configurable Auth UUIDs before connecting", async () => {
  for (const values of [
    { user1: undefined },
    { user2: "bad" },
    { user2: defaults.user1 },
  ]) {
    await assert.rejects(
      runSeed({
        databaseUrl,
        ...values,
        createClient() {
          throw new Error("Must not connect");
        },
      }),
      /RESERVATION_TEST_USER/,
    );
  }
});
