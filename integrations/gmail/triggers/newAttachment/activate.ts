import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { usersGetProfile } from "../../api/usersGetProfile";

/**
 * Gmail new_attachment activation hook.
 *
 * Gmail 2.3 Commit 4 — mirrors the new_email / new_labeled_email
 * activation hooks. We fetch the current `historyId` at activation time
 * so the first poll has a baseline cursor — without this, the "first
 * poll miss" rule from the polling-trigger-snapshot-initialization
 * design (CLAUDE.md §4) would silently drop messages that arrive
 * between activation and the first cron tick.
 *
 * The poll handler filters to `messagesAdded` events and then
 * hydrates each message via `format=full` to inspect attachments;
 * activation has no filter state to seed, only the cursor.
 *
 * A throw here aborts the activate transition; the orchestrator
 * wraps it as TRIGGER_REGISTRATION_FAILED.
 */

export const activate: ActivationFn = async ({ integration }) => {
  const profile = await refreshAndRetry({
    accountId: integration.accountId,
    provider: "gmail",
    providerAccountId: integration.accountId,
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
