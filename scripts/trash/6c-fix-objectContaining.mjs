#!/usr/bin/env node
/**
 * Slice 4.ACCOUNT-MODEL-6c — extend the toMatchObject sweep to
 * `expect.objectContaining({...})` literals used as the argument to
 * `expect(mockRefreshAndRetry).toHaveBeenCalledWith(...)`.
 *
 * Same rename rules: drop `userId:`, rename `accountId:` (provider
 * account form, NOT the V2 `acct-…` form) to `providerAccountId:`.
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

  const re = /expect\.objectContaining\(\s*\{/g;
  const positions = [];
  let m;
  while ((m = re.exec(out)) !== null) {
    positions.push(m.index + m[0].length - 1);
  }
  for (let k = positions.length - 1; k >= 0; k--) {
    const open = positions[k];
    const end = forwardMatchingBrace(out, open);
    if (end === -1) continue;
    // Only rewrite when the surrounding ~400 chars before
    // `expect.objectContaining(...)` mention `mockRefreshAndRetry` or
    // `mockRefresh.mock.calls` or `toHaveBeenCalledWith(`.
    const before = out.slice(Math.max(0, open - 400), open);
    const isRefreshCallSite =
      /mockRefreshAndRetry|mockRefresh\b/.test(before) &&
      /toHaveBeenCalledWith/.test(before);
    if (!isRefreshCallSite) continue;
    const literal = out.slice(open, end);
    let newLit = literal;
    // Drop `userId: "<X>",` lines and inline forms.
    newLit = newLit.replace(/\n\s*userId:\s*"[^"]+",\s*/g, "\n        ");
    newLit = newLit.replace(/\buserId:\s*"[^"]+",\s*/g, "");
    // Rename provider-account `accountId:` to `providerAccountId:`.
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
console.log(`objectContaining sweep complete: ${changed} files corrected.`);
