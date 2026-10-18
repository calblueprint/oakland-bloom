import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import postgres from "postgres";

const seedFile = new URL("./seedReservations.sql", import.meta.url);
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const supabaseCaFile = new URL(
  "./certs/supabase-prod-ca-2021.crt",
  import.meta.url,
);

export async function runSeed({
  databaseUrl = process.env.SEED_DATABASE_URL,
  environment = process.env.NODE_ENV,
  caFile = process.env.SEED_DATABASE_CA_FILE,
  createClient = postgres,
} = {}) {
  if (environment === "production") {
    throw new Error("Run reservation seeding against a development database.");
  }
  if (!databaseUrl?.trim()) {
    throw new Error(
      "Set SEED_DATABASE_URL in .env.local to your development database connection string.",
    );
  }
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error(
      "SEED_DATABASE_URL must be a PostgreSQL connection string.",
    );
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    !url.username
  ) {
    throw new Error(
      "SEED_DATABASE_URL must be a PostgreSQL connection string.",
    );
  }
  if (url.port === "6543") {
    throw new Error(
      "Use the direct or session-pooler connection on port 5432, not the transaction pooler on 6543.",
    );
  }

  const source = readFileSync(seedFile, "utf8");
  const isSupabaseHost =
    url.hostname.endsWith(".pooler.supabase.com") ||
    /^db\.[a-z0-9]+\.supabase\.co$/.test(url.hostname);
  // This public CA is downloaded from the official Supabase dashboard's URL.
  // It is trusted only for this connection, not installed into the OS trust store.
  const ca = caFile
    ? readFileSync(resolve(projectRoot, caFile), "utf8")
    : isSupabaseHost
      ? readFileSync(supabaseCaFile, "utf8")
      : undefined;
  const client = createClient(databaseUrl, {
    max: 1,
    ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    connect_timeout: 10,
    connection: { statement_timeout: 30000, lock_timeout: 5000 },
    onnotice: () => {},
  });
  try {
    // This checked-in file is trusted SQL, never browser or command-line input.
    // Simple-query mode executes the whole file on one connection, preserving its
    // BEGIN/COMMIT, staging tables, collision checks, and all-or-nothing behavior.
    await client.unsafe(source).simple();
  } finally {
    // Also closes an aborted transaction after a database error.
    await client.end({ timeout: 5 });
  }
}

export async function main() {
  try {
    const envFile = new URL("../.env.local", import.meta.url);
    if (existsSync(envFile)) loadEnvFile(fileURLToPath(envFile));
    await runSeed();
    console.log(
      "Reservation seed complete: test user 1 = 4 reservations; test user 2 = 1 reservation. Identical fixtures were skipped.",
    );
  } catch (error) {
    // Raw driver errors may include credentials or connection details. Print only
    // known local configuration messages or a short error code, never the URL.
    if (
      error instanceof Error &&
      /^(Set SEED_DATABASE_URL|SEED_DATABASE_URL must|Use the direct|Run reservation seeding)/.test(
        error.message,
      )
    ) {
      console.error(error.message);
    } else {
      const code =
        typeof error?.code === "string" && /^[A-Z0-9_]{1,40}$/.test(error.code)
          ? ` (${error.code})`
          : "";
      console.error(
        `Reservation seed failed${code}. Check database credentials, network access, TLS trust, and SQL constraints. No success was confirmed.`,
      );
    }
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
