#!/usr/bin/env node
/**
 * Slice 4.ACCOUNT-MODEL-6b — repair pass.
 *
 * The first sweep's `(\W)accountId,` regex was too broad: it matched
 * `.accountId,` inside `input.accountId,` (where the `.` is `\W`), so
 * `accountId: input.accountId,` ended up rewritten as
 * `accountId: input.providerAccountId,`. Same shape produced
 * `integration.providerAccountId`, `context.providerAccountId`,
 * `trigger.workflowProviderAccountId`, etc.
 *
 * This pass walks the same file set and reverses the over-rewrite by
 * normalizing the dot-prefixed names back to their V2-ownership form
 * for the well-defined holders (`input`, `integration`, `context`,
 * `dispatchInfo`, `workflow`, `auth`, `ownerAccount`, `personalAccount`).
 *
 * For `trigger.providerAccountId` (TriggerResourceRecord) the rename
 * IS correct — that one stays. We're only restoring the V2-ownership
 * sites that mistakenly took the rename.
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = process.cwd();

const INCLUDE_DIRS = [
  "integrations",
  "services",
  "app",
  "core",
  "contracts",
];

const EXCLUDE_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  ".git",
]);

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
    if (st.isDirectory()) {
      walk(full, out);
    } else if (name.endsWith(".ts") || name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

const files = [];
for (const dir of INCLUDE_DIRS) {
  walk(resolve(ROOT, dir), files);
}

// Names that hold a V2-ownership reference (NOT a provider account).
const V2_OWNERSHIP_HOLDERS = [
  "input",
  "integration",
  "context",
  "ctx",
  "dispatchInfo",
  "workflow",
  "auth",
  "ownerAccount",
  "personalAccount",
  "this",
];

let changedFiles = 0;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  let out = src;

  for (const holder of V2_OWNERSHIP_HOLDERS) {
    // Restore `<holder>.providerAccountId` → `<holder>.accountId`
    // (over-rewrite from the first sweep). Trigger.providerAccountId
    // is correct and not in this list.
    const re = new RegExp(`\\b${holder}\\.providerAccountId\\b`, "g");
    out = out.replace(re, `${holder}.accountId`);
  }

  if (out !== src) {
    writeFileSync(file, out);
    changedFiles++;
  }
}

console.log(`Repair pass complete: ${changedFiles} files corrected.`);
