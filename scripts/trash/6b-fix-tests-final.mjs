#!/usr/bin/env node
/**
 * Slice 4.ACCOUNT-MODEL-6b — test sweep, second pass.
 *
 * Covers the residual patterns the earlier test sweep + fix-iface
 * passes missed:
 *
 *   - TriggerResourceRecord mocks: add `workflowAccountId: ...` and
 *     rename `accountId: ...` → `providerAccountId: ...` inside the
 *     literal. Fingerprint = simultaneous presence of `nodeId:`,
 *     `expiresAt:`, `lastRenewedAt:`.
 *
 *   - WorkflowRecord mocks: insert `accountId: ...` after `userId:`
 *     inside any literal that contains `draftDefinition:` + `state:`
 *     + `activeRevisionId:`. Idempotent.
 *
 *   - In-test TriggerEvent constructions that weren't caught by the
 *     earlier balanced-brace pass — usually because the fingerprint
 *     check excluded them (already had `accountId:` from being a
 *     pre-rename test). For these we accept ALL `accountId:` keys at
 *     the top level of a TriggerEvent-shape literal as the canonical
 *     TriggerEvent key, and rename to `providerAccountId:`.
 *
 *   - IntegrationActionRequiredError test arg shape: `userId:` →
 *     `accountId:` to match the constructor's renamed field.
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = process.cwd();
const TESTS_DIR = resolve(ROOT, "tests");

const SKIP_FILES = new Set([
  resolve(ROOT, "tests/integration/migrations/account-id-foundation-backfill.test.ts"),
  resolve(ROOT, "tests/integration/migrations/account-id-foundation-dual-rls.test.ts"),
  resolve(ROOT, "tests/integration/migrations/account-id-foundation-compat-trigger.test.ts"),
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

// ------------- balanced brace utilities -------------
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

// ------------- pass 1: TriggerEvent literal accountId → providerAccountId -------------
function renameTriggerEventAccountId(src) {
  const stripped = stripComments(src);
  const PROVIDER = /\bprovider\b/;
  const EVENT_TYPE = /\beventType\b/;
  const EVENT_ID = /\beventId\b/;
  const OCCURRED_AT = /\boccurredAt\b/;
  const PAYLOAD = /\bpayload\b/;

  const re = /\baccountId:/g;
  const positions = [];
  let m;
  while ((m = re.exec(stripped)) !== null) positions.push(m.index);

  let out = src;
  for (let k = positions.length - 1; k >= 0; k--) {
    const idx = positions[k];
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

// ------------- pass 2: TriggerResourceRecord mock — add workflowAccountId, rename accountId → providerAccountId -------------
function rewriteTriggerResourceMocks(src) {
  const stripped = stripComments(src);
  // Detect TriggerResourceRecord literals by combination of keys.
  // Use `accountId:` as the anchor — walk to enclosing brace, check fingerprint.
  const re = /\baccountId:/g;
  const positions = [];
  let m;
  while ((m = re.exec(stripped)) !== null) positions.push(m.index);

  let out = src;
  for (let k = positions.length - 1; k >= 0; k--) {
    const idx = positions[k];
    const enclosing = findImmediateEnclosingBrace(stripped, idx);
    if (!enclosing) continue;
    const literal = stripped.slice(enclosing.start, enclosing.end);
    const isTriggerResource =
      /\bnodeId:/.test(literal) &&
      /\bexpiresAt:/.test(literal) &&
      /\blastRenewedAt:/.test(literal);
    if (!isTriggerResource) continue;
    // Skip if literal already has workflowAccountId AND providerAccountId
    if (
      /\bworkflowAccountId\b/.test(literal) &&
      /\bproviderAccountId\b/.test(literal)
    ) {
      continue;
    }
    // Rename `accountId:` → `providerAccountId:` at this position.
    out =
      out.slice(0, idx) +
      "providerAccountId:" +
      out.slice(idx + "accountId:".length);
  }

  // Pass 2b: add workflowAccountId after workflowId in TriggerResourceRecord literals.
  // After the above rename, scan for literals with both nodeId + expiresAt + providerAccountId.
  const re2 = /\bworkflowId:\s*"([^"]+)",/g;
  // We'll redo from `out` (since we mutated). Repeat the stripped/positions approach.
  const stripped2 = stripComments(out);
  const wfIdPositions = [];
  let mm;
  while ((mm = re2.exec(stripped2)) !== null) wfIdPositions.push({ idx: mm.index, len: mm[0].length, val: mm[1] });
  for (let k = wfIdPositions.length - 1; k >= 0; k--) {
    const { idx, len, val } = wfIdPositions[k];
    const enclosing = findImmediateEnclosingBrace(stripped2, idx);
    if (!enclosing) continue;
    const literal = stripped2.slice(enclosing.start, enclosing.end);
    const isTriggerResource =
      /\bnodeId:/.test(literal) &&
      /\bexpiresAt:/.test(literal) &&
      /\blastRenewedAt:/.test(literal);
    if (!isTriggerResource) continue;
    if (/\bworkflowAccountId\b/.test(literal)) continue;
    // Determine indentation. We use the indentation of the workflowId: line.
    let lineStart = idx;
    while (lineStart > 0 && out[lineStart - 1] !== "\n") lineStart--;
    const ind = out.slice(lineStart, idx);
    const insertAt = idx + len;
    const insertion = `\n${ind}workflowAccountId: "acct-${val.split("-").pop() ?? val}",`;
    out = out.slice(0, insertAt) + insertion + out.slice(insertAt);
  }

  return out;
}

// ------------- pass 3: WorkflowRecord mock — insert accountId after userId -------------
function rewriteWorkflowRecordMocks(src) {
  const stripped = stripComments(src);
  const re = /\buserId:\s*"([^"]+)",/g;
  const positions = [];
  let m;
  while ((m = re.exec(stripped)) !== null)
    positions.push({ idx: m.index, len: m[0].length, val: m[1] });
  let out = src;
  for (let k = positions.length - 1; k >= 0; k--) {
    const { idx, len, val } = positions[k];
    const enclosing = findImmediateEnclosingBrace(stripped, idx);
    if (!enclosing) continue;
    const literal = stripped.slice(enclosing.start, enclosing.end);
    const isWorkflowRecord =
      /\bdraftDefinition:/.test(literal) &&
      /\bstate:/.test(literal) &&
      /\bactiveRevisionId:/.test(literal);
    if (!isWorkflowRecord) continue;
    if (/\baccountId:/.test(literal)) continue;
    let lineStart = idx;
    while (lineStart > 0 && out[lineStart - 1] !== "\n") lineStart--;
    const ind = out.slice(lineStart, idx);
    const insertAt = idx + len;
    const insertion = `\n${ind}accountId: "acct-${val}",`;
    out = out.slice(0, insertAt) + insertion + out.slice(insertAt);
  }
  return out;
}

// ------------- pass 4: IntegrationActionRequiredError test args: userId: → accountId: -------------
function rewriteActionRequiredErrorArgs(src) {
  // The error constructor takes `{ accountId, provider, providerAccountId, reason }`.
  // Test files that passed `{ userId, ... }` need accountId.
  // We don't know full balanced shape; rely on context: replace `userId:` with
  // `accountId:` only when preceded within ~5 lines by `IntegrationActionRequiredError(`.
  // Easier: scan for `new IntegrationActionRequiredError(` and walk forward to find balanced arg.
  let out = src;
  const re = /new IntegrationActionRequiredError\(/g;
  // Walk in reverse to preserve positions.
  const positions = [];
  let m;
  while ((m = re.exec(src)) !== null) positions.push(m.index + m[0].length);
  for (let k = positions.length - 1; k >= 0; k--) {
    const start = positions[k];
    // Find the next `{` opening the arg literal.
    let i = start;
    while (i < src.length && src[i] !== "{") i++;
    if (i >= src.length) continue;
    const end = forwardMatchingBrace(src, i);
    if (end === -1) continue;
    const literal = src.slice(i, end);
    if (!/\buserId:/.test(literal)) continue;
    const rewritten = literal.replace(/\buserId:/, "accountId:");
    out = out.slice(0, i) + rewritten + out.slice(end);
  }
  return out;
}

let changed = 0;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  let out = src;
  out = renameTriggerEventAccountId(out);
  out = rewriteTriggerResourceMocks(out);
  out = rewriteWorkflowRecordMocks(out);
  out = rewriteActionRequiredErrorArgs(out);
  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}
console.log(`Test sweep #2 complete: ${changed} files modified.`);
