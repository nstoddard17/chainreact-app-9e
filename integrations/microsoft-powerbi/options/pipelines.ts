import {
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { pipelinesList } from "@/integrations/microsoft-powerbi/api/pipelines/pipelinesList";

/**
 * `microsoft-powerbi:pipelines` options resolver.
 *
 * Root of the deployment-pipeline cascade — backs the `pipelineId`
 * field on every pipeline action. Value = pipeline GUID, label =
 * pipeline display name. Endpoint documents no paging → hasMore false.
 *
 * Error sanitization mirrors `microsoft-powerbi:workspaces` — no token /
 * raw provider body ever reaches the browser.
 */
export const microsoftPowerBiPipelinesResolver: OptionsResolver = {
  source: "microsoft-powerbi:pipelines",
  provider: "microsoft-powerbi",
  requiresIntegration: true,
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Microsoft Power BI integration. Connect Power BI first.",
      );
    }
    const integration = ctx.integration;

    let pipelines;
    try {
      pipelines = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "microsoft-powerbi",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) => pipelinesList({ accessToken }),
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
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load Power BI deployment pipelines. Try again.",
      );
    }

    const items = pipelines.map((p) => ({ value: p.id, label: p.displayName }));
    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    return { items: filtered, hasMore: false };
  },
};
