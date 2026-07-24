#!/usr/bin/env node
/**
 * 5.DUAL-BUILDER-1 CS-7D — cross-platform runner for the Dual Builder browser
 * journeys, so `npm run e2e:dual-builder[:flag-off]` works on Windows too
 * (no `cross-env` dependency).
 *
 *   node scripts/run-e2e-dual-builder.mjs on   [...extra playwright args]
 *   node scripts/run-e2e-dual-builder.mjs off  [...extra playwright args]
 *
 * `on`  → ENABLE_DOCUMENT_BUILDER=true  (flag-on journey; flag-off case asserts + skips)
 * `off` → ENABLE_DOCUMENT_BUILDER=false (flag-off case; flag-on journey asserts + skips)
 *
 * Runs a single worker (stateful browser journey). The tests themselves assert
 * the expected flag state and FAIL if the wrong app state is running — they do
 * not silently self-skip on the requested side.
 */

import { spawnSync } from "node:child_process";

const mode = process.argv[2];
if (mode !== "on" && mode !== "off") {
  console.error("Usage: node scripts/run-e2e-dual-builder.mjs <on|off> [playwright args]");
  process.exit(1);
}
const extra = process.argv.slice(3);

const env = {
  ...process.env,
  ENABLE_DOCUMENT_BUILDER: mode === "on" ? "true" : "false",
};

// Select ONLY the case for this flag state (grep by tag) so neither important
// case silently self-skips: `on` runs @flag-on, `off` runs @flag-off. The other
// case is exercised by the sibling command in its own process/server.
const grep = mode === "on" ? "@flag-on" : "@flag-off";

const args = [
  "playwright",
  "test",
  "dual-builder-document-journey",
  "--workers=1",
  "--grep",
  grep,
  ...extra,
];

const r = spawnSync("npx", args, {
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});
process.exit(r.status ?? 1);
