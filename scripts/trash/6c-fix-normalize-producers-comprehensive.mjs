#!/usr/bin/env node
/**
 * Slice 4.ACCOUNT-MODEL-6c — finish the NormalizeContext producer
 * cleanup.
 *
 * Pattern targeted:
 *   normalize(e, { accountId: integration.accountId, … })
 *   normalize(e, { accountId: integration.providerAccountId, … })
 *   { accountId: integration.accountId, calendarId: … }
 *
 * Per the renamed NormalizeContext convention, the producer field name
 * is `providerAccountId` and its value is sourced from
 * `<holder>.providerAccountId` (the provider account on the integration
 * row / trigger row / context). Both the field name AND the value are
 * fixed in one pass.
 *
 * Holders: integration / trigger / ctx.integration / context.integration.
 *
 * Idempotent.
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = process.cwd();
const INCLUDE_DIRS = ["integrations"];
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
    else if (name.endsWith(".ts")) out.push(full);
  }
  return out;
}

const files = [];
for (const d of INCLUDE_DIRS) walk(resolve(ROOT, d), files);

let changed = 0;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  let out = src;

  // accountId: integration.accountId          → providerAccountId: integration.providerAccountId
  // accountId: integration.providerAccountId  → providerAccountId: integration.providerAccountId
  // accountId: trigger.accountId              → providerAccountId: trigger.providerAccountId
  // accountId: trigger.providerAccountId      → providerAccountId: trigger.providerAccountId
  out = out.replace(
    /\baccountId:\s*integration\.accountId\b/g,
    "providerAccountId: integration.providerAccountId",
  );
  out = out.replace(
    /\baccountId:\s*integration\.providerAccountId\b/g,
    "providerAccountId: integration.providerAccountId",
  );
  out = out.replace(
    /\baccountId:\s*trigger\.accountId\b/g,
    "providerAccountId: trigger.providerAccountId",
  );
  out = out.replace(
    /\baccountId:\s*trigger\.providerAccountId\b/g,
    "providerAccountId: trigger.providerAccountId",
  );

  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}
console.log(`Normalize producer comprehensive fix complete: ${changed} files corrected.`);
