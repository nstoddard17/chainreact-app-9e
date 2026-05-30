#!/usr/bin/env node
/**
 * Slice 4.ACCOUNT-MODEL-6b — handle inline ActionHandlerInput literals.
 *
 * Some test files build the input via a single-line object expression:
 *   { workflowId: "wf", userId: "u", runId: "r", nodeId: "n", config, triggerEvent }
 *
 * The earlier line-based sweep needed a newline after `userId:` to fire.
 * This script handles the inline form: insert `accountId: "acct-<userId>",`
 * immediately after `userId: "<X>",` when found on a single-line literal
 * that also mentions `runId:` and `nodeId:` in the same line/range.
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
  const src = readFileSync(file, "utf8");
  let out = src;
  // Pattern: `workflowId: "wf", userId: "u", runId:` (or any order with workflowId before userId).
  out = out.replace(
    /\bworkflowId:\s*"[^"]+",\s*userId:\s*"([^"]+)",(?!\s*accountId:)(?=\s*runId:)/g,
    (match, val) => `${match.replace(/userId: "([^"]+)",/, `userId: "${val}", accountId: "acct-${val}",`)}`,
  );
  // Also handle `userId: "u", workflowId: "wf"` order (less common but possible).
  out = out.replace(
    /\buserId:\s*"([^"]+)",(?!\s*accountId:)(\s*(?:workflowId|runId|nodeId):)/g,
    (match, val, after) => `userId: "${val}", accountId: "acct-${val}",${after}`,
  );
  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}
console.log(`Inline ActionHandlerInput fix complete: ${changed} files corrected.`);
