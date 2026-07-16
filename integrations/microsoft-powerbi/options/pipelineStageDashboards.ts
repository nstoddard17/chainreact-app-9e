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
import { pipelineStageArtifactsList } from "@/integrations/microsoft-powerbi/api/pipelines/pipelineStageArtifactsList";

/**
 * `microsoft-powerbi:pipeline_stage_dashboards` options resolver.
 *
 * Backs `dashboardIds` on the selective-deploy action. Same multi-parent
 * cascade + sanitization contract as
 * `microsoft-powerbi:pipeline_stage_semantic_models` (one shared
 * stage-artifacts wrapper backs all four per-type resolvers).
 */
export const microsoftPowerBiPipelineStageDashboardsResolver: OptionsResolver =
  {
    source: "microsoft-powerbi:pipeline_stage_dashboards",
    provider: "microsoft-powerbi",
    requiresIntegration: true,
    requiredDeps: ["pipelineId", "sourceStageOrder"],
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
      const sourceStageOrder = ctx.deps.sourceStageOrder;
      if (
        typeof sourceStageOrder !== "string" ||
        !/^\d+$/.test(sourceStageOrder)
      ) {
        throw new OptionsResolverError(
          "MISSING_DEPENDENCY",
          "Select a source stage first.",
        );
      }

      let artifacts;
      try {
        artifacts = await refreshAndRetry({
          accountId: integration.accountId,
          provider: "microsoft-powerbi",
          providerAccountId: integration.providerAccountId,
          apiCall: (accessToken) =>
            pipelineStageArtifactsList({
              accessToken,
              pipelineId,
              stageOrder: Number(sourceStageOrder),
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
          // Parent pipeline/stage no longer exists — empty picker, not an error.
          return { items: [], hasMore: false };
        }
        throw new OptionsResolverError(
          "PROVIDER_ERROR",
          "Couldn't load Power BI stage dashboards. Try again.",
        );
      }

      const items = artifacts.dashboards.map((a) => ({
        value: a.id,
        label: a.name,
      }));
      const lowerQ = ctx.q.toLowerCase();
      const filtered =
        lowerQ.length > 0
          ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
          : items;

      return { items: filtered, hasMore: false };
    },
  };
