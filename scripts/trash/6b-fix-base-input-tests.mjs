#!/usr/bin/env node
/**
 * Slice 4.ACCOUNT-MODEL-6b — `baseInput`/`baseHandlerInput` test fixture
 * insertion.
 *
 * Many tests define a shared `const baseInput = { workflowId, userId,
 * runId, nodeId, triggerEvent }` and spread it. Insert `accountId:
 * "acct-<userId>",` after `userId` when missing.
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

  // Pattern: multi-line object literal, contains `workflowId:`, `userId:`,
  // `runId:`, `nodeId:`, `triggerEvent`. Insert accountId after userId
  // (matching indentation) if not already present.
  // We use a narrow regex that targets the helper-fixture form:
  //   workflowId: "wf",
  //   userId: "u",
  //   runId: "r",
  //   nodeId: "n",
  //   triggerEvent[,?]
  out = out.replace(
    /(workflowId:\s*"[^"]+",\s*\n)(\s+)(userId:\s*"([^"]+)",)(\s*\n)(\s+)runId:/g,
    (_m, wf, ind, userLine, val, after, ind2) =>
      `${wf}${ind}${userLine}${after}${ind2}accountId: "acct-${val}",${after}${ind2}runId:`,
  );

  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}
console.log(`Base-input fix complete: ${changed} files corrected.`);
