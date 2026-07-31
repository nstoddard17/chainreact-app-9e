#!/usr/bin/env node
/**
 * Migration RLS lint.
 * Per docs/rules/database-security.md §10:
 *   Every migration that creates a user-data or tenant-data table MUST
 *   enable RLS and define at least one CREATE POLICY in the same migration.
 *
 * System tables that intentionally skip user RLS (cron resources, dedup,
 * etc.) opt out via a header comment in the same file:
 *   -- system-table: <table> — <reason>
 *
 * For every CREATE TABLE in a migration:
 *   - check the same file for ENABLE ROW LEVEL SECURITY targeting that table
 *   - check the same file for at least one CREATE POLICY ... ON public.<table>
 *   - or check for an explicit `system-table: <table>` comment
 *
 * Fails CI on the first violation.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
let violations = 0;

let files;
try {
  files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();
} catch {
  console.log("OK — no migrations directory yet.");
  process.exit(0);
}

for (const file of files) {
  const path = join(MIGRATIONS, file);
  const sql = readFileSync(path, "utf8");

  const systemTables = new Set(
    [...sql.matchAll(/--\s*system-table:\s*([\w.]+)/gi)].map((m) =>
      m[1].toLowerCase(),
    ),
  );

  const createTableMatches = [
    ...sql.matchAll(
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.(\w+)/gi,
    ),
  ];

  for (const match of createTableMatches) {
    const table = match[1].toLowerCase();
    if (systemTables.has(table)) continue;

    const enableRls = new RegExp(
      `ALTER\\s+TABLE\\s+(?:ONLY\\s+)?public\\.${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
      "i",
    ).test(sql);
    if (!enableRls) {
      console.error(
        `MIGRATION-RLS VIOLATION: ${file} creates public.${table} but does not ENABLE ROW LEVEL SECURITY.`,
      );
      violations += 1;
      continue;
    }

    const hasPolicy = new RegExp(
      `CREATE\\s+POLICY\\s+\\S+\\s+ON\\s+public\\.${table}`,
      "i",
    ).test(sql);
    if (!hasPolicy) {
      console.error(
        `MIGRATION-RLS VIOLATION: ${file} creates public.${table} with RLS but no CREATE POLICY in the same file.`,
      );
      violations += 1;
    }
  }
}

// ── GRANT coverage (Supabase Data API, Oct 30 2026 cutover) ──────────────────
// Per docs/rules/database-security.md: after Supabase removes implicit Data API
// grants on public-schema tables, any table WITHOUT explicit GRANTs returns
// `42501` to PostgREST / supabase-js / GraphQL. RLS still gates ROWS; a GRANT
// only lets the role TOUCH the table.
//
// Rule: every `CREATE TABLE public.<x>` must have at least one explicit
// `GRANT … ON public.<x> … TO <role>` somewhere in the migration set (the grant
// may live in a later corrective/backfill migration, so this check is
// corpus-wide, NOT same-file like the RLS check above).
//
// We require *coverage*, not a specific role: the authenticated-vs-service_role
// split per table is an intentional design choice — e.g. `account_api_keys` is
// deliberately service_role-only at the Data API layer (clients never read key
// hashes directly), and the `oauth_states` / `webhook_event_dedup` / `hubspot_*`
// system tables are service_role-only. Function grants (`GRANT EXECUTE ON
// FUNCTION …`) are not table grants and are ignored.
const createdTables = new Map(); // table -> first migration file that creates it
const grantedTables = new Set();
const droppedTables = new Set(); // tables a later migration removed (skip the GRANT check)
for (const file of files) {
  const sql = readFileSync(join(MIGRATIONS, file), "utf8");
  for (const m of sql.matchAll(
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.(\w+)/gi,
  )) {
    const t = m[1].toLowerCase();
    if (!createdTables.has(t)) createdTables.set(t, file);
  }
  // Line-anchored so commented `-- … DROP TABLE …` rollback notes don't count.
  for (const d of sql.matchAll(
    /^[ \t]*DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?public\.(\w+)/gim,
  )) {
    droppedTables.add(d[1].toLowerCase());
  }
  // Match each GRANT statement (GRANT … ;) — statements may wrap across lines,
  // so scan per-statement rather than per-line. Anchor to line start so the
  // word "GRANT" inside `--` comments can't spawn phantom matches.
  for (const stmt of sql.matchAll(/^[ \t]*GRANT\b[\s\S]*?;/gim)) {
    const st = stmt[0];
    if (/\bON\s+FUNCTION\b/i.test(st)) continue; // GRANT EXECUTE ON FUNCTION …
    const g = st.match(/\bON\s+public\.(\w+)\b/i);
    if (g && /\bTO\b/i.test(st)) grantedTables.add(g[1].toLowerCase());
  }
}
for (const table of droppedTables) createdTables.delete(table); // dropped → no longer needs a grant
for (const [table, file] of createdTables) {
  if (!grantedTables.has(table)) {
    console.error(
      `MIGRATION-GRANT VIOLATION: ${file} creates public.${table} but no migration GRANTs it to a Data API role.`,
    );
    console.error(
      `  Add: GRANT <privs> ON public.${table} TO authenticated;  (RLS-gated — match the table's policies)`,
    );
    console.error(
      `   and GRANT SELECT, INSERT, UPDATE, DELETE ON public.${table} TO service_role;  (or service_role-only for internal tables)`,
    );
    violations += 1;
  }
}

// GOOGLE-REVIEW-CERTIFICATION-2 — DUPLICATE VERSION PREFIX.
// Supabase keys migration history on the leading version (the chars before the first `_`), NOT
// the filename. Two files sharing a version means whichever ran first records the version and the
// other is SILENTLY SKIPPED FOREVER — `supabase db push` reports success and the second file's
// DDL/DML never runs. This bit a real batch: a new template seed reused 20260730000000, already
// taken by an applied migration, so the template would never have been inserted.
{
  const byVersion = new Map();
  for (const file of files) {
    const version = file.split("_")[0];
    if (!/^\d{14}$/.test(version)) {
      console.error(`MIGRATION-VERSION VIOLATION: ${file} has no 14-digit version prefix.`);
      violations += 1;
      continue;
    }
    byVersion.set(version, [...(byVersion.get(version) ?? []), file]);
  }
  for (const [version, sharing] of byVersion) {
    if (sharing.length > 1) {
      console.error(
        `MIGRATION-VERSION VIOLATION: version ${version} is used by ${sharing.length} files — supabase records the version once, so all but the first are silently skipped:`,
      );
      for (const f of sharing) console.error(`  ${f}`);
      console.error(`  Renumber all but one to an unused version.`);
      violations += 1;
    }
  }
}

if (violations > 0) {
  console.error(
    `\n${violations} migration RLS/GRANT/VERSION violation(s). See docs/rules/database-security.md.`,
  );
  console.error(
    `Either add policies/GRANTs, or mark the table system-only with a header comment:`,
  );
  console.error(`  -- system-table: <table_name> — <reason>`);
  process.exit(1);
}

console.log(
  "OK — every migration that creates a user-data table enables RLS + has at least one policy, and every created table has explicit Data API GRANTs.",
);
