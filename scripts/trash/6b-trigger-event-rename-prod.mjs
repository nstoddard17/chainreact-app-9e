#!/usr/bin/env node
/**
 * Slice 4.ACCOUNT-MODEL-6b — TriggerEvent key rename in production files.
 *
 * The test sweep handled TriggerEvent constructions in tests; this pass
 * does the same in production source (normalize.ts, webhook receivers,
 * messageHydration helpers, and route handlers that construct
 * TriggerEvent payloads). Detection: an object literal that simultaneously
 * contains the TriggerEvent fingerprint (provider:, eventType:, eventId:,
 * occurredAt:, accountId:, payload:) is rewritten so the `accountId:` key
 * becomes `providerAccountId:`.
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = process.cwd();
const INCLUDE_DIRS = ["integrations", "services", "app", "core", "contracts"];
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
    if (st.isDirectory()) {
      walk(full, out);
    } else if (name.endsWith(".ts") || name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

const files = [];
for (const dir of INCLUDE_DIRS) walk(resolve(ROOT, dir), files);

function findBalancedBrace(src, start) {
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
    if (ch === "/" && src[i + 1] === "/") {
      const eol = src.indexOf("\n", i);
      i = eol === -1 ? src.length : eol;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const close = src.indexOf("*/", i + 2);
      i = close === -1 ? src.length : close + 2;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return { start, end: i + 1 };
    }
    i++;
  }
  return null;
}

const PROVIDER = /\bprovider\b/;
const EVENT_TYPE = /\beventType\b/;
const EVENT_ID = /\beventId\b/;
const OCCURRED_AT = /\boccurredAt\b/;
const ACCOUNT_ID = /\baccountId\b/;
const PAYLOAD = /\bpayload\b/;

function rewriteTriggerEventLiterals(src) {
  // Strategy: find every `accountId:` key in the file, then walk backward
  // to find the enclosing `{` and forward to find the matching `}` (its
  // immediate enclosing object literal — NOT a function body that wraps
  // it). Test the fingerprint on that immediate literal. If it matches
  // TriggerEvent shape, rewrite the key to `providerAccountId:`.
  const re = /\baccountId:/g;
  const keys = [];
  let mm;
  while ((mm = re.exec(src)) !== null) keys.push(mm.index);

  // Walk keys in reverse order so prior rewrites don't shift indices.
  let out = src;
  for (let k = keys.length - 1; k >= 0; k--) {
    const idx = keys[k];
    // Walk backward to find the immediate enclosing `{`.
    const enclosing = findImmediateEnclosingBrace(out, idx);
    if (!enclosing) continue;
    const literal = out.slice(enclosing.start, enclosing.end);
    if (
      PROVIDER.test(literal) &&
      EVENT_TYPE.test(literal) &&
      EVENT_ID.test(literal) &&
      OCCURRED_AT.test(literal) &&
      PAYLOAD.test(literal)
    ) {
      out =
        out.slice(0, idx) +
        "providerAccountId:" +
        out.slice(idx + "accountId:".length);
    }
  }
  return out;
}

/**
 * Walk backward from `idx` to find the immediate enclosing `{`, then
 * forward to find its matching `}`. Returns the literal range.
 * Returns null if `idx` is not inside a brace.
 */
function findImmediateEnclosingBrace(src, idx) {
  // Walk backward: track depth so we can identify when we exit a nested
  // brace within the same enclosing one.
  let depth = 0;
  let i = idx - 1;
  // Skip backward through whitespace + the `accountId:` won't be in a
  // string at this point (we matched it as an identifier). Walk
  // backward char by char.
  while (i >= 0) {
    const ch = src[i];
    // Skip backwards over strings (naive — just look for matching quote).
    if (ch === '"' || ch === "'" || ch === "`") {
      // Find the prior matching quote.
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
        const start = i;
        // Find the matching closing brace going forward.
        const end = forwardMatchingBrace(src, start);
        if (end === -1) return null;
        return { start, end };
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
    if (ch === "/" && src[i + 1] === "/") {
      const eol = src.indexOf("\n", i);
      i = eol === -1 ? src.length : eol;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const close = src.indexOf("*/", i + 2);
      i = close === -1 ? src.length : close + 2;
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

function rewriteTopLevelAccountIdKey(literal) {
  let depth = 0;
  let i = 0;
  while (i < literal.length) {
    const ch = literal[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i++;
      while (i < literal.length) {
        if (literal[i] === "\\") {
          i += 2;
          continue;
        }
        if (literal[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (ch === "/" && literal[i + 1] === "/") {
      const eol = literal.indexOf("\n", i);
      i = eol === -1 ? literal.length : eol;
      continue;
    }
    if (ch === "/" && literal[i + 1] === "*") {
      const close = literal.indexOf("*/", i + 2);
      i = close === -1 ? literal.length : close + 2;
      continue;
    }
    if (ch === "{") {
      depth++;
      i++;
      continue;
    }
    if (ch === "}") {
      depth--;
      i++;
      continue;
    }
    // depth === 1 means we're at the top level of the literal we're scanning
    // (the literal's opening `{` set depth to 1 at i = 0).
    if (depth === 1 && literal.startsWith("accountId:", i)) {
      // Make sure it's a word boundary at the start.
      const prev = literal[i - 1];
      if (prev && /[A-Za-z0-9_]/.test(prev)) {
        i++;
        continue;
      }
      return (
        literal.slice(0, i) +
        "providerAccountId:" +
        literal.slice(i + "accountId:".length)
      );
    }
    i++;
  }
  return literal;
}

/**
 * Replace `//` line comments and `/* ... *\/` block comments with spaces
 * (preserving length + newlines) so that our backward walk doesn't mistake
 * backticks / braces inside doc comments for code tokens. The returned
 * `stripped` string has the same length as `src`, so positions found in
 * `stripped` are valid positions in `src` and vice versa.
 */
function stripComments(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "/" && src[i + 1] === "/") {
      // Line comment — replace each non-newline char with a space.
      while (i < src.length && src[i] !== "\n") {
        out.push(" ");
        i++;
      }
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      // Block comment — replace each non-newline char with a space.
      const close = src.indexOf("*/", i + 2);
      const end = close === -1 ? src.length : close + 2;
      while (i < end) {
        out.push(src[i] === "\n" ? "\n" : " ");
        i++;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      // Preserve string contents verbatim.
      out.push(ch);
      const quote = ch;
      i++;
      while (i < src.length) {
        out.push(src[i]);
        if (src[i] === "\\") {
          i++;
          if (i < src.length) {
            out.push(src[i]);
            i++;
          }
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
    out.push(ch);
    i++;
  }
  return out.join("");
}

let changed = 0;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  // Use the stripped version to find key positions + enclosing braces,
  // but rewrite in `src` (positions are aligned).
  const stripped = stripComments(src);
  const out = rewriteTriggerEventLiteralsWithStripped(src, stripped);
  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}
console.log(`TriggerEvent prod rename complete: ${changed} files.`);

function rewriteTriggerEventLiteralsWithStripped(src, stripped) {
  const re = /\baccountId:/g;
  const keys = [];
  let mm;
  while ((mm = re.exec(stripped)) !== null) keys.push(mm.index);

  let out = src;
  for (let k = keys.length - 1; k >= 0; k--) {
    const idx = keys[k];
    const enclosing = findImmediateEnclosingBrace(stripped, idx);
    if (!enclosing) continue;
    const literal = stripped.slice(enclosing.start, enclosing.end);
    if (
      PROVIDER.test(literal) &&
      EVENT_TYPE.test(literal) &&
      EVENT_ID.test(literal) &&
      OCCURRED_AT.test(literal) &&
      PAYLOAD.test(literal)
    ) {
      out =
        out.slice(0, idx) +
        "providerAccountId:" +
        out.slice(idx + "accountId:".length);
    }
  }
  return out;
}
