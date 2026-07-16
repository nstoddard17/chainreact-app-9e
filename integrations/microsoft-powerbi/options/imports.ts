import {
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { NotFoundError } from "@/integrations/microsoft-powerbi/api/errors";
import { importsList } from "@/integrations/microsoft-powerbi/api/imports/importsList";

/**
 * `microsoft-powerbi:imports` options resolver.
 *
 * Backs the `importId` field on `get_import_status` (typically fed by
 * a variable from `import_power_bi_file` — the field also allows
 * manual entry). **Dep name `workspaceId` is pinned verbatim** to the
 * runtime Zod schemas.
 *
 * Value = import id, label = import name (id fallback when the
 * provider omits the name), description = importState. Cascade
 * fallback: deleted parent workspace → empty items.
 */
export const microsoftPowerBiImportsResolver: OptionsResolver = {
  source: "microsoft-powerbi:imports",
  provider: "microsoft-powerbi",
  requiresIntegration: true,
  requiredDeps: ["workspaceId"],
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Microsoft Power BI integration. Connect Power BI first.",
      );
    }
    const integration = ctx.integration;

    const workspaceId = ctx.deps.workspaceId;
    if (typeof workspaceId !== "string" || workspaceId.length === 0) {
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select a workspace first.",
      );
    }

    let imports;
    try {
      imports = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "microsoft-powerbi",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          importsList({ accessToken, groupId: workspaceId }),
      });
    } catch (err) {
      if (
        err instanceof IntegrationActionRequiredError ||
        err instanceof Unauthorized401Error
      ) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Microsoft Power BI and try again.",
        );
      }
      if (err instanceof NotFoundError) {
        // Parent workspace no longer exists — empty picker, not an error.
        return { items: [], hasMore: false };
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load Power BI imports. Try again.",
      );
    }

    const items = imports.map((i) => ({
      value: i.id,
      label: i.name ?? i.id,
      ...(i.importState !== null && { description: i.importState }),
    }));
    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    return { items: filtered, hasMore: false };
  },
};
