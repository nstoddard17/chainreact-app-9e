import { deleteSubscription } from "@/integrations/_shared/microsoft/api/subscriptions";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { DeactivationFn } from "@/services/triggers/deactivationRegistry";

/**
 * Microsoft Outlook email_sent deactivation hook.
 *
 * Outlook Mail 2.3 Commit 3. Mirrors new_email's deactivate shape
 * exactly — same "already gone" treatment of Graph 404 / 403 as success.
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
      provider: "microsoft-outlook",
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
