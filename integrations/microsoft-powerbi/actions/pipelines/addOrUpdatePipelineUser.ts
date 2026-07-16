import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { pipelineUserUpsert } from "../../api/pipelines/pipelineUserUpsert";
import { AddOrUpdatePipelineUserConfigSchema } from "./addOrUpdatePipelineUser.schema";

/**
 * Power BI `add_or_update_pipeline_user` action handler.
 *
 * Grants (or re-grants) a principal access to a deployment pipeline via
 * the documented add-or-update call. Identifier is the UPN/email for
 * users, the object id for groups/apps.
 *
 * Output shape (downstream variable refs):
 *   { granted, principalIdentifier }
 */
export const addOrUpdatePipelineUser: ActionHandler = async (input) => {
  const config = AddOrUpdatePipelineUserConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      pipelineUserUpsert({
        accessToken,
        pipelineId: config.pipelineId,
        identifier: config.principalIdentifier,
        principalType: config.principalType,
        accessRight: config.accessRight,
      }),
  });

  return {
    output: {
      granted: true,
      principalIdentifier: config.principalIdentifier,
    },
  };
};
