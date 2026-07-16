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
import { pipelineOperationsList } from "@/integrations/microsoft-powerbi/api/pipelines/pipelineOperationsList";

/**
 * `microsoft-powerbi:pipeline_operations` options resolver.
 *
 * Backs the `operationId` field on `get_pipeline_deployment_status` —
 * `get_pipeline_deployment_history` already lists the same operations,
 * so the status action must offer them too rather than asking for a
 * pasted id. The field also allows manual entry: the id usually arrives
 * as a `{{...}}` variable from a preceding deploy action.
 *
 * **Dep name `pipelineId` is pinned verbatim** to the runtime Zod
 * schema; the meta field wires `dependsOn: "pipelineId"`.
 *
 * Value = operation id, label = `<executionStartTime> · <status>`,
 * newest first. `hasMore` is always false: the provider itself caps
 * this endpoint at the 20 most recent operations with no paging.
 * Cascade fallback: deleted parent pipeline → empty items.
 */
export const microsoftPowerBiPipelineOperationsResolver: OptionsResolver = {
  source: "microsoft-powerbi:pipeline_operations",
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

    let operations;
    try {
      operations = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "microsoft-powerbi",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          pipelineOperationsList({ accessToken, pipelineId }),
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
        "Couldn't load Power BI pipeline deployment operations. Try again.",
      );
    }

    // Newest first; a not-yet-started operation has no executionStartTime
    // and sorts last rather than being dropped.
    const sorted = [...operations].sort((a, b) =>
      (b.executionStartTime ?? "").localeCompare(a.executionStartTime ?? ""),
    );

    const items = sorted.map((op) => ({
      value: op.operationId,
      label: `${op.executionStartTime ?? "not started"} · ${op.status}`,
    }));
    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    return { items: filtered, hasMore: false };
  },
};
