#!/usr/bin/env node
/**
 * Slice 4.ACCOUNT-MODEL-6b — Mailchimp action fix-up.
 *
 * Mailchimp actions destructure `{ dc, accountId }` from `resolveDc()`, where
 * the second field was the provider's mailchimp account_id. The output type
 * was renamed to `{ dc, providerAccountId }` in this slice; the call sites
 * need to follow.
 *
 *   const { dc, accountId } = await resolveDc({ userId: input.userId, triggerEvent });
 *
 *   →
 *
 *   const { dc, providerAccountId } = await resolveDc({
 *     accountId: input.accountId,
 *     userId: input.userId,
 *     triggerEvent: input.triggerEvent,
 *   });
 *
 * Idempotent.
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const dir = resolve(process.cwd(), "integrations/mailchimp/actions");

const files = readdirSync(dir)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".schema.ts") && f !== "_resolveDc.ts")
  .map((f) => join(dir, f));

let changed = 0;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  let out = src;

  // Destructuring rename
  out = out.replace(
    /\bconst \{ dc, accountId \} = await resolveDc\(/g,
    "const { dc, providerAccountId } = await resolveDc(",
  );

  // Caller input rename — the original sweep already swapped userId →
  // accountId inside refreshAndRetry blocks, but resolveDc's input wasn't
  // changed. Insert accountId: input.accountId, before userId.
  out = out.replace(
    /resolveDc\(\{(\s*)userId: input\.userId,(\s*)triggerEvent: input\.triggerEvent,(\s*)\}\)/g,
    (_match, ws1, ws2, ws3) =>
      `resolveDc({${ws1}accountId: input.accountId,${ws1}userId: input.userId,${ws2}triggerEvent: input.triggerEvent,${ws3}})`,
  );

  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}
console.log(`Mailchimp fix-up complete: ${changed} files corrected.`);
