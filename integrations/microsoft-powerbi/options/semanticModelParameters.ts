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
import { parametersList } from "@/integrations/microsoft-powerbi/api/datasets/parametersList";

/**
 * `microsoft-powerbi:semantic_model_parameters` options resolver.
 *
 * Lists the Power Query parameter NAMES of a semantic model. **Dep names
 * `workspaceId` + `semanticModelId` are pinned verbatim** to the runtime
 * Zod schemas (camelCase).
 *
 * Value = label = parameter name. Current parameter VALUES are never
 * surfaced in labels/descriptions — they routinely embed connection
 * strings/server names (the wrapper doesn't even fetch them into scope).
 * Cascade fallback: a deleted parent workspace/model throws
 * `NotFoundError` → empty items (not an error).
 */
export const microsoftPowerBiSemanticModelParametersResolver: OptionsResolver =
  {
    source: "microsoft-powerbi:semantic_model_parameters",
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
      if (
        typeof semanticModelId !== "string" ||
        semanticModelId.length === 0
      ) {
        throw new OptionsResolverError(
          "MISSING_DEPENDENCY",
          "Select a semantic model first.",
        );
      }

      let parameters;
      try {
        parameters = await refreshAndRetry({
          accountId: integration.accountId,
          provider: "microsoft-powerbi",
          providerAccountId: integration.providerAccountId,
          apiCall: (accessToken) =>
            parametersList({
              accessToken,
              groupId: workspaceId,
              datasetId: semanticModelId,
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
          // Parent workspace/model no longer exists — empty picker, not an error.
          return { items: [], hasMore: false };
        }
        throw new OptionsResolverError(
          "PROVIDER_ERROR",
          "Couldn't load Power BI semantic model parameters. Try again.",
        );
      }

      const items = parameters.map((p) => ({ value: p.name, label: p.name }));
      const lowerQ = ctx.q.toLowerCase();
      const filtered =
        lowerQ.length > 0
          ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
          : items;

      return { items: filtered, hasMore: false };
    },
  };
