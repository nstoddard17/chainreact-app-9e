#!/usr/bin/env node
/**
 * Slice 4.ACCOUNT-MODEL-6b — fix duplicate `accountId:` in
 * `IntegrationActionRequiredError({...})` test args.
 *
 * Earlier sweeps renamed `userId:` → `accountId:` inside the error
 * constructor arg (correct for the V2 ownership accountId) but the same
 * arg often ALSO had an `accountId:` key carrying the PROVIDER account id
 * (the original input shape was `{ userId, provider, accountId, reason }`).
 * That second key is now `providerAccountId:`.
 *
 * For each `new IntegrationActionRequiredError({ ... })` literal that has
 * two `accountId:` keys, rename the SECOND one to `providerAccountId:`.
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
  const src = readFileSync(file, "utf8");
  let out = src;
  const re = /new IntegrationActionRequiredError\(\s*\{/g;
  let m;
  // Walk in reverse using a positions array
  const positions = [];
  while ((m = re.exec(src)) !== null) {
    positions.push(m.index + m[0].length - 1); // position of `{`
  }
  for (let k = positions.length - 1; k >= 0; k--) {
    const open = positions[k];
    const end = forwardMatchingBrace(src, open);
    if (end === -1) continue;
    const literal = src.slice(open, end);
    const matches = [...literal.matchAll(/\baccountId:/g)];
    if (matches.length < 2) continue;
    // Rename the SECOND occurrence to providerAccountId.
    const secondIdx = open + matches[1].index;
    out =
      out.slice(0, secondIdx) +
      "providerAccountId:" +
      out.slice(secondIdx + "accountId:".length);
  }
  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}
console.log(`Action-required-error test fix complete: ${changed} files corrected.`);
