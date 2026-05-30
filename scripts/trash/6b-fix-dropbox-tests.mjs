#!/usr/bin/env node
/**
 * Slice 4.ACCOUNT-MODEL-6b — restore dropbox-actions test files.
 *
 * The earlier remove-spurious-accountid script chopped the leading
 * `  return { workflowId: "wf", userId: "u", accountId: "acct-u",` off
 * the `input()` helper in each dropbox action test, leaving a dangling
 * line of the form `^ runId: "r", nodeId: "n", config, triggerEvent };`.
 *
 * Restore the full literal.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

const dir = resolve(process.cwd(), "tests/unit/integrations/dropbox/actions");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".test.ts"))
  .map((f) => join(dir, f));

let changed = 0;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  const out = src.replace(
    /^ runId:\s*"r",\s*nodeId:\s*"n",\s*config,\s*triggerEvent\s*\};/m,
    '  return { workflowId: "wf", userId: "u", accountId: "acct-u", runId: "r", nodeId: "n", config, triggerEvent };',
  );
  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}
console.log(`Dropbox tests restored: ${changed} files corrected.`);
