#!/usr/bin/env node
/**
 * Slice 4.ACCOUNT-MODEL-6b — test ActionHandlerInput fix.
 *
 * The earlier `rewriteActionHandlerInputLiterals` sweep walked from each
 * `{` and ran a single non-global `replace` against the matching literal,
 * which caused it to over-match the outer `describe(() => {...})` block
 * and rewrite only the very first occurrence of `userId: "<X>",` inside
 * the file.
 *
 * This script does a narrower local pattern: any line that reads
 *     userId: "<X>",
 * followed within the next two lines by
 *     runId: "..."
 * is an ActionHandlerInput literal — insert an `accountId: "acct-<X>",`
 * immediately after the `userId:` line at the matching indentation.
 *
 * Idempotent: skips inserts where the next line already declares
 * `accountId: "acct-<X>",`.
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = process.cwd();
const TESTS_DIR = resolve(ROOT, "tests");

const SKIP_FILES = new Set([
  resolve(
    ROOT,
    "tests/integration/migrations/account-id-foundation-backfill.test.ts",
  ),
  resolve(
    ROOT,
    "tests/integration/migrations/account-id-foundation-dual-rls.test.ts",
  ),
  resolve(
    ROOT,
    "tests/integration/migrations/account-id-foundation-compat-trigger.test.ts",
  ),
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if ((name.endsWith(".ts") || name.endsWith(".tsx")) && !SKIP_FILES.has(resolve(full))) out.push(full);
  }
  return out;
}

const files = walk(TESTS_DIR);

let changed = 0;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  // Pattern: a userId line followed within 2 lines by a runId line.
  // We do this by splitting into lines, scanning, and inserting.
  const lines = src.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    out.push(line);
    const userMatch = line.match(/^(\s+)userId: "([^"]+)",\s*$/);
    if (userMatch) {
      const ind = userMatch[1];
      const val = userMatch[2];
      // Check the next 2 lines for runId.
      let hasRunIdSoon = false;
      for (let j = 1; j <= 2 && i + j < lines.length; j++) {
        if (/^\s+runId: "/.test(lines[i + j])) {
          hasRunIdSoon = true;
          break;
        }
      }
      // Check the next line to confirm we haven't already inserted.
      const next = lines[i + 1] ?? "";
      const alreadyInserted = /^\s+accountId: "acct-/.test(next);
      if (hasRunIdSoon && !alreadyInserted) {
        out.push(`${ind}accountId: "acct-${val}",`);
      }
    }
  }
  const joined = out.join("\n");
  if (joined !== src) {
    writeFileSync(file, joined);
    changed++;
  }
}
console.log(`Test ActionHandlerInput fix complete: ${changed} files corrected.`);
