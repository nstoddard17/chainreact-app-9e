#!/usr/bin/env node
/**
 * Slice 4.ACCOUNT-MODEL-6b — last-mile cleanup.
 *
 *   - TriggerEvent literal with shorthand `accountId,` (referencing a
 *     local var) — rename to `providerAccountId,`.
 *   - Trigger event factory functions that take an `accountId` param
 *     and use it as shorthand — rename param + uses.
 *   - dropbox normalize literal: `normalizeNewFile({ entry, accountId })`
 *     remaining forms.
 *   - dropbox snapshot config tests.
 *   - GitHub normalize literal `accountId,` shorthand.
 *   - Discord/Gmail/Stripe/etc literal `accountId,` shorthand.
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

function stripComments(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") {
        out.push(" ");
        i++;
      }
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const close = src.indexOf("*/", i + 2);
      const end = close === -1 ? src.length : close + 2;
      while (i < end) {
        out.push(src[i] === "\n" ? "\n" : " ");
        i++;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
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
  const src = readFileSync(file, "utf8");
  let out = src;

  // 1. TriggerEvent literal — accountId shorthand: replace by walking
  //    backward to find enclosing brace, then if it matches TriggerEvent
  //    fingerprint, rename the `accountId,` to `providerAccountId,`.
  //    Also rename `accountId:` key (if not already done).
  const stripped = stripComments(out);
  const positions = [];
  let m;
  // Match either `accountId:` key OR `accountId` shorthand at object-literal-key
  // position. To detect shorthand position, require either:
  //   - `accountId,` (followed by comma)
  //   - `accountId` followed by `\n` and `}` or `,`
  // Walk backward to detect enclosing TriggerEvent literal.
  const re = /\baccountId\b(?=[,:\s\n])/g;
  while ((m = re.exec(stripped)) !== null) positions.push(m.index);
  for (let k = positions.length - 1; k >= 0; k--) {
    const idx = positions[k];
    // Check what follows the identifier
    const after = stripped[idx + "accountId".length];
    // Skip if it's `.` (member access)
    if (after === ".") continue;
    // Skip if preceded by `.` (member access on left)
    const before = idx > 0 ? stripped[idx - 1] : "";
    if (before === ".") continue;
    const enclosing = findImmediateEnclosingBrace(stripped, idx);
    if (!enclosing) continue;
    const literal = stripped.slice(enclosing.start, enclosing.end);
    if (
      /\bprovider\b/.test(literal) &&
      /\beventType\b/.test(literal) &&
      /\beventId\b/.test(literal) &&
      /\boccurredAt\b/.test(literal) &&
      /\bpayload\b/.test(literal)
    ) {
      // Rename position in `out`
      out =
        out.slice(0, idx) +
        "providerAccountId" +
        out.slice(idx + "accountId".length);
    }
  }

  // 2. Function-arg pattern: factory functions that take `accountId: string`
  //    and use it as a TriggerEvent shorthand. Rename the param + uses in
  //    the function body. We detect this by scanning functions whose body
  //    contains a TriggerEvent shorthand.
  // For simplicity, do a targeted replace: factory functions like
  // `function name(accountId: string): TriggerEvent` AND only if
  // body contains `provider: "...",` AND `providerAccountId,` (after step 1).
  // Replace param name and shorthand-uses inside that body.
  out = out.replace(
    /function\s+(\w+)\(accountId:\s*string\)\s*:\s*TriggerEvent\s*\{([\s\S]*?)\n\}/g,
    (match, fnName, body) => {
      if (!/\bproviderAccountId\b/.test(body)) return match;
      const newBody = body.replace(/\baccountId\b/g, "providerAccountId");
      return `function ${fnName}(providerAccountId: string): TriggerEvent {${newBody}\n}`;
    },
  );

  // 3. dropbox normalize helper call shorthand
  out = out.replace(/normalizeNewFile\(\{\s*entry,\s*accountId:\s*"([^"]+)"\s*\}\)/g, "normalizeNewFile({ entry, providerAccountId: \"$1\" })");

  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}
console.log(`Final cleanup complete: ${changed} files modified.`);
