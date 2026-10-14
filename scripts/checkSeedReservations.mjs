// Read-only development integration check; identities below are synthetic fixtures,
// not authenticated visitors. Does not create sessions or modify access policies.
import "./registerServerTypes.mjs";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

const envFile = new URL("../.env.local", import.meta.url);
if (existsSync(envFile)) loadEnvFile(fileURLToPath(envFile));

const userPrefix = "0a100000-0000-4000-8000-";
const bookingPrefix = "0a100000-0000-4000-9000-";
const fields = [
  "id",
  "amenity",
  "start_time",
  "end_time",
  "num_people",
  "approval_status",
].sort();
const expectedA = [
  [4, "approved", 2, "2020-06-10T16:00:00Z", "2020-06-10T17:00:00Z"],
  [1, "pending", 2, "2030-06-10T16:00:00Z", "2030-06-10T17:00:00Z"],
  [3, "denied", 3, "2030-06-10T16:00:00Z", "2030-06-10T17:00:00Z"],
  [2, "approved", 4, "2030-06-11T16:00:00Z", "2030-06-11T18:00:00Z"],
];
const expectedB = [
  [5, "approved", 2, "2030-06-12T16:00:00Z", "2030-06-12T17:00:00Z"],
];

try {
  const { default: getChefReservations } =
    await import("../actions/supabase/queries/getChefReservations.ts");
  for (const [chef, suffix, expected] of [
    ["A", 1, expectedA],
    ["B", 2, expectedB],
    ["C", 3, []],
  ]) {
    const rows = await getChefReservations({
      id: userPrefix + String(suffix).padStart(12, "0"),
    });
    console.log(
      `Chef ${chef}: ${rows.length} visible reservation(s); expected ${expected.length}.`,
    );
    assert.equal(
      rows.length,
      expected.length,
      `Chef ${chef} fixture count differs. Missing fixtures or access policies may hide rows; this client has no verified login session.`,
    );
    for (const [
      index,
      [id, status, people, start, end],
    ] of expected.entries()) {
      const row = rows[index];
      assert.deepEqual(Object.keys(row).sort(), fields);
      assert.equal(row.id, bookingPrefix + String(id).padStart(12, "0"));
      assert.equal(row.amenity, "kitchen");
      assert.equal(row.approval_status, status);
      assert.equal(row.num_people, people);
      assert.equal(Date.parse(row.start_time), Date.parse(start));
      assert.equal(Date.parse(row.end_time), Date.parse(end));
    }
  }
  console.log(
    "Live fixture reads passed: fields, owner filters, time/ID ordering, statuses, past booking, and empty result. Authentication and RLS isolation are NOT verified.",
  );
} catch (error) {
  if (error?.cause?.code && /^[A-Z0-9_]{1,40}$/.test(error.cause.code)) {
    console.error(
      `Live reservation read failed (database code ${error.cause.code}).`,
    );
  } else if (error?.cause) {
    console.error(
      "Live reservation read failed: connection or database error. No successful verification claimed.",
    );
  } else if (error instanceof assert.AssertionError) {
    console.error(
      "Live fixture verification failed: returned data did not match the seeded fixtures. Missing fixtures or access policies may hide rows; this client has no verified login session.",
    );
  } else {
    console.error(
      "Live verification could not run. Check Supabase environment variables and Node version (24.14+).",
    );
  }
  process.exitCode = 1;
}
