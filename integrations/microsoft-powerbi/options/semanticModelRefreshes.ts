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
import {
  refreshesList,
  type PowerBiRefreshHistoryEntry,
} from "@/integrations/microsoft-powerbi/api/datasets/refreshesList";

/**
 * `microsoft-powerbi:semantic_model_refreshes` options resolver.
 *
 * Backs the `refreshRequestId` field on `cancel_semantic_model_refresh`
 * + `get_semantic_model_refresh_details` — the semantic-model twin of
 * `dataflow_transactions` (which already backs the dataflow cancel
 * action). Both fields also allow manual entry: the id usually arrives
 * as a `{{...}}` variable from `refresh_semantic_model`.
 *
 * **Dep names `workspaceId` + `semanticModelId` are pinned verbatim** to
 * the runtime Zod schemas; meta fields wire
 * `dependsOn: ["workspaceId", "semanticModelId"]`.
 *
 * Value = the refresh `requestId`; entries without one are skipped —
 * only enhanced (API-started) refreshes carry a request id, and those
 * are exactly the ones these two actions accept. Label =
 * `<startTime> · <status>`. Sorted in-progress first, then newest by
 * startTime. Cascade fallback: deleted parent workspace/model → empty
 * items.
 */

/**
 * Power BI reports an in-flight refresh as `status: "Unknown"` (the
 * documented "in progress" sentinel — `endTime` is absent until it
 * concludes). `"InProgress"` is matched too: the wrapper's extended
 * status vocabulary uses it, and a defensive match costs nothing.
 */
function isInProgress(r: PowerBiRefreshHistoryEntry): boolean {
  const status = r.status.toLowerCase().replace(/[^a-z]/g, "");
  return status === "unknown" || status === "inprogress";
}

export const microsoftPowerBiSemanticModelRefreshesResolver: OptionsResolver = {
  source: "microsoft-powerbi:semantic_model_refreshes",
  provider: "microsoft-powerbi",
  requiresIntegration: true,
  requiredDeps: ["workspaceId", "semanticModelId"],
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
    const semanticModelId = ctx.deps.semanticModelId;
    if (typeof semanticModelId !== "string" || semanticModelId.length === 0) {
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select a semantic model first.",
      );
    }

    let result;
    try {
      result = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "microsoft-powerbi",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          refreshesList({
            accessToken,
            groupId: workspaceId,
            datasetId: semanticModelId,
            top: 100,
          }),
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
        // Parent workspace/semantic model no longer exists — empty picker.
        return { items: [], hasMore: false };
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load Power BI semantic model refreshes. Try again.",
      );
    }

    const sorted = [...result.refreshes].sort((a, b) => {
      const aProgress = isInProgress(a) ? 0 : 1;
      const bProgress = isInProgress(b) ? 0 : 1;
      if (aProgress !== bProgress) return aProgress - bProgress;
      // Newest first; missing startTime sorts last within its group.
      return (b.startTime ?? "").localeCompare(a.startTime ?? "");
    });

    const items = sorted
      // Only enhanced refreshes carry a requestId — the id these actions take.
      .filter((r) => r.refreshRequestId !== null)
      .map((r) => ({
        value: r.refreshRequestId!,
        label: `${r.startTime ?? "unknown start"} · ${r.status}`,
      }));
    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    return { items: filtered, hasMore: result.hasMore };
  },
};
