import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { deleteSubscription } from "@/integrations/_shared/microsoft/api/subscriptions";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { DeactivationFn } from "@/services/triggers/deactivationRegistry";

/**
 * Microsoft Outlook Calendar `event_changed` deactivation hook.
 *
 * Best-effort, mirrors Slice 6 mail behavior:
 *   - 404 from Graph → swallow (subscription already gone — expired or
 *     deleted by another path).
 *   - 403 / ErrorAccessDenied → swallow (V1 reasoning at
 *     subscriptionManager.ts:247-253: token lacks permissions OR the
 *     subscription was created by a different client. Either way Graph
 *     auto-cleans on expiry, so functionally identical to 404).
 *   - Other errors → propagate; the lifecycle orchestrator catches and
 *     proceeds with row deletion (the user's "disable" intent is met by
 *     the trigger_resources row going away).
 */
export const deactivate: DeactivationFn = async ({ trigger, integration }) => {
  const config = trigger.config as {
    subscriptionId?: string;
    type?: string;
  };

  if (config.type !== "subscription-watch") return;
  if (!config.subscriptionId) return;

  try {
    await refreshAndRetry({
      accountId: integration.accountId,
      provider: "microsoft-outlook-calendar",
      providerAccountId: integration.accountId,
      apiCall: (accessToken) =>
        deleteSubscription({
          accessToken,
          subscriptionId: config.subscriptionId!,
        }),
    });
  } catch (err) {
    if (err instanceof NotFoundError) return; // already gone
    if (err instanceof Error && /403/.test(err.message)) return;
    if (err instanceof Error && /ErrorAccessDenied/i.test(err.message)) return;
    throw err;
  }
};
