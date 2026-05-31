#!/usr/bin/env node
/**
 * Slice 4.ACCOUNT-MODEL-6c — patch user-id expected values on the V2
 * accountId assertions.
 *
 * The previous sweep renamed `.userId` → `.accountId` on every
 * `refreshAndRetry` argument capture site in integration tests. Those
 * sites still hold the ORIGINAL `"u"` / `"user-1"` / `"u-1"` expected
 * values — left over from the pre-cutover contract where `.userId` rode
 * inside `RefreshAndRetryInput`. Post-cutover the field is `accountId`
 * and the value the handler threads is `input.accountId` (which equals
 * `"acct-u"` / `"acct-user-1"` / `"acct-u-1"` per the test fixtures'
 * `accountId: "acct-<userId>"` convention).
 *
 * Patch the expected literals so they reflect the synthetic V2 account
 * id, restoring the assertion's intent.
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

  // accountId).toBe("u")        → accountId).toBe("acct-u")
  // accountId).toBe("u-1")      → accountId).toBe("acct-u-1")
  // accountId).toBe("user-1")   → accountId).toBe("acct-user-1")
  // accountId).toBe("owner-1")  → accountId).toBe("acct-owner-1")
  // — restricted to short identifiers (no "acct-" prefix already, no
  //   provider-account-shaped values like "alice@x" or "T0001").
  out = out.replace(
    /\.accountId\)\.toBe\("(u|u-\d+|user-\d+|owner-\d+)"\)/g,
    '.accountId).toBe("acct-$1")',
  );

  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}

console.log(`User-id assert patch complete: ${changed} files corrected.`);
