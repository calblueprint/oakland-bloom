import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { loadEnvFile } from "node:process";

const envFile = new URL("../.env.local", import.meta.url);
if (existsSync(envFile)) loadEnvFile(envFile);
if (!process.env.SEED_DATABASE_URL || !process.env.npm_execpath) {
  console.error(
    "Run pnpm types:database with SEED_DATABASE_URL configured in .env.local.",
  );
  process.exitCode = 1;
} else {
  const result = spawnSync(
    process.execPath,
    [
      process.env.npm_execpath,
      "dlx",
      "supabase@2.121.0",
      "gen",
      "types",
      "typescript",
      "--db-url",
      process.env.SEED_DATABASE_URL,
      "--schema",
      "public",
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0 || !result.stdout?.includes("export type Database")) {
    // CLI errors can include connection details; keep them out of logs.
    console.error(
      "Database type generation failed. Check database access and Supabase CLI setup. Existing types were preserved.",
    );
    process.exitCode = 1;
  } else {
    writeFileSync(
      new URL("../types/database.types.ts", import.meta.url),
      result.stdout,
    );
    console.log(
      "Generated types/database.types.ts. Run pnpm exec prettier --write types/database.types.ts.",
    );
  }
}
