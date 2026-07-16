import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { importsList } from "../../api/imports/importsList";
import { matchingImports } from "../_shared/pollImports";
import { mergeSeenIds } from "../_shared/snapshot";
import { PowerBiImportFailedConfigSchema } from "./schema";

/**
 * `import_failed` activation hook — seeds the workspace's already-`Failed`
 * import ids so historical failures are not replayed. Throws on seed
 * failure (→ TRIGGER_REGISTRATION_FAILED).
 */
export const activate: ActivationFn = async ({ integration, node }) => {
  const cfg = node.config as { workspaceId?: string };
  const parsed = PowerBiImportFailedConfigSchema.parse({
    workspaceId: cfg.workspaceId,
  });

  const imports = await refreshAndRetry({
    accountId: integration.accountId,
    provider: "microsoft-powerbi",
    providerAccountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      importsList({ accessToken, groupId: parsed.workspaceId }),
  });

  return {
    pollingEnabled: true,
    snapshot: {
      seenImportIds: mergeSeenIds(
        [],
        matchingImports(imports, "import_failed").map((i) => i.id),
      ),
      updatedAt: new Date().toISOString(),
    },
  };
};
