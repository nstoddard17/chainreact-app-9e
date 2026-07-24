/**
 * 5.DUAL-BUILDER-1 CS-7D — the single authoritative E2E test-environment loader.
 *
 * WHY: the e2e harness performs DESTRUCTIVE setup (creates/deletes real users,
 * accounts, workflows, runs) through the service-role key. It must therefore run
 * ONLY against a safe local/test database — never the production project that
 * `.env.local` points at. This loader is the one place that decides which env the
 * e2e stack sees, and it deliberately **never reads `.env.local`**.
 *
 * Precedence (highest first):
 *   1. Process environment explicitly supplied by the caller.
 *   2. `.env.test.local` (gitignored — local Supabase loopback values).
 *   3. Safe, NON-SECRET loopback defaults (URL / base URL only — never keys).
 *
 * Secrets (anon key, service-role key) have NO default: if `.env.test.local`
 * (or the caller) does not supply them, loading FAILS CLOSED with a message that
 * names the missing keys but never prints any value.
 *
 * The resulting `NEXT_PUBLIC_SUPABASE_URL` is still gated by
 * `assertSafeTestEnvironment` at the admin-client seam (CS-7C) — this loader
 * chooses the source; that guard enforces loopback/opt-in. Both must hold.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Keys the e2e stack + dev webServer need to talk to local Supabase + boot. */
export const E2E_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "E2E_BASE_URL",
  "TOKEN_ENCRYPTION_KEY",
  "OAUTH_STATE_SIGNING_KEY",
  "WATCH_CHANNEL_SECRET",
  "CRON_SECRET",
] as const;

/**
 * Keys that MUST be present for destructive e2e to be possible. Missing any of
 * these fails closed (there is no safe default for a service-role key).
 */
export const REQUIRED_E2E_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

/**
 * Safe NON-SECRET defaults — only ever loopback URLs. Applied only when neither
 * the process env nor `.env.test.local` supplies the key. There is intentionally
 * NO default for any key/secret.
 */
export const LOOPBACK_DEFAULTS: Readonly<Record<string, string>> = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  E2E_BASE_URL: "http://localhost:3001",
};

export type EnvSource = "process" | "file" | "default";

export interface ResolvedTestEnv {
  /** Merged values, one per resolved key. */
  readonly values: Readonly<Record<string, string>>;
  /** Where each resolved key came from. */
  readonly sources: Readonly<Record<string, EnvSource>>;
  /** Required keys that resolved to no value (fail-closed set). */
  readonly missing: readonly string[];
}

/** Minimal `KEY=value` parser (no dotenv dependency). Local use only. */
export function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=(.*)$/);
    if (!m) continue;
    let v = m[2]!.trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[m[1]!] = v;
  }
  return out;
}

/**
 * Pure resolution: given the process env and the parsed `.env.test.local`, decide
 * each key's value + source and which required keys are missing. No filesystem,
 * no `process.env` mutation, no secret exposure.
 */
export function resolveTestEnv(
  processEnv: Record<string, string | undefined>,
  fileEnv: Record<string, string>,
  opts: {
    keys?: readonly string[];
    required?: readonly string[];
    defaults?: Readonly<Record<string, string>>;
  } = {},
): ResolvedTestEnv {
  const keys = opts.keys ?? E2E_ENV_KEYS;
  const required = opts.required ?? REQUIRED_E2E_KEYS;
  const defaults = opts.defaults ?? LOOPBACK_DEFAULTS;

  const values: Record<string, string> = {};
  const sources: Record<string, EnvSource> = {};

  for (const key of keys) {
    const fromProcess = processEnv[key];
    if (fromProcess !== undefined && fromProcess !== "") {
      values[key] = fromProcess;
      sources[key] = "process";
      continue;
    }
    const fromFile = fileEnv[key];
    if (fromFile !== undefined && fromFile !== "") {
      values[key] = fromFile;
      sources[key] = "file";
      continue;
    }
    const fromDefault = defaults[key];
    if (fromDefault !== undefined) {
      values[key] = fromDefault;
      sources[key] = "default";
    }
  }

  const missing = required.filter((k) => values[k] === undefined);
  return { values, sources, missing };
}

/** Absolute path to `.env.test.local` at the repo/worktree root. */
export function testEnvFilePath(): string {
  return resolve(__dirname, "../../..", ".env.test.local");
}

/** Read + parse `.env.test.local` if it exists (never `.env.local`). */
export function readTestEnvFile(path = testEnvFilePath()): Record<string, string> {
  if (!existsSync(path)) return {};
  return parseEnvFile(readFileSync(path, "utf8"));
}

/**
 * Load the e2e environment into `process.env` (only for keys not already set —
 * the process env keeps precedence). Returns the resolution for logging/asserts.
 *
 * FAILS CLOSED: throws when a REQUIRED key has no value. The thrown message names
 * the missing keys only — it never contains any value/secret.
 */
export function loadTestEnv(
  opts: { processEnv?: Record<string, string | undefined>; filePath?: string } = {},
): ResolvedTestEnv {
  const processEnv = opts.processEnv ?? process.env;
  const fileEnv = readTestEnvFile(opts.filePath);
  const resolved = resolveTestEnv(processEnv, fileEnv);

  if (resolved.missing.length > 0) {
    throw new Error(
      `[e2e env] Missing required test-environment variable(s): ${resolved.missing.join(
        ", ",
      )}. Set them in .env.test.local (loopback local Supabase) — this loader never ` +
        `reads .env.local. Run \`npm run supabase:test:start\` to bring up local Supabase ` +
        `and regenerate .env.test.local.`,
    );
  }

  for (const [key, value] of Object.entries(resolved.values)) {
    // Never override a value the caller explicitly supplied.
    if (processEnv[key] === undefined || processEnv[key] === "") {
      processEnv[key] = value;
    }
  }
  return resolved;
}
