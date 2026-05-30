#!/usr/bin/env node
/**
 * Slice 4.ACCOUNT-MODEL-6b — residual test-file renames.
 *
 * Categories handled:
 *   1. `event.accountId`             → `event.providerAccountId`
 *   2. `result.event.accountId`      → `result.event.providerAccountId`
 *   3. `arg.event.accountId`         → `arg.event.providerAccountId`
 *   4. `.accountId` reads on mockRefreshAndRetry.mock.calls[*][*] —
 *      these read the `accountId` argument; before cutover that was
 *      the provider account id (now `providerAccountId`). Rename.
 *   5. `events[n].accountId`         → `events[n].providerAccountId`
 *   6. `config.snapshot.accountId`   → `config.snapshot.providerAccountId`
 *      (dropbox reconcile snapshot)
 *
 * All scoped to `tests/**`.
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

  // Reads on member-access form: rename common provider-account holders.
  out = out.replace(/\bevent\.accountId\b/g, "event.providerAccountId");
  out = out.replace(/\bresult\.event\.accountId\b/g, "result.event.providerAccountId");
  out = out.replace(/\barg\.event\.accountId\b/g, "arg.event.providerAccountId");
  // `mockRefreshAndRetry.mock.calls[…][…].accountId` reads — provider-account.
  out = out.replace(/mockRefreshAndRetry\.mock\.calls(\[[^\]]+\])(\[[^\]]+\])!?\.accountId\b/g, (match, a, b) =>
    match.replace(".accountId", ".providerAccountId"),
  );
  // `events[n].accountId` reads.
  out = out.replace(/events\[(\d+)\]!?\.accountId\b/g, (match, idx) =>
    match.replace(".accountId", ".providerAccountId"),
  );
  // `events[n]!.accountId` form.
  out = out.replace(/\bevents\b(\[[^\]]+\]!?)\.accountId\b/g, (_match, suffix) =>
    `events${suffix}.providerAccountId`,
  );
  // dropbox snapshot accountId
  out = out.replace(/\bconfig\.snapshot\.accountId\b/g, "config.snapshot.providerAccountId");
  // dropbox normalize helper input
  out = out.replace(/normalizeNewFile\(\{\s*entry,\s*accountId\s*\}\)/g, "normalizeNewFile({ entry, providerAccountId })");

  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}
console.log(`Final test sweep complete: ${changed} files modified.`);
