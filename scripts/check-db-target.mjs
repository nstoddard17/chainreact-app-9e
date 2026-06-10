#!/usr/bin/env node
/**
 * Guard: verify the local migration target points at the V2 Supabase project.
 *
 * Reads .env.local, then asserts POSTGRES_URL_NON_POOLING targets the same
 * project ref as NEXT_PUBLIC_SUPABASE_URL. Exits non-zero on mismatch so it can
 * gate `db push` and CI/readiness checks.
 *
 * SECRET-SAFE: only ever prints PROJECT REFS and host fingerprints — never the
 * connection string or password.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  KNOWN_FOREIGN_REFS,
  loadEnvFile,
  parseRefFromPgUrl,
  parseRefFromSupabaseUrl,
  validateMigrationTarget,
} from "./lib/db-target.mjs";

const envPath = resolve(process.cwd(), ".env.local");
if (!existsSync(envPath)) {
  console.error("ABORT — .env.local not found at repo root.");
  process.exit(1);
}

const env = loadEnvFile(readFileSync, envPath);

// Safe per-var ref report (refs only — no secrets).
const reported = [
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "PRODUCTION_POSTGRES_URL_NON_POOLING",
  "PRODUCTION_POSTGRES_URL",
].map((name) => {
  const ref = parseRefFromPgUrl(env[name]);
  return {
    var: name,
    projectRef: ref || (env[name] ? "(unparsed)" : "(unset)"),
    note: ref && KNOWN_FOREIGN_REFS[ref] ? KNOWN_FOREIGN_REFS[ref] : "",
  };
});

console.log(
  `App project (NEXT_PUBLIC_SUPABASE_URL): ${
    parseRefFromSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL) || "(unparsed)"
  }`
);
console.table(reported);

const result = validateMigrationTarget(env);
if (!result.ok) {
  console.error(`\n❌ DB-target check FAILED: ${result.reason}`);
  process.exit(1);
}
console.log(`\n✅ DB-target check passed: ${result.reason}`);

// Advisory: PRODUCTION_* vars are not consumed by any script today; flag if they
// point somewhere unexpected so a future consumer doesn't inherit the mistake.
const prodRef = parseRefFromPgUrl(env.PRODUCTION_POSTGRES_URL_NON_POOLING);
if (prodRef && prodRef !== result.expectedRef) {
  console.warn(
    `\n⚠️  Advisory: PRODUCTION_POSTGRES_URL_NON_POOLING targets "${prodRef}"${
      KNOWN_FOREIGN_REFS[prodRef] ? ` = ${KNOWN_FOREIGN_REFS[prodRef]}` : ""
    }. Not consumed by any script today; confirm intent before wiring it to anything.`
  );
}
