#!/usr/bin/env node
/**
 * Slice 4.ACCOUNT-MODEL-6c — fix the production bug that 6b's repair
 * pass introduced.
 *
 * 6b's `6b-account-cutover-fix.mjs` blindly converted every
 * `<holder>.providerAccountId` reference to `<holder>.accountId` for a
 * fixed set of "V2-owner holders" (input, integration, ctx, …). That
 * was the correct rewrite for the V2-OWNER accountId slot, but it
 * ALSO mangled the PROVIDER-account-id slot at sites that read it
 * from those same holders (e.g. `providerAccountId: integration.providerAccountId,`
 * became `providerAccountId: integration.accountId,`).
 *
 * Symptom: `refreshAndRetry({ accountId: integration.accountId,
 * provider: …, providerAccountId: integration.accountId, … })` — both
 * sides resolve to the V2 owner; the provider-account hint is wrong;
 * `getActiveForExecution` either picks the wrong row when multiple
 * providerAccountIds exist on the same account, or returns null when
 * there's an exact-match filter against the wrong id.
 *
 * Fix: revert the over-rewrite. Any `providerAccountId: X.accountId`
 * site is restored to `providerAccountId: X.providerAccountId` for the
 * known holders.
 *
 * Idempotent.
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = process.cwd();
const INCLUDE_DIRS = ["integrations", "services", "app", "core"];
const EXCLUDE_DIRS = new Set(["node_modules", ".next", "dist", ".git"]);

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (EXCLUDE_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith(".ts") || name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const files = [];
for (const d of INCLUDE_DIRS) walk(resolve(ROOT, d), files);

// Known holders whose `.accountId` reference, when riding INSIDE a
// `providerAccountId: <holder>.accountId` slot, is the over-rewritten
// form. Restore them.
const HOLDERS = [
  "integration",
  "ctx",
  "ctx\\.integration",
  "trigger",
  "row",
  "input",
  "context",
];

let changed = 0;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  let out = src;
  for (const holder of HOLDERS) {
    const re = new RegExp(
      `providerAccountId:\\s*${holder}\\.accountId\\b`,
      "g",
    );
    out = out.replace(
      re,
      (m) => m.replace(/\.accountId\b/, ".providerAccountId"),
    );
  }
  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}
console.log(`Production bug repair complete: ${changed} files corrected.`);
