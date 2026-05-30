#!/usr/bin/env node
/**
 * Slice 4.ACCOUNT-MODEL-6b — trello/onedrive/teams/hubspot/excel test fix.
 *
 *   workflowId: "X",
 *   runId: "Y",
 *   nodeId: "Z",
 *   userId: "U",
 *
 * needs `accountId: "acct-U",` inserted after the userId line.
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
  const lines = src.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    out.push(line);
    // After a `userId: "X",` line, if the previous lines (within 4)
    // contain `workflowId:` AND `nodeId:`, and the next line is NOT
    // already an `accountId:`, insert one.
    const userMatch = line.match(/^(\s+)userId:\s*"([^"]+)",\s*$/);
    if (userMatch) {
      const ind = userMatch[1];
      const val = userMatch[2];
      // Scan prior 4 lines for workflowId
      let hasWorkflow = false;
      let hasNode = false;
      for (let j = 1; j <= 4 && i - j >= 0; j++) {
        if (/^\s+workflowId:/.test(lines[i - j])) hasWorkflow = true;
        if (/^\s+nodeId:/.test(lines[i - j])) hasNode = true;
      }
      const next = lines[i + 1] ?? "";
      const alreadyHas = /^\s+accountId:/.test(next);
      if (hasWorkflow && hasNode && !alreadyHas) {
        out.push(`${ind}accountId: "acct-${val}",`);
      }
    }
  }
  const joined = out.join("\n");
  if (joined !== src) {
    writeFileSync(file, joined);
    changed++;
  }
}
console.log(`Trello-style ActionHandlerInput fix complete: ${changed} files corrected.`);
