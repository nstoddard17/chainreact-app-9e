#!/usr/bin/env node
/**
 * SUPABASE-ENV-PIPELINE-1 — DESTRUCTIVE reset of the hosted DEVELOPMENT database.
 *
 * Drops and rebuilds the dev project's schema from supabase/migrations + seed.
 * NEVER usable against production — guards, in order:
 *
 *   1. CHAINREACT_DB_TARGET=development must be set explicitly.
 *   2. SUPABASE_DEV_PROJECT_REF must be a valid ref outside the protected set
 *      (production + V1 + unidentified refs are denylisted by constant).
 *   3. SUPABASE_DEV_DB_URL must parse to the SAME ref.
 *   4. DEV_RESET_CONFIRM must equal the dev ref — retyping the ref is the
 *      "I know which database I am destroying" step.
 *
 * Usage:
 *   CHAINREACT_DB_TARGET=development DEV_RESET_CONFIRM=<devref> npm run dev:reset
 *
 * Local stack resets DO NOT use this script — use `npm run supabase:test:reset`.
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { loadEnvFile } from "./lib/db-target.mjs";
import { resolveDbTarget } from "./lib/env-target.mjs";

const fileEnvPath = resolve(process.cwd(), ".env.development.local");
// CHAINREACT_ENV_FILE=none skips the gitignored env file — used by the guard
// tests to stay hermetic on machines where real dev credentials exist.
const fileEnv =
  process.env.CHAINREACT_ENV_FILE !== "none" && existsSync(fileEnvPath)
    ? loadEnvFile(readFileSync, fileEnvPath)
    : {};
const env = { ...fileEnv, ...process.env };

const guard = resolveDbTarget(env, { expectedTarget: "development", requireConfirm: true });
if (!guard.ok) {
  console.error(`ABORT — env-target guard: ${guard.reason}`);
  process.exit(1);
}
const dbUrl = env.SUPABASE_DEV_DB_URL;
if (!dbUrl) {
  console.error("ABORT — SUPABASE_DEV_DB_URL is not set.");
  process.exit(1);
}

console.log(`Env-target guard OK — resetting DEVELOPMENT project: ${guard.ref}`);
console.log("This rebuilds the dev schema from supabase/migrations and re-seeds supabase/seed.sql.");

const cmd = `echo y | npx supabase db reset --db-url ${JSON.stringify(dbUrl)}`;
const result = spawnSync(cmd, { stdio: "inherit", shell: true });
process.exit(result.status ?? 1);
