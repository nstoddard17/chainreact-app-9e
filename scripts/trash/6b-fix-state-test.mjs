#!/usr/bin/env node
/**
 * Slice 4.ACCOUNT-MODEL-6b — state.test.ts fix.
 *
 * createState({ userId, provider, requestedScopes, ... }) now requires
 * accountId. Insert accountId in every createState call site.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const file = resolve(process.cwd(), "tests/unit/services/oauth/state.test.ts");
const src = readFileSync(file, "utf8");
let out = src;
// Inline `{ userId: "X", provider:` — add accountId between.
out = out.replace(
  /\{\s*userId:\s*"([^"]+)",(?!\s*accountId:)(\s*provider:)/g,
  (_match, val, after) => `{ userId: "${val}", accountId: "acct-${val}",${after}`,
);
// Multi-line `userId: "X",\n  provider:` — same insertion.
out = out.replace(
  /\buserId:\s*"([^"]+)",(?!\s*accountId:)\s*\n(\s+)provider:/g,
  (_match, val, ws) => `userId: "${val}",\n${ws}accountId: "acct-${val}",\n${ws}provider:`,
);
if (out !== src) {
  writeFileSync(file, out);
  console.log("state.test.ts updated.");
} else {
  console.log("state.test.ts no changes.");
}
