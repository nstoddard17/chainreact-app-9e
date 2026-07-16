import {
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { groupsList } from "@/integrations/microsoft-powerbi/api/groups/groupsList";

/**
 * `microsoft-powerbi:workspaces` options resolver.
 *
 * Root of every Power BI cascade — backs the `workspaceId` field on all
 * workspace-scoped actions and triggers. Value = workspace (group) GUID,
 * label = workspace name. "My workspace" is intentionally absent (the
 * provider is workspace-scoped end to end; see groupsList wrapper doc).
 *
 * Error sanitization mirrors `microsoft-excel:worksheets` — no token /
 * raw provider body ever reaches the browser.
 */
export const microsoftPowerBiWorkspacesResolver: OptionsResolver = {
  source: "microsoft-powerbi:workspaces",
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

    let result;
    try {
      result = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "microsoft-powerbi",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) => groupsList({ accessToken }),
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
        "Couldn't load Power BI workspaces. Try again.",
      );
    }

    const items = result.groups.map((g) => ({ value: g.id, label: g.name }));
    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    return { items: filtered, hasMore: result.hasMore };
  },
};
