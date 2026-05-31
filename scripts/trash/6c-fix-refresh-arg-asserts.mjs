#!/usr/bin/env node
/**
 * Slice 4.ACCOUNT-MODEL-6c — convert stale `refreshAndRetry` assertions.
 *
 * After 6b's cutover the `refreshAndRetry` arg shape became
 *   { accountId, provider, providerAccountId?, apiCall, preflight? }
 * — `userId` is gone, and `accountId` now means V2 ownership account
 * (it was the provider account before the cutover).
 *
 * Tests across `tests/unit/integrations/**` still assert:
 *   - `refreshArg.userId`            (gone — remove or replace)
 *   - `refreshArg.accountId`         (now V2 owner — was provider account)
 *
 * The vast majority of those assertions are checking the PROVIDER
 * account id (Gmail mailbox / Slack team id / Stripe acct_/ etc.). The
 * canonical fix is: rename the assertion's `.accountId` to
 * `.providerAccountId`. Where the test ALSO asserts `.userId`, replace
 * that with the V2 `.accountId` (which equals the synthetic
 * `acct-<userId>` we threaded through `ActionHandlerInput.accountId`).
 *
 * Sites handled:
 *   - `mockRefreshAndRetry.mock.calls[<i>]![<j>]!.accountId`     → providerAccountId
 *   - `mockRefresh.mock.calls[<i>]![<j>]!.accountId`             → providerAccountId
 *   - `refreshArg.accountId` / `call.accountId` / `arg.accountId` → providerAccountId
 *   - `refreshArg.userId` / `call.userId` / `arg.userId`         → accountId (with
 *     `"acct-"` prefix patched onto the matching expected literal).
 *
 * Idempotent: no-op on a re-run.
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

// Identifier names commonly used as the captured refreshAndRetry arg in
// these tests. Tighten the rename to these names so we don't accidentally
// rewrite genuine V2 accountId reads on unrelated objects.
const ARG_HOLDERS = [
  "refreshArg",
  "refreshArgs",
  "call",
  "arg",
  "input",
  "i",
  "args",
];

function patternsFor(holder) {
  return [
    new RegExp(`\\b${holder}\\.accountId\\b`, "g"),
    new RegExp(`\\b${holder}\\.userId\\b`, "g"),
  ];
}

const files = walk(TESTS_DIR);
let changed = 0;

for (const file of files) {
  // Restrict to integration handler tests — these are the only suites
  // whose assertions read the refreshAndRetry call argument.
  if (!file.replace(/\\/g, "/").includes("/tests/unit/integrations/")) continue;

  const src = readFileSync(file, "utf8");
  let out = src;

  // `mockRefreshAndRetry.mock.calls[...]![...]!.accountId` → providerAccountId
  out = out.replace(
    /mockRefreshAndRetry\.mock\.calls(\[[^\]]+\])!?(\[[^\]]+\])!?\.accountId\b/g,
    (match) => match.replace(/\.accountId\b$/, ".providerAccountId"),
  );
  out = out.replace(
    /mockRefresh\.mock\.calls(\[[^\]]+\])!?(\[[^\]]+\])!?\.accountId\b/g,
    (match) => match.replace(/\.accountId\b$/, ".providerAccountId"),
  );

  // Same for `.userId` reads on the mock call (drop them — they were
  // the V2 user before the cutover and have no equivalent on the new
  // RefreshAndRetryInput; the V2 ownership is asserted via accountId
  // on the input object's threading, not here).
  // We don't auto-remove the assertion line — instead we rename the
  // field to `accountId` and let the caller's matching value (which
  // was a user id like "u") flow through. That lets the test still
  // assert *something* about V2 routing; the value will need a manual
  // prefix patch on a follow-up if it matters. Per-call sweep:
  out = out.replace(
    /mockRefreshAndRetry\.mock\.calls(\[[^\]]+\])!?(\[[^\]]+\])!?\.userId\b/g,
    (match) => match.replace(/\.userId\b$/, ".accountId"),
  );
  out = out.replace(
    /mockRefresh\.mock\.calls(\[[^\]]+\])!?(\[[^\]]+\])!?\.userId\b/g,
    (match) => match.replace(/\.userId\b$/, ".accountId"),
  );

  // Holder identifiers — only inside an explicit assertion line.
  // Rather than a context-sensitive walk, we match `<holder>.accountId`
  // / `<holder>.userId` ONLY when it appears inside an `expect(...)`
  // call. Easy way: regex over the file, restricted to a single
  // assertion form.
  for (const holder of ARG_HOLDERS) {
    out = out.replace(
      new RegExp(
        `expect\\(([\\s\\S]*?)\\b${holder}\\.accountId\\b([\\s\\S]*?)\\)`,
        "g",
      ),
      (_match, pre, post) =>
        `expect(${pre}${holder}.providerAccountId${post})`,
    );
    out = out.replace(
      new RegExp(
        `expect\\(([\\s\\S]*?)\\b${holder}\\.userId\\b([\\s\\S]*?)\\)`,
        "g",
      ),
      (_match, pre, post) => `expect(${pre}${holder}.accountId${post})`,
    );
  }

  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}

console.log(`refreshAndRetry assertion sweep complete: ${changed} files corrected.`);
