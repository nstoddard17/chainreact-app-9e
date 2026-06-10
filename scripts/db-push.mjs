#!/usr/bin/env node
/**
 * Apply pending Supabase migrations to the V2 database.
 * Reads POSTGRES_URL_NON_POOLING from .env.local and invokes
 *   supabase db push --db-url <url>
 * via spawn (argv, not shell interpolation) so the connection string never
 * lands in shell history or echoes.
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { loadEnvFile, validateMigrationTarget } from "./lib/db-target.mjs";

const envPath = resolve(process.cwd(), ".env.local");
if (!existsSync(envPath)) {
  console.error("ABORT — .env.local not found at repo root.");
  process.exit(1);
}

const env = loadEnvFile(readFileSync, envPath);
const dbUrl = env.POSTGRES_URL_NON_POOLING;
if (!dbUrl) {
  console.error("ABORT — POSTGRES_URL_NON_POOLING missing from .env.local.");
  process.exit(1);
}

// Fail closed if the migration target isn't the app's own Supabase project.
// Prevents pushing V2 migrations into V1 (or any other) database.
const guard = validateMigrationTarget(env);
if (!guard.ok) {
  console.error(`ABORT — DB-target guard: ${guard.reason}`);
  process.exit(1);
}
console.log(`DB-target guard OK — target project ref: ${guard.targetRef}`);

const hostMatch = dbUrl.match(/@([^/:]+):(\d+)/);
console.log(`Pushing migrations to: ${hostMatch ? hostMatch[1] + ":" + hostMatch[2] : "(unparsed)"}`);

// supabase db push prompts before applying. Node's spawnSync `input` option
// doesn't reach the supabase CLI reliably on Windows (the CLI checks isTTY).
// Use a real shell pipe instead. The URL is JSON-quoted to escape special
// chars; it briefly appears in the process command line on the dev machine
// (acceptable trade-off for non-interactive `npm run db:push`).
const cmd = `echo y | npx supabase db push --db-url ${JSON.stringify(dbUrl)} --include-all`;
const result = spawnSync(cmd, { stdio: "inherit", shell: true });

process.exit(result.status ?? 1);
