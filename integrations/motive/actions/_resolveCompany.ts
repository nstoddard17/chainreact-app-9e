import type { TriggerEvent } from "@/contracts/triggerEvent";
import { getActiveForExecution } from "@/repositories/integrations";

/**
 * Resolve the Motive company (providerAccountId) for an action run — MOTIVE-1.
 * Mirrors `quickbooks/actions/_resolveRealm.ts`, but a Motive access token is
 * ALREADY company-scoped, so this only pins the right integration row for
 * `refreshAndRetry` when several companies are connected — there is no company
 * path/query param on any call.
 *
 * Path 1 — Motive-triggered run: the trigger event's `providerAccountId` is the
 * companyId (set by the webhook normalizer / poller), so the action operates on
 * the SAME company that fired the trigger.
 *
 * Path 2 — non-Motive trigger: look up the workflow account's Motive
 * integration row (earliest-connected wins deterministically). The resolved
 * providerAccountId is pinned back into `refreshAndRetry` so the row re-fetch
 * can't drift to another company.
 */

export interface ResolveCompanyInput {
  accountId: string;
  triggerEvent: TriggerEvent;
}

export async function resolveCompany(input: ResolveCompanyInput): Promise<{
  providerAccountId: string;
}> {
  if (!input.accountId) {
    throw new Error("resolveCompany: accountId is required.");
  }

  if (
    input.triggerEvent.provider === "motive" &&
    typeof input.triggerEvent.providerAccountId === "string" &&
    input.triggerEvent.providerAccountId.length > 0
  ) {
    return { providerAccountId: input.triggerEvent.providerAccountId };
  }

  const row = await getActiveForExecution(input.accountId, "motive", null);
  if (!row) {
    throw new Error(
      `resolveCompany: no active Motive integration for account ${input.accountId}.`,
    );
  }
  return { providerAccountId: row.providerAccountId };
}
