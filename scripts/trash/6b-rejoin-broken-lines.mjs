#!/usr/bin/env node
/**
 * Slice 4.ACCOUNT-MODEL-6b — undo the over-aggressive line removal
 * from `6b-remove-spurious-accountid.mjs`.
 *
 * Joins lines where a `userId: "<X>",` line is followed by a line
 * starting with ` workflowId:`. The earlier script removed the inline
 * `accountId: "acct-<X>",` from those literals, but because the
 * literal was a SINGLE LINE rather than multi-line, the removal cut
 * the line in two and left dangling fragments.
 *
 * Idempotent — only joins when the next line's leading whitespace is
 * a single space (a tell of the bad split).
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
  // Match `userId: "<X>",\n workflowId:` (with single space before workflowId
  // — the bad-split fingerprint) and rejoin to `userId: "<X>", workflowId:`.
  const out = src.replace(
    /\b(userId:\s*"[^"]+",)\n\s(workflowId:)/g,
    "$1 $2",
  );
  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}
console.log(`Rejoin broken lines complete: ${changed} files corrected.`);
