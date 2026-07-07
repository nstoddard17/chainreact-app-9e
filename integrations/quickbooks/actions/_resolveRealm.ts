import type { TriggerEvent } from "@/contracts/triggerEvent";
import { getActiveForExecution } from "@/repositories/integrations";

/**
 * Resolve the QuickBooks company (realmId) for an action run —
 * QUICKBOOKS-1. Mirrors `shopify/actions/_resolveShop.ts`: the
 * integration row IS the company; there is no company-selector field on
 * any V2 action schema.
 *
 * Path 1 — QuickBooks-triggered run: the trigger event's
 * `providerAccountId` is already the realmId (set by the webhook
 * normalizer), so the action operates on the SAME company that fired
 * the trigger — even when the account has multiple companies connected.
 *
 * Path 2 — non-QuickBooks trigger: look up the workflow account's
 * QuickBooks integration row (earliest-connected wins deterministically
 * when several companies are connected — the repository's documented
 * ordering). The resolved providerAccountId IS the realmId; it is
 * pinned back into `refreshAndRetry({ providerAccountId })` so the row
 * re-fetch can't drift to another company.
 */

export interface ResolveRealmInput {
  accountId: string;
  triggerEvent: TriggerEvent;
}

export interface ResolveRealmOutput {
  realmId: string;
  /** Always equals realmId — explicit for clarity at call sites. */
  providerAccountId: string;
}

export async function resolveRealm(
  input: ResolveRealmInput,
): Promise<ResolveRealmOutput> {
  if (!input.accountId) {
    throw new Error("resolveRealm: accountId is required.");
  }

  if (
    input.triggerEvent.provider === "quickbooks" &&
    typeof input.triggerEvent.providerAccountId === "string" &&
    input.triggerEvent.providerAccountId.length > 0
  ) {
    const realmId = input.triggerEvent.providerAccountId;
    return { realmId, providerAccountId: realmId };
  }

  const row = await getActiveForExecution(input.accountId, "quickbooks", null);
  if (!row) {
    throw new Error(
      `resolveRealm: no active QuickBooks integration for account ${input.accountId}.`,
    );
  }
  return {
    realmId: row.providerAccountId,
    providerAccountId: row.providerAccountId,
  };
}
