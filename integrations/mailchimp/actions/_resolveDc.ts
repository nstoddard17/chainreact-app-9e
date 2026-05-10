import type { TriggerEvent } from "@/contracts/triggerEvent";
import { getActiveForExecution } from "@/repositories/integrations";
import { MissingDataCenterError } from "@/integrations/_shared/mailchimp/errors";

/**
 * Resolve the Mailchimp `dc` + `accountId` for an action handler.
 *
 * Slice 14 Commit 3. Mirrors Shopify's [`_resolveShop.ts`](../../shopify/actions/_resolveShop.ts)
 * shape — every action handler needs the integration row's
 * `(dc, providerAccountId)` pair before any wrapper call. dc routes
 * the API host (`https://${dc}.api.mailchimp.com/...`); accountId
 * pins the `refreshAndRetry` row lookup so the same integration is
 * used end-to-end through the action.
 *
 * Two paths:
 *
 *   1. **Mailchimp-triggered run.** When the run was started by a
 *      Mailchimp webhook trigger (Slice 14 Commit 4) or polling
 *      trigger (Slice 14 Commit 5), `triggerEvent.accountId` is the
 *      Mailchimp `account_id` because the OAuth callback wrote it as
 *      the integration's `providerAccountId` (Slice 14 Commit 2). We
 *      still hit the DB once because dc lives only on the integration
 *      row's `accountMetadata`, NOT on the trigger event (different
 *      from Shopify, where the shop domain IS the accountId and no
 *      extra DB hit is needed).
 *
 *   2. **Cross-provider / manual / scheduled run.** No Mailchimp
 *      provenance on the trigger event — fall back to the user's
 *      single Mailchimp integration. Multi-account users without
 *      Mailchimp-triggered workflows are not supported in Batch 1:
 *      `getActiveForExecution(..., null)` returns the first active
 *      row arbitrarily, matching V2's documented contract for
 *      ambiguous lookups.
 *
 * The resolved (dc, accountId) is then PINNED into the call site so
 * `refreshAndRetry`'s row re-fetch lands on the same integration and
 * the wrapper's URL points at the right datacenter. No
 * flip-flopping between accounts mid-run.
 *
 * **Action config CANNOT override the dc.** This is a deliberate
 * contract per Slice 14 plan §"Confirmed scope decisions §6": the
 * integration row IS the account. There is no `dc` field on any V2
 * action schema (V1 stores it only on integration metadata too —
 * V1's [`utils.ts:11-88`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/utils.ts#L11)
 * resolves dc from the integration row).
 *
 * Throws `MissingDataCenterError` when the integration's
 * `accountMetadata.dc` is missing or not a string. Fail loud — the
 * user sees a "reconnect Mailchimp" prompt rather than silent
 * routing to `https://undefined.api.mailchimp.com/...`.
 */

export interface ResolveDcInput {
  userId: string;
  triggerEvent: TriggerEvent;
}

export interface ResolveDcOutput {
  /** Datacenter prefix (e.g. `"us21"`). REQUIRED for every API call. */
  dc: string;
  /**
   * Mailchimp `account_id` — stable identifier used as
   * `refreshAndRetry({ accountId })` so the row lookup pins to the
   * same integration. Matches the integration row's
   * `providerAccountId`.
   */
  accountId: string;
}

export async function resolveDc(
  input: ResolveDcInput,
): Promise<ResolveDcOutput> {
  if (!input.userId) {
    throw new Error("resolveDc: userId is required.");
  }

  // Resolve accountId hint from the trigger event (if any).
  const accountIdHint =
    input.triggerEvent.provider === "mailchimp" &&
    typeof input.triggerEvent.accountId === "string" &&
    input.triggerEvent.accountId.length > 0
      ? input.triggerEvent.accountId
      : null;

  // Always look up the row — dc lives only on accountMetadata.
  const row = await getActiveForExecution(
    input.userId,
    "mailchimp",
    accountIdHint,
  );
  if (!row) {
    throw new Error(
      `resolveDc: no active Mailchimp integration for user ${input.userId}${
        accountIdHint !== null ? ` account ${accountIdHint}` : ""
      }.`,
    );
  }

  const dc = row.accountMetadata.dc;
  if (typeof dc !== "string" || dc.length === 0) {
    throw new MissingDataCenterError();
  }

  return { dc, accountId: row.providerAccountId };
}
