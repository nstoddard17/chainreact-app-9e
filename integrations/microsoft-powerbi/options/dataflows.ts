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
import { dataflowsList } from "@/integrations/microsoft-powerbi/api/dataflows/dataflowsList";

/**
 * `microsoft-powerbi:dataflows` options resolver.
 *
 * Backs the `dataflowId` field on dataflow actions/triggers. **Dep name
 * `workspaceId` is pinned verbatim** to the runtime Zod schemas
 * (camelCase) — meta fields wire `dependsOn: "workspaceId"`.
 *
 * Value = dataflow objectId (GUID), label = dataflow name. Cascade
 * fallback: a deleted parent workspace throws `NotFoundError` → empty
 * items (not an error), mirroring `microsoft-powerbi:semantic_models`.
 */
export const microsoftPowerBiDataflowsResolver: OptionsResolver = {
  source: "microsoft-powerbi:dataflows",
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

    let dataflows;
    try {
      dataflows = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "microsoft-powerbi",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          dataflowsList({ accessToken, groupId: workspaceId }),
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
        "Couldn't load Power BI dataflows. Try again.",
      );
    }

    const items = dataflows.map((d) => ({ value: d.objectId, label: d.name }));
    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    return { items: filtered, hasMore: false };
  },
};
