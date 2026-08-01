#!/usr/bin/env node
/**
 * SUPABASE-HOSTED-DEV-AUTH-CERT-1 — run the local Next dev server against the
 * hosted DEVELOPMENT Supabase project (chainreact-dev).
 *
 *   npm run dev:devdb
 *
 * Reads .env.development.local (gitignored) and overrides ONLY the Supabase
 * trio for the child process — .env.local stays untouched and keeps its
 * normal role for every other variable. Fail-closed:
 *   - .env.development.local must exist and declare a dev ref,
 *   - the ref must NOT be production/V1 (denylist in scripts/lib/env-target.mjs),
 *   - SUPABASE_DEV_URL must match the declared ref,
 *   - SUPABASE_ACCESS_TOKEN is stripped from the child env.
 * Prints the project ref only — never keys.
 */
import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { loadEnvFile } from "./lib/db-target.mjs";
import { resolveDbTarget } from "./lib/env-target.mjs";

const fileEnvPath = resolve(process.cwd(), ".env.development.local");
if (!existsSync(fileEnvPath)) {
  console.error("ABORT — .env.development.local not found (see docs/runbooks/supabase-environments.md).");
  process.exit(1);
}
const fileEnv = loadEnvFile(readFileSync, fileEnvPath);
const env = { ...fileEnv, ...process.env, CHAINREACT_DB_TARGET: "development" };

const guard = resolveDbTarget(env, { expectedTarget: "development" });
if (!guard.ok) {
  console.error(`ABORT — env-target guard: ${guard.reason}`);
  process.exit(1);
}
if (!fileEnv.SUPABASE_DEV_URL || !fileEnv.SUPABASE_DEV_ANON_KEY || !fileEnv.SUPABASE_DEV_SERVICE_ROLE_KEY) {
  console.error("ABORT — SUPABASE_DEV_URL / SUPABASE_DEV_ANON_KEY / SUPABASE_DEV_SERVICE_ROLE_KEY missing from .env.development.local.");
  process.exit(1);
}

console.log(`Starting next dev against DEVELOPMENT project: ${guard.ref}`);
console.log("Supabase trio overridden; all other env comes from .env.local as usual. No keys printed.");

const childEnv = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: fileEnv.SUPABASE_DEV_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: fileEnv.SUPABASE_DEV_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: fileEnv.SUPABASE_DEV_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
};
delete childEnv.SUPABASE_ACCESS_TOKEN;
delete childEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY; // dev posture: widget hidden

const child = spawn("npm", ["run", "dev"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: childEnv,
});
child.on("exit", (code) => process.exit(code ?? 0));
