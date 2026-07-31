#!/usr/bin/env node
/**
 * SUPABASE-ENV-PIPELINE-1 — apply pending migrations to the DEVELOPMENT project.
 *
 *   CHAINREACT_DB_TARGET=development npm run db:push:dev            # dry-run + apply
 *   CHAINREACT_DB_TARGET=development npm run db:push:dev -- --dry-run-only
 *
 * Guards (all fail closed, see scripts/lib/env-target.mjs):
 *   - CHAINREACT_DB_TARGET must be exactly "development".
 *   - SUPABASE_DEV_PROJECT_REF must be set, valid, and NOT the production/V1 ref.
 *   - SUPABASE_DEV_DB_URL must parse to the SAME ref.
 * Config comes from process env first, then .env.development.local (gitignored).
 * Only the project ref and host:port are ever printed — never the URL or keys.
 * This script NEVER runs against production: the prod ref is denylisted.
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { loadEnvFile } from "./lib/db-target.mjs";
import { resolveDbTarget } from "./lib/env-target.mjs";

const fileEnvPath = resolve(process.cwd(), ".env.development.local");
const fileEnv = existsSync(fileEnvPath) ? loadEnvFile(readFileSync, fileEnvPath) : {};
// Process env wins so CI can inject secrets without a file on disk.
const env = { ...fileEnv, ...process.env };

const guard = resolveDbTarget(env, { expectedTarget: "development" });
if (!guard.ok) {
  console.error(`ABORT — env-target guard: ${guard.reason}`);
  process.exit(1);
}

const dbUrl = env.SUPABASE_DEV_DB_URL;
if (!dbUrl) {
  console.error("ABORT — SUPABASE_DEV_DB_URL is not set (process env or .env.development.local).");
  process.exit(1);
}
console.log(`Env-target guard OK — DEVELOPMENT project ref: ${guard.ref}`);
const hostMatch = dbUrl.match(/@([^/:]+):(\d+)/);
console.log(`Target host: ${hostMatch ? hostMatch[1] + ":" + hostMatch[2] : "(unparsed)"}`);

function run(args, { pipeYes = false } = {}) {
  // Same Windows-TTY workaround as scripts/db-push.mjs: the CLI's confirm
  // prompt needs a real shell pipe. URL is JSON-quoted; it transiently appears
  // in the local process command line (accepted local-dev tradeoff).
  const cmd = `${pipeYes ? "echo y | " : ""}npx supabase ${args.join(" ")}`;
  return spawnSync(cmd, { stdio: "inherit", shell: true }).status ?? 1;
}

console.log("\n— migration dry-run (no changes) —");
const dry = run(["db", "push", "--db-url", JSON.stringify(dbUrl), "--include-all", "--dry-run"]);
if (dry !== 0) {
  console.error("ABORT — dry-run failed; nothing was applied.");
  process.exit(dry);
}

if (process.argv.includes("--dry-run-only")) {
  console.log("Dry-run only — done.");
  process.exit(0);
}

console.log("\n— applying pending migrations to development —");
process.exit(run(["db", "push", "--db-url", JSON.stringify(dbUrl), "--include-all"], { pipeYes: true }));
