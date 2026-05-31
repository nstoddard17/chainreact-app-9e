import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { deleteSubscription } from "@/integrations/_shared/microsoft/api/subscriptions";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { DeactivationFn } from "@/services/triggers/deactivationRegistry";

/**
 * Microsoft OneDrive `file_changed` deactivation hook.
 *
 * Best-effort, mirrors Slice 6 + 7 behavior:
 *   - 404 from Graph → swallow (subscription already gone).
 *   - 403 / ErrorAccessDenied → swallow (token lacks permission OR
 *     subscription created by a different client; Graph auto-cleans
 *     on expiry).
 *   - Other errors → propagate; the lifecycle orchestrator catches and
 *     proceeds with row deletion.
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
      provider: "microsoft-onedrive",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) =>
        deleteSubscription({
          accessToken,
          subscriptionId: config.subscriptionId!,
        }),
    });
  } catch (err) {
    if (err instanceof NotFoundError) return;
    if (err instanceof Error && /403/.test(err.message)) return;
    if (err instanceof Error && /ErrorAccessDenied/i.test(err.message)) return;
    throw err;
  }
};
