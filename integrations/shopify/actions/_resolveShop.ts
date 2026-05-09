import type { TriggerEvent } from "@/contracts/triggerEvent";
import { getActiveForExecution } from "@/repositories/integrations";

/**
 * Resolve the connected shop domain for a Shopify action handler.
 *
 * Slice 12 Commit 3. Two paths:
 *
 *   1. **Shopify-triggered run.** When the run was started by a
 *      Shopify webhook (Slice 12 Commit 4 — `webhook_received`),
 *      `triggerEvent.accountId` is the canonical shop domain because
 *      the OAuth callback wrote it as the integration's
 *      `providerAccountId` (Slice 12 Commit 2). One DB hit avoided.
 *
 *   2. **Cross-provider / manual / scheduled run.** No Shopify
 *      provenance on the trigger event — fall back to looking up
 *      the user's single Shopify integration. Multi-shop users
 *      without Shopify-triggered workflows are not supported in
 *      Batch 1: `getActiveForExecution(..., null)` returns the
 *      first active row arbitrarily, matching V2's documented
 *      contract for ambiguous lookups.
 *
 * The resolved shop is then PINNED as `accountId` when calling
 * `refreshAndRetry` so the dispatcher's row lookup pulls the same
 * integration consistently — no flip-flopping between shops mid-run.
 *
 * **Action config CANNOT override the shop.** This is a deliberate
 * contract per Slice 12 plan §"OAuth model — per-shop validation":
 * the integration row IS the store. There is no `shopify_store`
 * field on any V2 action schema (V1's `STORE_SELECTOR_FIELD` is
 * dropped per Slice 12 plan §"V1 patterns to skip").
 */

export interface ResolveShopInput {
  userId: string;
  triggerEvent: TriggerEvent;
}

export interface ResolveShopOutput {
  /** Full `*.myshopify.com` host. */
  shopDomain: string;
  /**
   * Account discriminator passed to `refreshAndRetry({ accountId })`
   * so the row lookup pins to this exact shop. Always equals
   * `shopDomain` for Shopify; expressed as a separate field to keep
   * the contract clear at the call site.
   */
  accountId: string;
}

export async function resolveShopDomain(
  input: ResolveShopInput,
): Promise<ResolveShopOutput> {
  if (!input.userId) {
    throw new Error("resolveShopDomain: userId is required.");
  }

  // Path 1 — Shopify-triggered run. accountId is already the shop
  // domain (set at OAuth callback time per Commit 2).
  if (
    input.triggerEvent.provider === "shopify" &&
    typeof input.triggerEvent.accountId === "string" &&
    input.triggerEvent.accountId.length > 0
  ) {
    const shopDomain = input.triggerEvent.accountId;
    return { shopDomain, accountId: shopDomain };
  }

  // Path 2 — non-Shopify trigger. Look up the user's Shopify
  // integration row. The resolved providerAccountId IS the shop
  // domain. Pin accountId for refreshAndRetry's row re-fetch.
  const row = await getActiveForExecution(input.userId, "shopify", null);
  if (!row) {
    throw new Error(
      `resolveShopDomain: no active Shopify integration for user ${input.userId}.`,
    );
  }
  return { shopDomain: row.providerAccountId, accountId: row.providerAccountId };
}
