#!/usr/bin/env node
/**
 * Slice 4.ACCOUNT-MODEL-6c — broader normalize-test context sweep.
 *
 * Catches inline `{ accountId: X }` literals in normalize.test.ts and
 * dispatch-dedup.test.ts files that the line-anchored sweep missed.
 *
 * Heuristic: any test file whose source mentions `NormalizeContext` or
 * `NormalizeMailchimpEventInput` gets a broad rename of `accountId:`
 * (in key position) to `providerAccountId:` — but ONLY when the
 * literal in question is shape-compatible (we use a simple regex over
 * the file). The IntegrationRecord mocks in these files use
 * `accountId` for the V2 owner, and those mocks have the surrounding
 * `accessTokenEncrypted:` etc. — we exclude them.
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

function rewriteNormalizeContextKeys(src) {
  // For each `accountId:` key, walk backward to find the enclosing `{`,
  // then forward to find the matching `}`. If the literal has BOTH
  // `notificationOccurredAt` AND NOT `accessTokenEncrypted` (the
  // IntegrationRecord fingerprint), rename.
  const positions = [];
  const re = /\baccountId:/g;
  let m;
  while ((m = re.exec(src)) !== null) positions.push(m.index);
  let out = src;
  for (let k = positions.length - 1; k >= 0; k--) {
    const idx = positions[k];
    const enclosing = findImmediateEnclosingBrace(out, idx);
    if (!enclosing) continue;
    const literal = out.slice(enclosing.start, enclosing.end);
    const isNormalizeContext =
      /\bnotificationOccurredAt\b/.test(literal) ||
      /\bchangeType\b/.test(literal);
    const isIntegrationMock = /\baccessTokenEncrypted\b/.test(literal);
    if (!isNormalizeContext || isIntegrationMock) continue;
    out =
      out.slice(0, idx) +
      "providerAccountId:" +
      out.slice(idx + "accountId:".length);
  }
  return out;
}

function findImmediateEnclosingBrace(src, idx) {
  let depth = 0;
  let i = idx - 1;
  while (i >= 0) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i--;
      while (i >= 0) {
        if (src[i] === quote && src[i - 1] !== "\\") break;
        i--;
      }
      i--;
      continue;
    }
    if (ch === "}") {
      depth++;
      i--;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) {
        const end = forwardMatchingBrace(src, i);
        if (end === -1) return null;
        return { start: i, end };
      }
      depth--;
      i--;
      continue;
    }
    i--;
  }
  return null;
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
  if (
    !/\bNormalizeContext\b/.test(src) &&
    !/\bNormalizeMailchimpEventInput\b/.test(src) &&
    !/\bnotificationOccurredAt\b/.test(src) &&
    !/normalize\(/.test(src)
  ) {
    continue;
  }
  const out = rewriteNormalizeContextKeys(src);
  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}
console.log(`Normalize test context v2 fix complete: ${changed} files corrected.`);
