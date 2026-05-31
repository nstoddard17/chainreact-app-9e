#!/usr/bin/env node
/**
 * Targeted: `for (const call of mockRefreshAndRetry.mock.calls) { … }`
 * blocks whose inner `expect(call[0]).toEqual(expect.objectContaining({…}))`
 * still references the legacy `accountId:` (provider account) field.
 *
 * Rename `accountId:` in those literals to `providerAccountId:`. Skip
 * the V2-owner `accountId: "acct-…"` form.
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const TESTS_DIR = resolve(process.cwd(), "tests");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith(".ts") || name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const files = walk(TESTS_DIR);
let changed = 0;
for (const file of files) {
  if (!file.replace(/\\/g, "/").includes("/tests/unit/integrations/")) continue;
  const src = readFileSync(file, "utf8");
  let out = src;
  // Match `for (const call of mockRefreshAndRetry.mock.calls)` blocks.
  // Inside each, rewrite `accountId:` (non-acct prefix) to `providerAccountId:`.
  out = out.replace(
    /(for\s*\(\s*const\s+call\s+of\s+mockRefreshAndRetry\.mock\.calls\s*\)\s*\{[\s\S]*?\n\s*\})/g,
    (block) => {
      let b = block;
      b = b.replace(
        /\baccountId:\s*"(?!acct-)([^"]+)"/g,
        'providerAccountId: "$1"',
      );
      b = b.replace(/\baccountId:\s*null\b/g, "providerAccountId: null");
      return b;
    },
  );
  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}
console.log(`for-loop assertion sweep complete: ${changed} files corrected.`);
