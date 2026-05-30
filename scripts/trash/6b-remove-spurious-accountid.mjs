#!/usr/bin/env node
/**
 * Slice 4.ACCOUNT-MODEL-6b — remove spurious `accountId:` from
 * non-ActionHandlerInput literals in tests.
 *
 * My earlier inline-input sweep inserted `accountId: "acct-<X>",` after
 * any `userId: "<X>",` in tests, including places where the surrounding
 * literal was an AI route event scope (`{ userId, workflowId }`) or a
 * generic options input that has no `accountId` field.
 *
 * Strategy: when the literal is NOT an ActionHandlerInput (fingerprint:
 * `runId:` AND `nodeId:` present) and NOT a WorkflowRecord (`draftDefinition:`)
 * and NOT an Integration mock (`accessTokenEncrypted:`), remove the
 * `accountId:` line we mistakenly inserted.
 *
 * Targeted at the inserted form: `accountId: "acct-<X>",` — a tightly
 * constrained pattern that the V2 ownership field never matched
 * organically in pre-cutover code.
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
  // Find every `accountId: "acct-<X>"` insertion candidate.
  const re = /\baccountId:\s*"acct-([^"]+)"(,?)/g;
  const positions = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    positions.push({ idx: m.index, len: m[0].length });
  }
  // Walk in reverse so deletions don't shift earlier positions.
  for (let k = positions.length - 1; k >= 0; k--) {
    const { idx, len } = positions[k];
    const enclosing = findImmediateEnclosingBrace(out, idx);
    if (!enclosing) continue;
    const literal = out.slice(enclosing.start, enclosing.end);
    const isActionHandlerInput =
      /\brunId:/.test(literal) && /\bnodeId:/.test(literal) && /\btriggerEvent:/.test(literal);
    const isWorkflowRecord = /\bdraftDefinition:/.test(literal);
    const isIntegrationMock = /\baccessTokenEncrypted:/.test(literal);
    if (isActionHandlerInput || isWorkflowRecord || isIntegrationMock) continue;
    // Otherwise — remove the insertion. Trim trailing whitespace on the
    // removed line (which is our own format).
    // Find start of the line containing idx.
    let lineStart = idx;
    while (lineStart > 0 && out[lineStart - 1] !== "\n") lineStart--;
    // Find end (next newline after idx + len).
    let lineEnd = idx + len;
    if (out[lineEnd] === "\n") lineEnd++;
    out = out.slice(0, lineStart) + out.slice(lineEnd);
  }
  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}
console.log(`Spurious accountId removal complete: ${changed} files corrected.`);
