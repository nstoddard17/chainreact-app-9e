#!/usr/bin/env node
/**
 * Slice 4.ACCOUNT-MODEL-6c — update test files that build a local
 * NormalizeContext literal using the legacy `accountId:` field name.
 *
 * Restricts the rename to literals that match a NormalizeContext-shape
 * fingerprint (presence of `webhookId:` / `notificationOccurredAt:` /
 * `subscriptionId:` etc.) so we don't accidentally touch unrelated
 * `accountId:` keys.
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
  if (!file.replace(/\\/g, "/").includes("/tests/unit/integrations/")) continue;
  const src = readFileSync(file, "utf8");
  let out = src;
  // Pattern: an object literal that has BOTH `notificationOccurredAt:`
  // AND `accountId:`. Within that literal, rename the `accountId:` key.
  // Heuristic: do it line-by-line where the file uses the fingerprint
  // SOMEWHERE.
  if (
    /notificationOccurredAt:/.test(src) ||
    /\bNormalizeContext\b/.test(src) ||
    /\bNormalizeMailchimpEventInput\b/.test(src)
  ) {
    out = out.replace(/^(\s+)accountId:\s+"/gm, '$1providerAccountId: "');
  }
  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}
console.log(`Normalize test context fix complete: ${changed} files corrected.`);
