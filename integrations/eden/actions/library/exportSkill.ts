import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { exportSkill } from "@/integrations/_shared/eden/api/library";
import { ExportSkillConfigSchema } from "./exportSkill.schema";

/** `eden:export_skill` — export a saved prompt/skill as Markdown. */
export const edenExportSkill: ActionHandler = async (input) => {
  const config = ExportSkillConfigSchema.parse(input.config);
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) => exportSkill({ accessToken, promptId: config.promptId }),
  });
  return { output: { markdown: result.markdown, slug: result.slug } };
};
