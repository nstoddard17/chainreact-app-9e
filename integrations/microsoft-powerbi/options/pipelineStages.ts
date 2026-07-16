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
import { pipelineStagesList } from "@/integrations/microsoft-powerbi/api/pipelines/pipelineStagesList";

/**
 * `microsoft-powerbi:pipeline_stages` options resolver.
 *
 * Backs the `sourceStageOrder` / `stageOrder` fields. **Dep name
 * `pipelineId` is pinned verbatim** to the runtime Zod schemas.
 *
 * Value = the stage ORDER as a string (the schemas normalize it back to
 * number). Label = `<order> · <stage name>` (+ workspace name when a
 * workspace is assigned). NOTE: the REST stage object carries no
 * displayName — stage names are derived from the documented order
 * semantics (0 Development, 1 Test, 2 Production; higher orders fall
 * back to "Stage N").
 */
function stageName(order: number): string {
  if (order === 0) return "Development";
  if (order === 1) return "Test";
  if (order === 2) return "Production";
  return `Stage ${order}`;
}

export const microsoftPowerBiPipelineStagesResolver: OptionsResolver = {
  source: "microsoft-powerbi:pipeline_stages",
  provider: "microsoft-powerbi",
  requiresIntegration: true,
  requiredDeps: ["pipelineId"],
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Microsoft Power BI integration. Connect Power BI first.",
      );
    }
    const integration = ctx.integration;

    const pipelineId = ctx.deps.pipelineId;
    if (typeof pipelineId !== "string" || pipelineId.length === 0) {
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select a deployment pipeline first.",
      );
    }

    let stages;
    try {
      stages = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "microsoft-powerbi",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          pipelineStagesList({ accessToken, pipelineId }),
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
        // Parent pipeline no longer exists — empty picker, not an error.
        return { items: [], hasMore: false };
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load Power BI pipeline stages. Try again.",
      );
    }

    const items = stages.map((stage) => {
      const base = `${stage.order} · ${stageName(stage.order)}`;
      return {
        value: String(stage.order),
        label: stage.workspaceName
          ? `${base} (${stage.workspaceName})`
          : base,
      };
    });
    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    return { items: filtered, hasMore: false };
  },
};
