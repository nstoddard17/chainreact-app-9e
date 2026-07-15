import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { listSchedules } from "@/integrations/_shared/eden/api/schedules";
import { ListSchedulesConfigSchema } from "./listSchedules.schema";

/** `eden:list_schedules` — a workspace's posting schedules. */
export const edenListSchedules: ActionHandler = async (input) => {
  const config = ListSchedulesConfigSchema.parse(input.config);
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) =>
      listSchedules({ accessToken, ...(config.workspaceId ? { workspaceId: config.workspaceId } : {}) }),
  });
  return {
    output: {
      schedules: result.schedules,
      workspaceId: result.workspaceId,
      count: result.schedules.length,
    },
  };
};
