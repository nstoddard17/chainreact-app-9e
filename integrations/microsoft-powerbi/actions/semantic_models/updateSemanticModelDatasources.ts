import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { datasourcesUpdate } from "../../api/datasets/datasourcesUpdate";
import { UpdateSemanticModelDatasourcesConfigSchema } from "./updateSemanticModelDatasources.schema";

/**
 * Power BI `update_semantic_model_datasources` action handler.
 *
 * Rewires a model's data-source connections. Builds the wire selector
 * (`datasourceSelector.connectionDetails`) from the row's `current*`
 * values and the target `connectionDetails` from the `new*` values —
 * only provided keys are sent. The connected user must OWN the model;
 * refresh afterward to apply.
 *
 * Output shape (downstream variable refs):
 *   { updated, updateCount }
 */
export const updateSemanticModelDatasources: ActionHandler = async (input) => {
  const config = UpdateSemanticModelDatasourcesConfigSchema.parse(
    input.config,
  );

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      datasourcesUpdate({
        accessToken,
        groupId: config.workspaceId,
        datasetId: config.semanticModelId,
        updates: config.updates.map((row) => ({
          datasourceType: row.datasourceType,
          current: {
            server: row.currentServer,
            database: row.currentDatabase,
            url: row.currentUrl,
          },
          target: {
            server: row.newServer,
            database: row.newDatabase,
            url: row.newUrl,
          },
        })),
      }),
  });

  return {
    output: {
      updated: true,
      updateCount: config.updates.length,
    },
  };
};
