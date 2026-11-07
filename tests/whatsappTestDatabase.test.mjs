import assert from "node:assert/strict";
import { test } from "node:test";
import { assertLocalTestSettings } from "../scripts/whatsappTestDatabase.mjs";

test("synthetic setup accepts only the isolated local Supabase addresses", () => {
  assert.doesNotThrow(() =>
    assertLocalTestSettings(
      "http://127.0.0.1:55321",
      "postgresql://postgres@127.0.0.1:55322/postgres",
    ),
  );
  for (const [api, db] of [
    [
      "https://shared-project.supabase.co",
      "postgresql://postgres@127.0.0.1:55322/postgres",
    ],
    [
      "http://127.0.0.1:55321",
      "postgresql://postgres@db.shared-project.supabase.co:55322/postgres",
    ],
    [
      "http://127.0.0.1:54321",
      "postgresql://postgres@127.0.0.1:55322/postgres",
    ],
    [
      "http://127.0.0.1:55321",
      "postgresql://postgres@127.0.0.1:54322/postgres",
    ],
  ])
    assert.throws(() => assertLocalTestSettings(api, db));
});
