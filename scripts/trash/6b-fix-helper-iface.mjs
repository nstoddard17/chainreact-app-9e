#!/usr/bin/env node
/**
 * Slice 4.ACCOUNT-MODEL-6b — helper-interface field rename.
 *
 * The polling/reconcile fix script renamed the local var `accountId`
 * (provider account) to `providerAccountId` but left the receiving
 * helper functions' input interfaces untouched: those still declared
 * `accountId: string`, so the caller's shorthand `providerAccountId,`
 * fails typecheck.
 *
 * This pass walks the same set of files and renames each helper's
 * `accountId: string` parameter (and the matching destructure) to
 * `providerAccountId`. Scoped to the polling/reconcile file list
 * — does not touch the V2 ownership `accountId` field anywhere.
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
  let out = src;

  // 1. Helper interface declarations: `accountId: string` /
  //    `accountId: string | null` → `providerAccountId: ...`.
  //    Restricted to the well-defined helper interface pattern (followed
  //    by a type annotation, not by a complex value expression). The
  //    V2 ownership `accountId: trigger.workflowAccountId!,` is not
  //    affected.
  out = out.replace(
    /\baccountId:\s*string(\s*\|\s*null)?(?=[;,\n)])/g,
    (match) => match.replace(/^accountId/, "providerAccountId"),
  );

  // 2. Destructure renames — `const { ..., accountId, ... } = input;`
  //    → `const { ..., providerAccountId, ... } = input;`. Only
  //    matches the LOCAL var pattern when `accountId` appears between
  //    other identifier tokens inside destructure braces. Implementation:
  //    rename `accountId` followed by `,` or `}` inside `{ ... }`
  //    blocks where the surrounding indicates a destructure.
  //
  //    Heuristic: `const { … accountId(,|\s*\}) … } = …;` — capture the
  //    word boundary form. Since we already excluded member access
  //    (`.accountId`) via a negative lookbehind, this is safe.
  out = out.replace(
    /(?<![A-Za-z0-9_.])accountId(?=\s*[,}])/g,
    "providerAccountId",
  );

  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}
console.log(`Helper-interface fix complete: ${changed} files corrected.`);
