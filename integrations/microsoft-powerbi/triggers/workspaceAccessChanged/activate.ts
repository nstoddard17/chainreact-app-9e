import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { groupUsersList } from "../../api/groups/groupUsersList";
import { toAccessEntries } from "../_shared/pollWorkspace";
import { PowerBiWorkspaceAccessChangedConfigSchema } from "./schema";

/**
 * `workspace_access_changed` activation hook.
 *
 * Seeds the workspace's current principal→role map before the first poll,
 * so the existing membership is the baseline — nobody's pre-existing
 * access is replayed as an "added" event. Only later grants, role changes,
 * and revocations fire.
 *
 * Projects through the same `toAccessEntries` path the poller uses so the
 * baseline and the diff resolve principal identity identically.
 *
 * Throws on seed failure → TRIGGER_REGISTRATION_FAILED.
 */
export const activate: ActivationFn = async ({ integration, node }) => {
  const config = node.config as Record<string, unknown>;
  const parsed = PowerBiWorkspaceAccessChangedConfigSchema.parse({
    workspaceId: config.workspaceId,
  });

  const users = await refreshAndRetry({
    accountId: integration.accountId,
    provider: "microsoft-powerbi",
    providerAccountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      groupUsersList({ accessToken, groupId: parsed.workspaceId }),
  });

  return {
    pollingEnabled: true,
    snapshot: {
      entries: toAccessEntries(users),
      updatedAt: new Date().toISOString(),
    },
  };
};
