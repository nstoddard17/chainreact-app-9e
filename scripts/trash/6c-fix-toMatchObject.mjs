#!/usr/bin/env node
/**
 * Fix `toMatchObject({ userId, accountId, … })` patterns on
 * `refreshAndRetry` mock-call assertions. The new shape is
 * `{ accountId, provider, providerAccountId, … }` — `userId` is gone,
 * the previous `accountId` (provider account) is now `providerAccountId`.
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

function forwardMatchingBrace(src, start) {
  let depth = 0;
  let i = start;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
    i++;
  }
  return -1;
}

const files = walk(TESTS_DIR);
let changed = 0;
for (const file of files) {
  if (!file.replace(/\\/g, "/").includes("/tests/unit/integrations/")) continue;
  const src = readFileSync(file, "utf8");
  let out = src;

  // Find `toMatchObject({` blocks that are arguments to assertions on
  // mockRefreshAndRetry / mockRefresh mock calls.
  const lines = out.split("\n");
  // We process via regex on `toMatchObject({`.
  const re = /toMatchObject\(\s*\{/g;
  const positions = [];
  let m;
  while ((m = re.exec(out)) !== null) {
    positions.push(m.index + m[0].length - 1);
  }
  for (let k = positions.length - 1; k >= 0; k--) {
    const open = positions[k];
    const end = forwardMatchingBrace(out, open);
    if (end === -1) continue;
    // Check if the preceding ~50 chars before `toMatchObject(` mention
    // refreshAndRetry mock calls — that's the only context where we
    // want this rewrite.
    const before = out.slice(Math.max(0, open - 200), open);
    if (!/mockRefreshAndRetry|mockRefresh\b/.test(before)) continue;
    const literal = out.slice(open, end);
    let newLit = literal;
    // Remove `userId: "<X>",` (with trailing whitespace/newline).
    newLit = newLit.replace(/\n\s*userId:\s*"[^"]+",\s*/g, "\n      ");
    // Rename `accountId:` → `providerAccountId:` (provider account
    // slot). Exclude the new V2 ownership `accountId: "acct-…"` form
    // explicitly via a negative lookahead.
    newLit = newLit.replace(
      /\baccountId:\s*"(?!acct-)([^"]+)"/g,
      'providerAccountId: "$1"',
    );
    newLit = newLit.replace(/\baccountId:\s*null\b/g, "providerAccountId: null");
    out = out.slice(0, open) + newLit + out.slice(end);
  }

  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}
console.log(`toMatchObject sweep complete: ${changed} files corrected.`);
