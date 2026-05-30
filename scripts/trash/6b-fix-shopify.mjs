#!/usr/bin/env node
/**
 * Slice 4.ACCOUNT-MODEL-6b — Shopify action fix-up.
 *
 *   const { shopDomain, accountId } = await resolveShopDomain({
 *     userId: input.userId,
 *     triggerEvent: input.triggerEvent,
 *   });
 *
 * →
 *
 *   const { shopDomain, providerAccountId } = await resolveShopDomain({
 *     accountId: input.accountId,
 *     userId: input.userId,
 *     triggerEvent: input.triggerEvent,
 *   });
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const dir = resolve(process.cwd(), "integrations/shopify/actions");
const files = readdirSync(dir)
  .filter(
    (f) =>
      f.endsWith(".ts") && !f.endsWith(".schema.ts") && f !== "_resolveShop.ts",
  )
  .map((f) => join(dir, f));

let changed = 0;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  let out = src;
  out = out.replace(
    /\bconst \{ shopDomain, accountId \} = await resolveShopDomain\(/g,
    "const { shopDomain, providerAccountId } = await resolveShopDomain(",
  );
  out = out.replace(
    /resolveShopDomain\(\{(\s*)userId: input\.userId,(\s*)triggerEvent: input\.triggerEvent,(\s*)\}\)/g,
    (_match, ws1, ws2, ws3) =>
      `resolveShopDomain({${ws1}accountId: input.accountId,${ws1}userId: input.userId,${ws2}triggerEvent: input.triggerEvent,${ws3}})`,
  );
  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}
console.log(`Shopify fix-up complete: ${changed} files corrected.`);
