#!/usr/bin/env node
/**
 * Slice 4.ACCOUNT-MODEL-6b — resolver fix-up.
 *
 * After the mechanical sweep, ~36 resolver files had:
 *   1. A guard `if (!ctx.integration) throw …` followed by `ctx.integration.X`
 *      references and a top-level `integration.X` reference (the sweep
 *      replaced `userId: ctx.userId,` → `accountId: integration.accountId,`
 *      but the original code did not alias `ctx.integration` to a local
 *      `integration` variable). Result: "Cannot find name 'integration'".
 *   2. A local `const accountId = ctx.integration.providerAccountId;` whose
 *      RHS was over-rewritten by the cutover-fix pass (which rewrote
 *      `integration.providerAccountId` → `integration.accountId` and so
 *      mistakenly walked into `ctx.integration.providerAccountId`). The
 *      shorthand `accountId,` was also renamed to `providerAccountId,` by
 *      the original sweep, but the supporting const wasn't renamed since
 *      it sits OUTSIDE the refreshAndRetry block.
 *
 * Fix:
 *   - Insert `const integration = ctx.integration;` immediately after the
 *     null guard's closing `}` (idempotent — no-op if already present).
 *   - Rename `const accountId = ctx.integration.accountId;` (which used to
 *     read `ctx.integration.providerAccountId`) to
 *     `const providerAccountId = integration.providerAccountId;`.
 *
 * Idempotent.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILES = [
  "integrations/dropbox/options/files.ts",
  "integrations/dropbox/options/folders.ts",
  "integrations/facebook/options/albums.ts",
  "integrations/facebook/options/conversations.ts",
  "integrations/facebook/options/pages.ts",
  "integrations/facebook/options/posts.ts",
  "integrations/google-analytics/options/accounts.ts",
  "integrations/google-analytics/options/conversionEvents.ts",
  "integrations/google-analytics/options/dataStreams.ts",
  "integrations/google-analytics/options/properties.ts",
  "integrations/google-docs/options/documents.ts",
  "integrations/google-drive/options/folders.ts",
  "integrations/google-sheets/options/sheets.ts",
  "integrations/google-sheets/options/spreadsheets.ts",
  "integrations/hubspot/options/dealPipelines.ts",
  "integrations/hubspot/options/dealStages.ts",
  "integrations/hubspot/options/lists.ts",
  "integrations/hubspot/options/owners.ts",
  "integrations/hubspot/options/ticketPipelines.ts",
  "integrations/hubspot/options/ticketStages.ts",
  "integrations/mailchimp/options/audiences.ts",
  "integrations/mailchimp/options/campaigns.ts",
  "integrations/mailchimp/options/segments.ts",
  "integrations/microsoft-excel/options/tables.ts",
  "integrations/microsoft-excel/options/workbooks.ts",
  "integrations/microsoft-excel/options/worksheets.ts",
  "integrations/microsoft-onenote/options/notebooks.ts",
  "integrations/microsoft-onenote/options/pages.ts",
  "integrations/microsoft-onenote/options/sections.ts",
  "integrations/monday/options/boards.ts",
  "integrations/monday/options/columns.ts",
  "integrations/monday/options/fileColumns.ts",
  "integrations/monday/options/groups.ts",
  "integrations/monday/options/itemFiles.ts",
  "integrations/monday/options/items.ts",
  "integrations/monday/options/users.ts",
];

let changed = 0;
for (const rel of FILES) {
  const file = resolve(process.cwd(), rel);
  const src = readFileSync(file, "utf8");
  let out = src;

  // 1. Insert `const integration = ctx.integration;` after the guard if
  //    not already present.
  const aliasMarker = "const integration = ctx.integration;";
  if (!out.includes(aliasMarker)) {
    // Match the guard block — `if (!ctx.integration) { ... }`.
    out = out.replace(
      /(\n(\s*)if \(!ctx\.integration\) \{[\s\S]*?\n\2\})\n/,
      `$1\n\n$2const integration = ctx.integration;\n`,
    );
  }

  // 2. Rename `const accountId = ctx.integration.accountId;` →
  //    `const providerAccountId = integration.providerAccountId;`
  //    (the field was originally `providerAccountId`; over-rewritten).
  out = out.replace(
    /\bconst accountId = ctx\.integration\.accountId;/g,
    "const providerAccountId = integration.providerAccountId;",
  );

  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}
console.log(`Resolver fix-up complete: ${changed} files corrected.`);
