#!/usr/bin/env node
/**
 * Slice 4.ACCOUNT-MODEL-6c — rename `NormalizeContext.accountId` to
 * `providerAccountId` in the provider normalize.ts files.
 *
 * The 6b prod-bug repair pass restored `providerAccountId:
 * <holder>.providerAccountId` on most slots, but `NormalizeContext.accountId`
 * (a per-file local interface in each provider's normalize.ts) still
 * stored the PROVIDER account id under the name `accountId`. The
 * convention now is: `providerAccountId` everywhere.
 *
 * Per file:
 *   - Rename `accountId: string;` → `providerAccountId: string;` in
 *     `NormalizeContext`-shaped interfaces (heuristic: the interface
 *     contains either `webhookId:` / `notificationOccurredAt:` /
 *     similar normalize-specific keys).
 *   - Rename `accountId,` shorthand destructures inside the file
 *     when it's clearly the local field.
 *   - Rename `ctx.accountId` / `context.accountId` reads.
 *
 * Callers (pull.ts / receive.ts / poll.ts that build the
 * NormalizeContext) get their producer slot renamed too:
 *   `accountId: <integration|trigger>.providerAccountId`
 *   → `providerAccountId: <integration|trigger>.providerAccountId`
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILES = [
  "integrations/_shared/mailchimp/webhooks/normalize.ts",
  "integrations/airtable/triggers/recordChanged/normalize.ts",
  "integrations/google-calendar/triggers/eventChanged/normalize.ts",
  "integrations/google-docs/triggers/documentUpdated/normalize.ts",
  "integrations/google-docs/triggers/newDocument/normalize.ts",
  "integrations/google-drive/triggers/fileChanged/normalize.ts",
  "integrations/google-sheets/triggers/newWorksheet/normalize.ts",
  "integrations/google-sheets/triggers/rowChanged/normalize.ts",
  "integrations/microsoft-onedrive/triggers/fileChanged/normalize.ts",
  "integrations/microsoft-outlook-calendar/triggers/eventChanged/normalize.ts",
  "integrations/microsoft-outlook/triggers/emailFlagged/normalize.ts",
  "integrations/microsoft-outlook/triggers/emailSent/normalize.ts",
  "integrations/microsoft-outlook/triggers/newEmail/normalize.ts",
  "integrations/microsoft-teams/triggers/newChannelMessage/normalize.ts",
];

let changed = 0;
for (const rel of FILES) {
  const file = resolve(process.cwd(), rel);
  const src = readFileSync(file, "utf8");
  let out = src;

  // 1. Rename the type field in NormalizeContext-style interfaces.
  //    The field declaration is `  accountId: string;` (or
  //    `  accountId: string,`). We constrain to the typical location
  //    immediately after `interface` block opening + an identifier
  //    field set.
  out = out.replace(/^(\s+)accountId:\s*string([,;])/gm, "$1providerAccountId: string$2");

  // 2. Rename ctx.accountId / context.accountId reads.
  out = out.replace(/\bctx\.accountId\b/g, "ctx.providerAccountId");
  out = out.replace(/\bcontext\.accountId\b/g, "context.providerAccountId");

  // 3. Rename destructures of `accountId` (when paired with normalize-
  //    context-shape siblings) — only inside this normalize.ts file.
  //    The signatures we care about are typically:
  //      const { webhookId, baseId, accountId, ... } = ctx;
  //      function foo(ctx: NormalizeContext) { const { accountId } = ctx; }
  //    Constrain by requiring `} = ctx;` or `} = input;` shortly after.
  out = out.replace(
    /(\{[^}]*?\b)accountId(\b[^}]*?\}\s*=\s*ctx\b)/g,
    "$1providerAccountId$2",
  );
  out = out.replace(
    /(\{[^}]*?\b)accountId(\b[^}]*?\}\s*=\s*input\b)/g,
    "$1providerAccountId$2",
  );

  // 4. The TriggerEvent literal inside the normalize body uses the
  //    local `accountId` var as a shorthand for the providerAccountId
  //    field. After the rename above, the shorthand needs to be
  //    `providerAccountId,`. We catch the leftover `accountId,` lines
  //    that are surrounded by TriggerEvent literal context.
  out = out.replace(
    /(\n\s+)accountId(,?\s*\n\s+payload:)/g,
    "$1providerAccountId$2",
  );

  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}
console.log(`NormalizeContext rename complete: ${changed} files corrected.`);
