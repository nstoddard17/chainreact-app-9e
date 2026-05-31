import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { DeactivationFn } from "@/services/triggers/deactivationRegistry";
import { listByConfigContains } from "@/repositories/triggerResources";
import { getPageAccessToken } from "@/integrations/_shared/facebook/api/getPageAccessToken";
import { unsubscribePageFromApp } from "@/integrations/_shared/facebook/api/subscribedApps";
import { NotFoundError } from "@/integrations/_shared/facebook/errors";

/**
 * Shared deactivation hook for the Facebook Page webhook triggers —
 * Slice 3.FACEBOOK-5.
 *
 * **Reference-count-safe (the shared-subscription concern).**
 * `subscribed_apps` is PAGE-level, not per-workflow: unsubscribing breaks
 * EVERY app workflow watching that Page. So this hook unsubscribes ONLY when
 * no OTHER Facebook trigger row still references the same `pageId`:
 *
 *   1. `listByConfigContains({ pageId })` finds every trigger row (any
 *      event type) whose JSONB config carries this `pageId`.
 *   2. Exclude the workflow being deactivated (its own rows are about to be
 *      deleted by `lifecycle.unregisterWorkflowTriggers`, which runs this
 *      hook BEFORE `deleteByWorkflow`). Keep only `provider === "facebook"`.
 *   3. If ANY survive → another workflow still watches this Page → DO NOT
 *      unsubscribe (local row deletion only). Worst case is a benign
 *      orphaned subscription (events fan out to zero active rows and drop),
 *      never a broken sibling workflow.
 *   4. If none survive → this is the last reference → best-effort
 *      `DELETE /{pageId}/subscribed_apps`.
 *
 * Best-effort remote call (housekeeping; never blocks the disable/delete):
 *   - `NotFoundError` / `Unauthorized401Error` → swallow (already gone /
 *     token dead — re-auth won't help).
 *   - other errors propagate; the lifecycle orchestrator catches + logs and
 *     still deletes the trigger_resources row.
 *
 * Page tokens are derived at runtime (`getPageAccessToken`) and never logged.
 */
export const facebookSharedDeactivate: DeactivationFn = async ({
  trigger,
  integration,
}) => {
  const pageId = (trigger.config as { pageId?: string }).pageId;
  if (typeof pageId !== "string" || pageId.length === 0) return;

  // Reference-count across OTHER workflows still watching this Page.
  const referencing = await listByConfigContains({ pageId });
  const others = referencing.filter(
    (r) => r.provider === "facebook" && r.workflowId !== trigger.workflowId,
  );
  if (others.length > 0) {
    console.debug(
      JSON.stringify({
        event: "facebook.deactivate.shared_page_skip",
        workflowId: trigger.workflowId,
        eventType: trigger.eventType,
        otherWorkflows: others.length,
      }),
    );
    return; // leave the page subscribed for the sibling workflows.
  }

  // Last reference — best-effort unsubscribe.
  try {
    await refreshAndRetry({
      accountId: integration.accountId,
      provider: "facebook",
      providerAccountId: integration.providerAccountId,
      apiCall: async (userToken) => {
        const pageAccessToken = await getPageAccessToken({
          accessToken: userToken,
          pageId,
        });
        return unsubscribePageFromApp({ pageAccessToken, pageId });
      },
    });
  } catch (err) {
    if (err instanceof NotFoundError) return;
    const errorName = err instanceof Error ? err.name : "unknown";
    if (errorName === "Unauthorized401Error") return;
    throw err;
  }
};
