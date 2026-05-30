#!/usr/bin/env node
/**
 * Slice 4.ACCOUNT-MODEL-6b — local `accountId` const rename in polling /
 * reconcile handlers.
 *
 * Polling handlers commonly use a local `const accountId = integration.<X>;`
 * to hold the *provider* account id (Gmail's email address, Mailchimp's
 * mailchimp account_id, OneNote's user id, etc.). The const is then
 * passed to refreshAndRetry as `accountId,` shorthand and threaded into
 * helper functions + TriggerEvent constructions.
 *
 * After the main sweep, `refreshAndRetry({ accountId: ..., providerAccountId })`
 * expects a local `providerAccountId` — but the const is still named
 * `accountId`. The cutover-fix pass also broke the RHS reading
 * `integration.providerAccountId` (over-rewrote → `integration.accountId`).
 *
 * Fix per file:
 *   - `const accountId = integration.accountId;`
 *     → `const providerAccountId = integration.providerAccountId;`
 *   - Subsequent local references named `accountId` in the same file get
 *     renamed to `providerAccountId` — both shorthand (`{ accountId }`)
 *     and dotted reference patterns. The fix is scoped per-file so it
 *     does NOT affect any nearby `input.accountId` / `workflow.accountId`
 *     / `dispatchInfo.accountId` (V2 ownership).
 *
 * Scope is intentionally narrow: only files that have the matching
 * `const accountId = integration.accountId;` line are touched. Files
 * without that line are untouched.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILES = [
  "integrations/dropbox/triggers/newFile/reconcile.ts",
  "integrations/mailchimp/triggers/campaignCreated/poll.ts",
  "integrations/mailchimp/triggers/emailOpened/poll.ts",
  "integrations/mailchimp/triggers/linkClicked/poll.ts",
  "integrations/mailchimp/triggers/newAudience/poll.ts",
  "integrations/mailchimp/triggers/segmentUpdated/poll.ts",
  "integrations/mailchimp/triggers/subscriberAddedToSegment/poll.ts",
  "integrations/microsoft-excel/triggers/_shared/pollingHandler.ts",
  "integrations/microsoft-onenote/triggers/newNote/poll.ts",
  "integrations/microsoft-onenote/triggers/updatedNote/poll.ts",
];

let changed = 0;
for (const rel of FILES) {
  const file = resolve(process.cwd(), rel);
  const src = readFileSync(file, "utf8");
  if (!src.includes("const accountId = integration.accountId;")) continue;

  let out = src;

  // 1. Rename the const declaration + the RHS field name back to the
  //    real IntegrationRecord field.
  out = out.replace(
    /\bconst accountId = integration\.accountId;/g,
    "const providerAccountId = integration.providerAccountId;",
  );

  // 2. Within THIS file, rename the local variable `accountId` to
  //    `providerAccountId`. Only at LITERAL positions where the
  //    identifier `accountId` appears as a standalone token — not
  //    qualified (e.g. `input.accountId`, `workflow.accountId`,
  //    `dispatchInfo.accountId`, `trigger.workflowAccountId`).
  //
  //    Strategy: replace every `\baccountId\b` whose immediately
  //    preceding character is NOT `.` (so member-access stays intact)
  //    and whose immediately following character is NOT `:` (so we
  //    don't rename OBJECT-LITERAL KEYS — those are the refreshAndRetry
  //    `accountId:` V2 ownership key + the TriggerEvent literal's key,
  //    which already got renamed at the type layer).
  //
  //    Exception: TriggerEvent literal key `accountId,` (shorthand)
  //    has the LOCAL var as both key + value — we DO want to rename
  //    those to `providerAccountId,` so the TriggerEvent's field name
  //    is correct. But those become shorthand only AFTER the
  //    accountId field on TriggerEvent is renamed (done by the
  //    TriggerEvent rename pass earlier). The remaining `accountId,`
  //    shorthand we see today is therefore the LOCAL-VAR shorthand —
  //    rename freely.
  out = out.replace(
    /(?<![A-Za-z0-9_.])accountId(?![A-Za-z0-9_:])/g,
    "providerAccountId",
  );

  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}
console.log(`Polling/reconcile fix-up complete: ${changed} files corrected.`);
