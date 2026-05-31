#!/usr/bin/env node
/**
 * Slice 4.ACCOUNT-MODEL-6c — update pull.ts / receive.ts callers that
 * build a NormalizeContext to use `providerAccountId:` (the renamed
 * field) instead of the legacy `accountId:`.
 *
 * Each producer file (pull.ts / receive.ts) literally constructs a
 * NormalizeContext-shaped object literal with the field name
 * `accountId`. After the NormalizeContext type rename, the producer
 * has to track. The constructed value is sourced from
 * `integration.providerAccountId` (after the prod-bug repair) or
 * `trigger.providerAccountId`. Either source name is fine — only the
 * field name on the producer needs to change.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const FILES = [
  "integrations/airtable/triggers/recordChanged/pull.ts",
  "integrations/google-calendar/triggers/eventChanged/pull.ts",
  "integrations/google-docs/triggers/documentUpdated/pull.ts",
  "integrations/google-docs/triggers/newDocument/pull.ts",
  "integrations/google-drive/triggers/fileChanged/pull.ts",
  "integrations/google-sheets/triggers/newWorksheet/pull.ts",
  "integrations/google-sheets/triggers/rowChanged/pull.ts",
  "integrations/mailchimp/triggers/audienceEvent/receive.ts",
  "integrations/microsoft-onedrive/triggers/fileChanged/pull.ts",
  "integrations/microsoft-outlook-calendar/triggers/eventChanged/pull.ts",
  "integrations/microsoft-outlook/triggers/emailFlagged/pull.ts",
  "integrations/microsoft-outlook/triggers/emailSent/pull.ts",
  "integrations/microsoft-outlook/triggers/newEmail/pull.ts",
  "integrations/microsoft-teams/triggers/newChannelMessage/pull.ts",
];

let changed = 0;
for (const rel of FILES) {
  const file = resolve(process.cwd(), rel);
  if (!existsSync(file)) {
    console.warn(`  skip — not found: ${rel}`);
    continue;
  }
  const src = readFileSync(file, "utf8");
  let out = src;
  // Constrain to "accountId: <expr>," at object-literal-key position,
  // where the surrounding object also has `notificationOccurredAt:`
  // (NormalizeContext fingerprint).
  // For each match, swap `accountId:` for `providerAccountId:`.
  // To be tight, match inside an object literal that ALSO contains
  // `notificationOccurredAt:` shortly before/after.
  out = out.replace(
    /(\{(?:[^{}]|\{[^{}]*\})*?notificationOccurredAt[\s\S]*?)\baccountId:(\s*[^,\n]+,)/g,
    "$1providerAccountId:$2",
  );
  out = out.replace(
    /\baccountId:(\s*[^,\n]+,)(\s*(?:[^{}]|\{[^{}]*\})*?notificationOccurredAt)/g,
    "providerAccountId:$1$2",
  );

  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}
console.log(`Normalize caller producer rename complete: ${changed} files corrected.`);
