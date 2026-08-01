#!/usr/bin/env node
/**
 * SUPABASE-ENV-PIPELINE-1 — apply pending migrations to the DEVELOPMENT project.
 *
 *   CHAINREACT_DB_TARGET=development npm run db:push:dev            # dry-run + apply (SUPABASE_DEV_DB_URL)
 *   CHAINREACT_DB_TARGET=development npm run db:push:dev -- --linked # dry-run + apply via the CLI's
 *                                                                    # securely stored login (no DB password)
 *   CHAINREACT_DB_TARGET=development npm run db:push:dev -- --dry-run-only
 *
 * Guards (all fail closed, see scripts/lib/env-target.mjs):
 *   - CHAINREACT_DB_TARGET must be exactly "development".
 *   - SUPABASE_DEV_PROJECT_REF must be set, valid, and NOT the production/V1 ref.
 *   - URL mode: SUPABASE_DEV_DB_URL must parse to the SAME ref.
 *   - --linked mode: supabase/.temp/project-ref (written by `supabase link`)
 *     must EQUAL the declared dev ref — a leftover link to any other project,
 *     production above all, refuses. SUPABASE_ACCESS_TOKEN is stripped from the
 *     child env so only the CLI's securely stored login is ever used.
 * Config comes from process env first, then .env.development.local (gitignored).
 * Only the project ref and host:port are ever printed — never URLs, keys, or
 * tokens. This script NEVER runs against production: the prod ref is denylisted.
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { loadEnvFile } from "./lib/db-target.mjs";
import { resolveDbTarget, validateLinkedRef } from "./lib/env-target.mjs";

const fileEnvPath = resolve(process.cwd(), ".env.development.local");
// CHAINREACT_ENV_FILE=none skips the gitignored env file — used by the guard
// tests to stay hermetic on machines where real dev credentials exist.
const fileEnv =
  process.env.CHAINREACT_ENV_FILE !== "none" && existsSync(fileEnvPath)
    ? loadEnvFile(readFileSync, fileEnvPath)
    : {};
// Process env wins so CI can inject secrets without a file on disk.
const env = { ...fileEnv, ...process.env };

const guard = resolveDbTarget(env, { expectedTarget: "development" });
if (!guard.ok) {
  console.error(`ABORT — env-target guard: ${guard.reason}`);
  process.exit(1);
}

const useLinked = process.argv.includes("--linked");
const dbUrl = env.SUPABASE_DEV_DB_URL;
let targetArgs;
if (useLinked) {
  const linkedPath = resolve(process.cwd(), "supabase", ".temp", "project-ref");
  const linkedRef = existsSync(linkedPath) ? readFileSync(linkedPath, "utf8") : null;
  const linkGuard = validateLinkedRef(linkedRef, guard.ref);
  if (!linkGuard.ok) {
    console.error(`ABORT — linked-ref guard: ${linkGuard.reason}`);
    process.exit(1);
  }
  console.log(`Env-target guard OK — DEVELOPMENT project ref: ${guard.ref} (linked)`);
  targetArgs = ["--linked"];
} else {
  if (!dbUrl) {
    console.error(
      "ABORT — SUPABASE_DEV_DB_URL is not set (process env or .env.development.local). For the stored-login flow, link first and pass --linked.",
    );
    process.exit(1);
  }
  console.log(`Env-target guard OK — DEVELOPMENT project ref: ${guard.ref}`);
  const hostMatch = dbUrl.match(/@([^/:]+):(\d+)/);
  console.log(`Target host: ${hostMatch ? hostMatch[1] + ":" + hostMatch[2] : "(unparsed)"}`);
  targetArgs = ["--db-url", JSON.stringify(dbUrl)];
}

function run(args, { pipeYes = false } = {}) {
  // Same Windows-TTY workaround as scripts/db-push.mjs: the CLI's confirm
  // prompt needs a real shell pipe. In URL mode the JSON-quoted URL transiently
  // appears in the local process command line (accepted local-dev tradeoff);
  // linked mode has no secret material in argv at all.
  const cmd = `${pipeYes ? "echo y | " : ""}npx supabase ${args.join(" ")}`;
  // Only the CLI's securely stored login — never a machine env token.
  const childEnv = { ...process.env };
  delete childEnv.SUPABASE_ACCESS_TOKEN;
  return spawnSync(cmd, { stdio: "inherit", shell: true, env: childEnv }).status ?? 1;
}

console.log("\n— migration dry-run (no changes) —");
const dry = run(["db", "push", ...targetArgs, "--include-all", "--dry-run"]);
if (dry !== 0) {
  console.error("ABORT — dry-run failed; nothing was applied.");
  process.exit(dry);
}

if (process.argv.includes("--dry-run-only")) {
  console.log("Dry-run only — done.");
  process.exit(0);
}

console.log("\n— applying pending migrations to development —");
process.exit(run(["db", "push", ...targetArgs, "--include-all"], { pipeYes: true }));
