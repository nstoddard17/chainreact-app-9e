#!/usr/bin/env node
/**
 * Slice 4.ACCOUNT-MODEL-6b — `refresh({ userId, ..., accountId })` rename.
 *
 *   refresh({ userId: "X", provider: "Y" })
 *   → refresh({ accountId: "X", provider: "Y" })
 *
 *   refresh({ userId: "X", provider: "Y", accountId: "Z" })
 *   → refresh({ accountId: "X", provider: "Y", providerAccountId: "Z" })
 *
 *   refreshAndRetry({ userId: ..., ..., accountId: ... })  similar shape.
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
  // Locate `refresh(` and `refreshAndRetry(` call sites; rewrite their arg literal.
  for (const callee of ["refresh(", "refreshAndRetry("]) {
    let i = 0;
    while (true) {
      const idx = out.indexOf(callee, i);
      if (idx === -1) break;
      // Verify the prefix doesn't make this a different function (e.g. "preRefresh(").
      const prev = idx > 0 ? out[idx - 1] : "";
      if (/[A-Za-z0-9_$]/.test(prev)) {
        i = idx + callee.length;
        continue;
      }
      // Find the `{` opening the arg literal.
      let j = idx + callee.length;
      while (j < out.length && out[j] !== "{") {
        if (out[j] === ")" || out[j] === ";") {
          j = -1;
          break;
        }
        j++;
      }
      if (j === -1 || j >= out.length) {
        i = idx + callee.length;
        continue;
      }
      const end = forwardMatchingBrace(out, j);
      if (end === -1) {
        i = idx + callee.length;
        continue;
      }
      let literal = out.slice(j, end);
      // Rename userId: → accountId: (and rename existing accountId: → providerAccountId: in the same literal).
      if (/\buserId:/.test(literal) && !/\baccountId:\s*[A-Za-z0-9"]/.test(literal.replace(/userId:[^,}]+/, ""))) {
        // No existing provider-account `accountId:` — simple rename of userId to accountId.
        literal = literal.replace(/\buserId:/, "accountId:");
      } else if (/\buserId:/.test(literal) && /\baccountId:/.test(literal)) {
        // Rename the existing accountId: (provider) to providerAccountId: FIRST,
        // then rename userId: to accountId:.
        literal = literal.replace(/\baccountId:/g, "providerAccountId:");
        literal = literal.replace(/\buserId:/, "accountId:");
      }
      out = out.slice(0, j) + literal + out.slice(end);
      i = j + literal.length;
    }
  }
  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}
console.log(`Refresh-test fix complete: ${changed} files corrected.`);
