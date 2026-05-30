#!/usr/bin/env node
/**
 * Restore the V2 ownership `accountId:` field in facebook action test
 * inline ActionHandlerInput literals (the renameTriggerEventAccountId
 * walker mistakenly tracked them through nested TriggerEvent payloads
 * because the outer literal contains all the TriggerEvent keys nested
 * inside `triggerEvent: { ... }`).
 *
 * Pattern:
 *   workflowId: "wf", userId: "<X>", providerAccountId: "acct-<X>",
 *   →
 *   workflowId: "wf", userId: "<X>", accountId: "acct-<X>",
 *
 * Idempotent — no-op if the literal already says `accountId:`.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

const dir = resolve(process.cwd(), "tests/unit/integrations/facebook/actions");
const files = readdirSync(dir).filter((f) => f.endsWith(".test.ts")).map((f) => join(dir, f));

let changed = 0;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  let out = src;
  out = out.replace(
    /(workflowId:\s*"[^"]+",\s*userId:\s*"([^"]+)",)\s*providerAccountId:\s*"([^"]+)",/g,
    (_match, prefix, userVal, acctVal) => `${prefix} accountId: "${acctVal}",`,
  );
  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}
console.log(`Facebook actions test fix complete: ${changed} files corrected.`);
