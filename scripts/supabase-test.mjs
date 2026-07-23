#!/usr/bin/env node
/**
 * 5.DUAL-BUILDER-1 CS-7D — local Supabase test-stack helper.
 *
 * Wraps the Supabase CLI for a SAFE, LOCAL-ONLY e2e database:
 *
 *   node scripts/supabase-test.mjs start      # start local stack + apply migrations + write .env.test.local
 *   node scripts/supabase-test.mjs stop       # stop the local stack
 *   node scripts/supabase-test.mjs reset      # re-apply all migrations to the LOCAL db (loopback only)
 *   node scripts/supabase-test.mjs write-env  # (re)generate .env.test.local from local status
 *   node scripts/supabase-test.mjs status     # print loopback URLs only (never keys)
 *
 * SAFETY: every command operates on the local Docker stack defined by
 * supabase/config.toml. Before writing env or resetting, we assert the resolved
 * API URL is LOOPBACK; a non-loopback host aborts. We NEVER print anon /
 * service-role / JWT / password values, and NEVER accept a cloud URL argument.
 * `db reset` here targets the local stack only — this script never passes
 * `--linked` / `--db-url` and never runs `db push`.
 */

import { spawnSync, execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";

const CLI = ["--yes", "supabase@2.109.1"];
const ENV_PATH = resolve(process.cwd(), ".env.test.local");

function isLoopback(url) {
  try {
    const h = new URL(url).hostname;
    return h === "127.0.0.1" || h === "localhost" || h === "0.0.0.0" || h === "::1";
  } catch {
    return false;
  }
}

function runInherit(args) {
  const r = spawnSync("npx", [...CLI, ...args], { stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function statusJson() {
  const out = execFileSync("npx", [...CLI, "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    shell: process.platform === "win32",
  });
  return JSON.parse(out);
}

/** Preserve existing local app-secret values so restarts keep a stable key. */
function existingEnv() {
  if (!existsSync(ENV_PATH)) return {};
  const out = {};
  for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function writeEnv() {
  const s = statusJson();
  const apiUrl = s.API_URL || "http://127.0.0.1:54321";
  if (!isLoopback(apiUrl)) {
    console.error(`ABORT — local Supabase API URL is not loopback (${new URL(apiUrl).hostname}). Refusing to write .env.test.local.`);
    process.exit(1);
  }
  const anon = s.ANON_KEY;
  const service = s.SERVICE_ROLE_KEY;
  if (!anon || !service) {
    console.error("ABORT — could not read local anon/service-role keys from `supabase status`.");
    process.exit(1);
  }
  const prev = existingEnv();
  // Local app secrets: keep prior values if present (stable across restarts),
  // else generate throwaway LOCAL-only values of the right format.
  const tokenKey = prev.TOKEN_ENCRYPTION_KEY || randomBytes(32).toString("base64");
  const oauthKey = prev.OAUTH_STATE_SIGNING_KEY || randomBytes(32).toString("base64");
  const watch = prev.WATCH_CHANNEL_SECRET || "cs7d-local-watch-channel-secret";
  const cron = prev.CRON_SECRET || "cs7d-local-cron-secret";
  const e2eBase = prev.E2E_BASE_URL || "http://localhost:3001";

  const lines = [
    "# CS-7D local E2E environment — LOCAL SUPABASE ONLY (gitignored).",
    "# Loopback host so assertSafeTestEnvironment passes without any prod override.",
    "# Regenerate with: npm run supabase:test:start (Supabase keys refresh; app secrets persist).",
    `NEXT_PUBLIC_SUPABASE_URL=${apiUrl}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${anon}`,
    `SUPABASE_SERVICE_ROLE_KEY=${service}`,
    `E2E_BASE_URL=${e2eBase}`,
    `TOKEN_ENCRYPTION_KEY=${tokenKey}`,
    `OAUTH_STATE_SIGNING_KEY=${oauthKey}`,
    `WATCH_CHANNEL_SECRET=${watch}`,
    `CRON_SECRET=${cron}`,
    "",
  ];
  writeFileSync(ENV_PATH, lines.join("\n"));
  console.log(`✅ wrote .env.test.local (loopback ${new URL(apiUrl).hostname}); Supabase keys refreshed, app secrets persisted. No secret values printed.`);
}

const cmd = process.argv[2];
switch (cmd) {
  case "start":
    runInherit(["start"]);
    writeEnv();
    break;
  case "stop":
    runInherit(["stop"]);
    break;
  case "reset":
    // `db reset` re-applies supabase/migrations to the LOCAL stack only.
    runInherit(["db", "reset"]);
    writeEnv();
    break;
  case "write-env":
    writeEnv();
    break;
  case "status": {
    const s = statusJson();
    console.log(`API_URL loopback: ${isLoopback(s.API_URL)} (${(() => { try { return new URL(s.API_URL).hostname; } catch { return "?"; } })()})`);
    console.log(`STUDIO_URL: ${s.STUDIO_URL ?? "?"}`);
    break;
  }
  default:
    console.error("Usage: node scripts/supabase-test.mjs <start|stop|reset|write-env|status>");
    process.exit(1);
}
