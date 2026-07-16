import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { importsList } from "../../api/imports/importsList";
import { matchingImports } from "../_shared/pollImports";
import { mergeSeenIds } from "../_shared/snapshot";
import { PowerBiImportCompletedConfigSchema } from "./schema";

/**
 * `import_completed` activation hook — seeds the workspace's already-
 * `Succeeded` import ids so pre-existing imports are not replayed. An
 * import still `Publishing` is not seeded and fires when it succeeds.
 * Throws on seed failure (→ TRIGGER_REGISTRATION_FAILED).
 */
export const activate: ActivationFn = async ({ integration, node }) => {
  const cfg = node.config as { workspaceId?: string };
  const parsed = PowerBiImportCompletedConfigSchema.parse({
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
        matchingImports(imports, "import_completed").map((i) => i.id),
      ),
      updatedAt: new Date().toISOString(),
    },
  };
};
