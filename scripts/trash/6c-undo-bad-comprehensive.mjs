#!/usr/bin/env node
/**
 * Slice 4.ACCOUNT-MODEL-6c — undo the bad over-rewrite.
 *
 * The comprehensive sweep mistakenly renamed `accountId: integration.accountId`
 * (the V2 ownership slot on refreshAndRetry calls) to
 * `providerAccountId: integration.providerAccountId`, leaving the call
 * literal with TWO `providerAccountId:` keys (the V2-owner replacement
 * AND the original provider-account key). Restore the first occurrence
 * to its V2-owner shape: `accountId: integration.accountId`.
 *
 * Trigger: any line of the form
 *   providerAccountId: integration.providerAccountId,
 * that is FOLLOWED within 4 lines by ANOTHER
 *   providerAccountId: integration.providerAccountId,
 * line — the first is the over-rewrite; restore it.
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
  const lines = src.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Look for `providerAccountId: <holder>.providerAccountId,` that is
    // FOLLOWED within next 5 lines by ANOTHER
    // `providerAccountId: <holder>.providerAccountId,`. The earlier one
    // is the V2-owner over-rewrite — restore.
    const m1 = line.match(
      /^(\s+)providerAccountId:\s+(integration|trigger|ctx\.integration|context\.integration)\.providerAccountId,\s*$/,
    );
    if (m1) {
      let dupFound = false;
      for (let j = 1; j <= 6 && i + j < lines.length; j++) {
        const next = lines[i + j];
        // Match either explicit form OR shorthand `providerAccountId,`
        // OR explicit-null form `providerAccountId: null,`.
        const m2 =
          next.match(
            /^\s+providerAccountId:\s+(integration|trigger|ctx\.integration|context\.integration)\.providerAccountId,\s*$/,
          ) ||
          next.match(/^\s+providerAccountId,\s*$/) ||
          next.match(/^\s+providerAccountId:\s+null,\s*$/);
        if (m2) {
          dupFound = true;
          break;
        }
        // Stop at the closing `})` of the refreshAndRetry block.
        if (/^\s*\}\)/.test(next)) break;
      }
      if (dupFound) {
        out.push(`${m1[1]}accountId: ${m1[2]}.accountId,`);
        continue;
      }
    }
    out.push(line);
  }
  const joined = out.join("\n");
  if (joined !== src) {
    writeFileSync(file, joined);
    changed++;
  }
}
console.log(`Bad comprehensive undo complete: ${changed} files corrected.`);
