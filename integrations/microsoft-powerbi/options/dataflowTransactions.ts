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
  dataflowTransactionsList,
  type PowerBiDataflowTransaction,
} from "@/integrations/microsoft-powerbi/api/dataflows/dataflowTransactionsList";

/**
 * `microsoft-powerbi:dataflow_transactions` options resolver.
 *
 * Backs the `transactionId` field on `cancel_dataflow_refresh` (the
 * field also allows manual entry — the id often arrives from a history
 * step). **Dep names `workspaceId` + `dataflowId` are pinned verbatim**
 * to the runtime Zod schemas; meta fields wire
 * `dependsOn: ["workspaceId", "dataflowId"]`.
 *
 * Value = transaction id, label = `<startTime> · <status>`. Sorted
 * in-progress first (only those are cancellable), then newest by
 * startTime — the top pick is the one an author most likely wants.
 * Cascade fallback: deleted parent dataflow → empty items.
 */

/** Provider status enum is undocumented — match "in progress" loosely. */
function isInProgress(t: PowerBiDataflowTransaction): boolean {
  return (t.status ?? "").toLowerCase().replace(/[^a-z]/g, "") === "inprogress";
}

export const microsoftPowerBiDataflowTransactionsResolver: OptionsResolver = {
  source: "microsoft-powerbi:dataflow_transactions",
  provider: "microsoft-powerbi",
  requiresIntegration: true,
  requiredDeps: ["workspaceId", "dataflowId"],
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
    const dataflowId = ctx.deps.dataflowId;
    if (typeof dataflowId !== "string" || dataflowId.length === 0) {
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select a dataflow first.",
      );
    }

    let result;
    try {
      result = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "microsoft-powerbi",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          dataflowTransactionsList({
            accessToken,
            groupId: workspaceId,
            dataflowId,
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
        // Parent workspace/dataflow no longer exists — empty picker.
        return { items: [], hasMore: false };
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load Power BI dataflow refresh transactions. Try again.",
      );
    }

    const sorted = [...result.transactions].sort((a, b) => {
      const aProgress = isInProgress(a) ? 0 : 1;
      const bProgress = isInProgress(b) ? 0 : 1;
      if (aProgress !== bProgress) return aProgress - bProgress;
      // Newest first; missing startTime sorts last within its group.
      return (b.startTime ?? "").localeCompare(a.startTime ?? "");
    });

    const items = sorted.map((t) => ({
      value: t.id,
      label: `${t.startTime ?? "unknown start"} · ${t.status ?? "unknown"}`,
    }));
    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    return { items: filtered, hasMore: result.hasMore };
  },
};
