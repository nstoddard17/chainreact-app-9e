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
import { pipelineUsersList } from "@/integrations/microsoft-powerbi/api/pipelines/pipelineUsersList";

/**
 * `microsoft-powerbi:pipeline_users` options resolver.
 *
 * Backs `principalIdentifier` on `remove_pipeline_user`. **Dep name
 * `pipelineId` is pinned verbatim** to the runtime schema. Value =
 * principal identifier (UPN for users, object id for groups/apps) —
 * pipeline principals may lack display names, so the label is
 * `<identifier> · <accessRight>`.
 */
export const microsoftPowerBiPipelineUsersResolver: OptionsResolver = {
  source: "microsoft-powerbi:pipeline_users",
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

    let users;
    try {
      users = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "microsoft-powerbi",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          pipelineUsersList({ accessToken, pipelineId }),
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
        "Couldn't load Power BI pipeline users. Try again.",
      );
    }

    const items = users.map((u) => ({
      value: u.identifier,
      label: u.accessRight
        ? `${u.identifier} · ${u.accessRight}`
        : u.identifier,
    }));
    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    return { items: filtered, hasMore: false };
  },
};
