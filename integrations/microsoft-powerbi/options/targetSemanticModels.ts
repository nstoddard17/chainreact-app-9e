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
import { datasetsList } from "@/integrations/microsoft-powerbi/api/datasets/datasetsList";

/**
 * `microsoft-powerbi:target_semantic_models` options resolver.
 *
 * Backs `clone_report.targetSemanticModelId` — the model the clone is
 * rebound to, listed from the clone's TARGET workspace.
 *
 * Deliberately separate from `microsoft-powerbi:semantic_models` rather
 * than reusing it with `dependsOn: "targetWorkspaceId"`: deps are keyed
 * by the PARENT FIELD NAME end to end — SchemaForm builds
 * `deps = { [parentFieldName]: value }`, the route reads
 * `deps[<parentField>]` verbatim, and `resolveOptionsSource` checks
 * `requiredDeps` against those keys BEFORE dispatch. A field named
 * `targetWorkspaceId` therefore sends `deps.targetWorkspaceId`, which
 * the `semantic_models` resolver (`requiredDeps: ["workspaceId"]`)
 * would reject as MISSING_DEPENDENCY — a dead dropdown. Same wrapper
 * (`datasetsList`), same mapping; only the dep name differs.
 *
 * Value = dataset GUID, label = dataset name. Cascade fallback: a
 * deleted target workspace throws `NotFoundError` → empty items.
 */
export const microsoftPowerBiTargetSemanticModelsResolver: OptionsResolver = {
  source: "microsoft-powerbi:target_semantic_models",
  provider: "microsoft-powerbi",
  requiresIntegration: true,
  requiredDeps: ["targetWorkspaceId"],
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Microsoft Power BI integration. Connect Power BI first.",
      );
    }
    const integration = ctx.integration;

    const targetWorkspaceId = ctx.deps.targetWorkspaceId;
    if (typeof targetWorkspaceId !== "string" || targetWorkspaceId.length === 0) {
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select a target workspace first.",
      );
    }

    let datasets;
    try {
      datasets = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "microsoft-powerbi",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          datasetsList({ accessToken, groupId: targetWorkspaceId }),
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
        // Target workspace no longer exists — empty picker, not an error.
        return { items: [], hasMore: false };
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load Power BI semantic models. Try again.",
      );
    }

    const items = datasets.map((d) => ({ value: d.id, label: d.name }));
    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    return { items: filtered, hasMore: false };
  },
};
