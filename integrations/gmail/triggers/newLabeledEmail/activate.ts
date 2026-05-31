import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { usersGetProfile } from "../../api/usersGetProfile";

/**
 * Gmail new_labeled_email activation hook.
 *
 * Gmail 2.3 Commit 3 — mirrors the new_email activation hook
 * (same "first poll miss" rule applies). We fetch the current
 * historyId at activation time so the first poll has a baseline.
 *
 * The poll handler filters to `labelsAdded` events whose
 * `addedLabelIds` include the configured `labelId`; the activation
 * hook does not need to know the label — it only seeds the cursor.
 *
 * A throw here aborts the activate transition; the orchestrator
 * wraps it as TRIGGER_REGISTRATION_FAILED.
 */

export const activate: ActivationFn = async ({ integration }) => {
  const profile = await refreshAndRetry({
    accountId: integration.accountId,
    provider: "gmail",
    providerAccountId: integration.providerAccountId,
    apiCall: async (accessToken) => usersGetProfile({ accessToken }),
  });

  return {
    pollingEnabled: true,
    snapshot: {
      historyId: profile.historyId,
      capturedAt: new Date().toISOString(),
    },
  };
};
