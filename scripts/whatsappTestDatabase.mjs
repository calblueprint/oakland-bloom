import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv, promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const root = fileURLToPath(new URL("../", import.meta.url));
const workdir = resolve(root, ".local/whatsapp-agent/test-db");
const envPath = resolve(root, ".env.whatsapp-test.local");
const run = promisify(execFile);
const options = { auth: { persistSession: false, autoRefreshToken: false } };

/** Refuses every hosted URL, including the shared Oakland Bloom project. */
export function assertLocalTestSettings(apiUrl, databaseUrl) {
  const api = new URL(apiUrl);
  const db = new URL(databaseUrl);
  assert.ok(
    ["127.0.0.1", "localhost"].includes(api.hostname) &&
      api.protocol === "http:" &&
      api.port === "55321",
    "Test API must be localhost:55321.",
  );
  assert.ok(
    ["127.0.0.1", "localhost"].includes(db.hostname) &&
      ["postgres:", "postgresql:"].includes(db.protocol) &&
      db.port === "55322",
    "Test database must be localhost:55322.",
  );
}

/** Captures CLI output privately because Supabase prints local server credentials. */
async function cli(args, logName) {
  if (!process.env.npm_execpath) throw new Error("Run pnpm db:test.");
  try {
    const result = await run(
      process.execPath,
      [
        process.env.npm_execpath,
        "dlx",
        "supabase@2.121.0",
        "--workdir",
        workdir,
        ...args,
      ],
      { cwd: root, timeout: 600_000, maxBuffer: 16 * 1024 * 1024 },
    );
    await writeFile(
      resolve(workdir, "logs", logName),
      result.stdout + result.stderr,
      { mode: 0o600 },
    );
    await chmod(resolve(workdir, "logs", logName), 0o600);
    return result.stdout;
  } catch (error) {
    await writeFile(
      resolve(workdir, "logs", logName),
      String(error.stdout ?? "") + String(error.stderr ?? ""),
      { mode: 0o600 },
    );
    await chmod(resolve(workdir, "logs", logName), 0o600);
    throw new Error(`Local Supabase command failed; see ${logName}.`);
  }
}

/** Starts a separately named local stack on its own ports, without linking any cloud project. */
async function startDatabase() {
  await mkdir(resolve(workdir, "logs"), { recursive: true, mode: 0o700 });
  const configPath = resolve(workdir, "supabase/config.toml");
  if (!existsSync(configPath)) {
    await cli(["init"], "init.log");
    let config = await readFile(configPath, "utf8");
    config = config
      .replace(/^project_id = .*$/m, 'project_id = "oakland-bloom-test"')
      .replace(/\b543(\d{2})\b/g, "553$1");
    for (const section of [
      "analytics",
      "edge_runtime",
      "realtime",
      "storage",
    ]) {
      config = config.replace(
        new RegExp(`(\\[${section}\\][\\s\\S]*?enabled = )true`),
        "$1false",
      );
    }
    await writeFile(configPath, config, { mode: 0o600 });
  }
  const config = await readFile(configPath, "utf8");
  assert.match(
    config,
    /^project_id = "oakland-bloom-test"$/m,
    "Unexpected local project; left unchanged.",
  );
  await cli(
    [
      "start",
      "--exclude",
      "imgproxy,storage-api,edge-runtime,logflare,vector,supavisor,realtime",
    ],
    "start.log",
  );
  const status = JSON.parse(await cli(["status", "-o", "json"], "status.log"));
  assertLocalTestSettings(status.API_URL, status.DB_URL);
  return status;
}

/** Applies the fixture baseline and WhatsApp migrations once, without replaying web onboarding. */
async function applySchema(sql) {
  const names = (await readdir(resolve(root, "supabase/migrations")))
    .filter(name => /^\d+_whatsapp_.*\.sql$/.test(name))
    .sort();
  const files = [
    "supabase/test-schema.sql",
    ...names.map(name => `supabase/migrations/${name}`),
  ];
  await sql.begin(async tx => {
    await tx`select set_config('oakland_bloom.synthetic_test','on',true)`;
    await tx`create schema if not exists whatsapp_test`;
    await tx`create table if not exists whatsapp_test.migrations (name text primary key, checksum text not null)`;
    for (const name of files) {
      const source = await readFile(resolve(root, name), "utf8");
      const checksum = createHash("sha256").update(source).digest("hex");
      const [previous] =
        await tx`select checksum from whatsapp_test.migrations where name=${name}`;
      if (previous) {
        assert.equal(
          previous.checksum,
          checksum,
          `Previously applied test migration changed: ${name}`,
        );
        continue;
      }
      await tx.unsafe(source).simple();
      await tx`insert into whatsapp_test.migrations(name,checksum) values(${name},${checksum})`;
    }
    await tx
      .unsafe(
        "grant usage, select on all sequences in schema public to service_role; grant select, insert, update, delete on all tables in schema public to service_role; notify pgrst, 'reload schema';",
      )
      .simple();
  });
}

/** Adds only missing fixture rows, preserving any interest responses or chat history from testing. */
async function insertMissing(db, table, rows, key) {
  const result = await db
    .from(table)
    .upsert(rows, { onConflict: key, ignoreDuplicates: true });
  if (result.error)
    throw new Error(
      `Synthetic ${table} fixtures failed (${result.error.code}).`,
    );
}

/** Creates fictional login accounts; passwords remain in the ignored local test configuration. */
async function createAccounts(db, previous) {
  const list = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (list.error) throw new Error("Local Auth is unavailable.");
  const accounts = [];
  for (const [label, name, email, phone, admin] of [
    [
      "CHEF_A",
      "Test Chef A",
      "chef-a@example.test",
      process.env.WHATSAPP_TEST_RECIPIENT || "15555550101",
      false,
    ],
    ["CHEF_B", "Test Chef B", "chef-b@example.test", "15555550102", false],
    ["ADMIN", "Test Administrator", "admin@example.test", "15555550103", true],
  ]) {
    const password =
      previous[`TEST_${label}_PASSWORD`] || randomBytes(24).toString("hex");
    let user = list.data.users.find(item => item.email === email);
    if (!user) {
      const created = await db.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (created.error)
        throw new Error("Synthetic Auth account creation failed.");
      user = created.data.user;
    }
    accounts.push({ label, name, email, phone, admin, password, id: user.id });
  }
  assert.equal(
    new Set(accounts.map(account => account.phone)).size,
    3,
    "Test phone numbers must be distinct.",
  );
  return accounts;
}

/** Populates the actual product tables with open, missing-detail, closed, accepted and private examples. */
async function seedFixtures(db, accounts) {
  const [a, b] = accounts;
  const id = (group, number) =>
    `${group}0000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
  const date = (days, hour = 20) => {
    const value = new Date(Date.now() + days * 86_400_000);
    value.setUTCHours(hour, 0, 0, 0);
    return value.toISOString();
  };
  await insertMissing(
    db,
    "users",
    accounts.map(item => ({
      userid: item.id,
      name: item.name,
      email: item.email,
      phone: item.phone,
      is_admin: item.admin,
      is_approved: true,
    })),
    "userid",
  );
  await insertMissing(
    db,
    "restaurants",
    [a, b].map((item, index) => ({
      id: id(4, index + 1),
      userid: item.id,
      name: `TEST — Fictional Kitchen ${index + 1}`,
      address: "Fictional test address, Oakland",
      cuisine: "Synthetic example",
    })),
    "id",
  );
  await insertMissing(
    db,
    "whatsapp_user",
    [a, b].map(item => ({
      chef_id: item.id,
      user_id: item.id,
      name: item.name,
      phone: item.phone,
    })),
    "chef_id",
  );
  const requests = [
    [101, a, "Community lunch", 25, 2, "open", false, "unanswered"],
    [102, a, "Vegetarian dinner", 40, 4, "open", false, "unanswered"],
    [
      103,
      a,
      "Request missing event details",
      0,
      null,
      "open",
      false,
      "unknown",
    ],
    [104, a, "Closed picnic", 20, -7, "closed", false, "declined"],
    [105, a, "Already accepted brunch", 15, 6, "open", true, "interested"],
    [201, b, "Chef B private event", 60, 3, "open", false, "unanswered"],
  ];
  await insertMissing(
    db,
    "whatsapp_catering",
    requests.map(
      ([number, chef, title, people, days, status, accepted, response]) => ({
        catering_id: id(2, number),
        chef: chef.id,
        ref_code: `OB${number}`,
        meal_name: `TEST — ${title}`,
        num_people: people,
        day_created: new Date().toISOString(),
        event_at:
          days === null
            ? null
            : date(
                days,
                title.includes("dinner")
                  ? 2
                  : title.includes("brunch")
                    ? 18
                    : 20,
              ),
        location: days === null ? null : "Fictional Oakland test venue",
        details: "Synthetic data only. No real event or booking.",
        request_status: status,
        is_accepted: accepted,
        response_status: response,
      }),
    ),
    "catering_id",
  );
  await insertMissing(
    db,
    "past_items",
    [
      {
        meal_id: id(5, 1),
        chef_id: a.id,
        name: "TEST — Vegetable rice bowl",
        price: 12,
      },
      {
        meal_id: id(5, 2),
        chef_id: a.id,
        name: "TEST — Lentil soup",
        price: 9,
      },
      {
        meal_id: id(5, 3),
        chef_id: b.id,
        name: "TEST — Private menu item",
        price: 15,
      },
    ],
    "meal_id",
  );
  await insertMissing(
    db,
    "booking_event",
    [
      [1, a, "Oven", 1, "approved"],
      [2, a, "Bar Prep Table", 2, "pending"],
      [3, a, "Salad Bar Prep Table", -3, "denied"],
      [4, b, "Oven", 3, "approved"],
    ].map(([number, chef, amenity, days, status]) => ({
      id: id(3, number),
      user: chef.id,
      amenity,
      start_time: date(days),
      end_time: new Date(Date.parse(date(days)) + 3_600_000).toISOString(),
      num_people: 3,
      has_conflicts: [],
      approval_status: status,
    })),
    "id",
  );
}

/** Checks authentication, user isolation, and the actual canonical chef binding. */
async function verifyDatabase(db, apiUrl, publicKey, accounts) {
  const [a, b] = accounts;
  for (const account of [a, b]) {
    const browser = createClient(apiUrl, publicKey, options);
    const login = await browser.auth.signInWithPassword({
      email: account.email,
      password: account.password,
    });
    assert.equal(login.error, null, "Synthetic login failed.");
    const own = await browser.from("users").select("userid");
    assert.equal(own.error, null);
    assert.deepEqual(
      own.data.map(item => item.userid),
      [account.id],
    );
    const hidden = await browser
      .from("whatsapp_catering")
      .select("catering_id");
    assert.ok(
      hidden.error || hidden.data.length === 0,
      "Browser can read server-only catering records.",
    );
    const chef = await db.rpc("resolve_wa_chef", {
      sender_phone: account.phone,
    });
    assert.equal(chef.error, null);
    assert.ok(chef.data);
    await browser.auth.signOut();
  }
}

/** Starts Next.js with the isolated database settings, without rewriting the shared environment. */
async function startTestApp(status) {
  const settings = parseEnv(await readFile(envPath, "utf8"));
  assertLocalTestSettings(settings.NEXT_PUBLIC_SUPABASE_URL, status.DB_URL);
  const child = spawn(
    process.execPath,
    [
      resolve(root, "node_modules/next/dist/bin/next"),
      "dev",
      "--hostname",
      "127.0.0.1",
    ],
    {
      cwd: root,
      env: { ...process.env, ...settings },
      stdio: "inherit",
    },
  );
  const stop = () => child.kill("SIGINT");
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  try {
    await new Promise((resolve, reject) => {
      child.once("error", () =>
        reject(new Error("Unable to start the local test app.")),
      );
      child.once("exit", (code, signal) =>
        code === 0 || signal
          ? resolve()
          : reject(new Error("Local test app exited with an error.")),
      );
    });
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
}

/** Starts and seeds only the isolated local project; repeated runs keep test conversation data. */
export async function main() {
  if (process.argv.slice(2).some(arg => arg !== "--app"))
    throw new Error("Usage: pnpm db:test [--app]");
  const status = await startDatabase();
  const publicKey = status.PUBLISHABLE_KEY || status.ANON_KEY;
  const serverKey = status.SECRET_KEY || status.SERVICE_ROLE_KEY;
  assert.ok(publicKey && serverKey, "Local API keys missing.");
  const sql = postgres(status.DB_URL, {
    max: 1,
    ssl: false,
    onnotice: () => {},
  });
  try {
    await applySchema(sql);
    const db = createClient(status.API_URL, serverKey, options);
    for (let attempt = 0; attempt < 40; attempt++) {
      const ready = await db.from("users").select("userid", { head: true });
      if (!ready.error) break;
      if (attempt === 39) throw new Error("Local REST schema did not reload.");
      await setTimeout(250);
    }
    const previous = existsSync(envPath)
      ? parseEnv(await readFile(envPath, "utf8"))
      : {};
    const accounts = await createAccounts(db, previous);
    await seedFixtures(db, accounts);
    await sql`select setval('public.whatsapp_catering_reference_seq', (select max(substring(ref_code from 3)::bigint) from public.whatsapp_catering), true)`;
    const settings = {
      NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey,
      SUPABASE_SECRET_KEY: serverKey,
      WHATSAPP_SYNTHETIC_DATABASE: "1",
      WHATSAPP_TEST_RECIPIENT: accounts[0].phone,
    };
    for (const account of accounts) {
      settings[`TEST_${account.label}_EMAIL`] = account.email;
      settings[`TEST_${account.label}_PASSWORD`] = account.password;
    }
    await writeFile(
      envPath,
      Object.entries(settings)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join("\n") + "\n",
      { mode: 0o600 },
    );
    await chmod(envPath, 0o600);
    await verifyDatabase(db, status.API_URL, publicKey, accounts);
    for (const file of [
      "whatsappReplies.sql",
      "whatsappCateringIntegration.sql",
      "whatsappCapabilities.sql",
      "whatsappKitchen.sql",
    ]) {
      await sql
        .unsafe(await readFile(resolve(root, "tests", file), "utf8"))
        .simple();
    }
    console.log(
      "Synthetic test database ready: 3 accounts, 2 businesses, 6 catering requests, 4 kitchen bookings and 3 menu items.",
    );
    console.log("Local database browser: http://127.0.0.1:55323");
    console.log(
      "Login details saved in ignored .env.whatsapp-test.local. Shared project settings unchanged.",
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
  if (process.argv.includes("--app")) await startTestApp(status);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
