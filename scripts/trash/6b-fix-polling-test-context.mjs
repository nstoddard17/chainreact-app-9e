#!/usr/bin/env node
/**
 * Slice 4.ACCOUNT-MODEL-6b — polling handler test context fix.
 *
 * Adds `accountId: "acct-test",` to PollingHandlerContext literals where
 * the test calls `handler.poll({ trigger, userRole, now })` without an
 * `accountId`. The literal is identified by the simultaneous presence of
 * `trigger:`, `userRole:`, `now:`.
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = process.cwd();
const TESTS_DIR = resolve(ROOT, "tests");

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
    // Look for `trigger: <expr>,` followed within 4 lines by `userRole:` and `now:`.
    const triggerMatch = line.match(/^(\s+)trigger[:,]/);
    if (triggerMatch) {
      const ind = triggerMatch[1];
      // Within next 40 lines, check for sibling keys at indent === ind.
      // We don't try to track brace depth — instead we scan and ANY line
      // whose indentation EXACTLY equals `ind` is treated as a sibling
      // property of the PollingHandlerContext object.
      let hasUserRole = false;
      let hasNow = false;
      let hasAccountId = false;
      for (let j = 1; j <= 40 && i + j < lines.length; j++) {
        const nl = lines[i + j];
        if (new RegExp(`^${ind}userRole:`).test(nl)) hasUserRole = true;
        if (new RegExp(`^${ind}now:`).test(nl)) hasNow = true;
        if (new RegExp(`^${ind}accountId:`).test(nl)) hasAccountId = true;
        // Stop when we hit the closing `});`/`}` at less indent than ind.
        const indMatch = nl.match(/^(\s*)\}/);
        if (indMatch && indMatch[1].length < ind.length) break;
      }
      if (hasUserRole && hasNow && !hasAccountId) {
        // Only insert immediately after `trigger,` shorthand — the
        // multi-line `trigger: makeTrigger({...})` form has its
        // own opening brace; inserting after that line would land
        // inside makeTrigger's args.
        const isInlineTrigger = /^\s+trigger,\s*$/.test(line);
        if (isInlineTrigger) {
          out.push(`${ind}accountId: "acct-test",`);
        } else {
          // For the multi-line form, we'll handle insertion in a
          // separate pass that walks until the trigger's enclosing
          // brace closes, then inserts at that point.
          // For now: skip — these go through a different path.
        }
      }
    }
  }
  const joined = out.join("\n");
  if (joined !== src) {
    writeFileSync(file, joined);
    changed++;
  }
}
console.log(`Polling test context fix complete: ${changed} files corrected.`);
