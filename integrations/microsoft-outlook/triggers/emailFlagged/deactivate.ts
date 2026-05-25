import { deleteSubscription } from "@/integrations/_shared/microsoft/api/subscriptions";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { DeactivationFn } from "@/services/triggers/deactivationRegistry";

/**
 * Microsoft Outlook email_flagged deactivation hook.
 *
 * Outlook Mail 2.3 Commit 3. Same "already gone" treatment as new_email
 * (Graph 404 / 403 swallowed).
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
      userId: integration.userId,
      provider: "microsoft-outlook",
      accountId: integration.providerAccountId,
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
