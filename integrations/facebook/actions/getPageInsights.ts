import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { getPageAccessToken } from "@/integrations/_shared/facebook/api/getPageAccessToken";
import { insightsGet } from "@/integrations/_shared/facebook/api/insightsGet";
import { GetPageInsightsConfigSchema } from "./getPageInsights.schema";

/**
 * Facebook `get_page_insights` — Slice 3.FACEBOOK-2. Pure read of Page
 * analytics. Low risk. Output: `{ metrics, pageId, metric, period }` — the
 * raw metric values are sensitive (business analytics), marked in the
 * FACEBOOK-4 metadata.
 */
export const getPageInsights: ActionHandler = async (input) => {
  const config = GetPageInsightsConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "facebook"
      ? input.triggerEvent.providerAccountId
      : null;

  const sinceUnix =
    config.since !== undefined
      ? Math.floor(new Date(config.since).getTime() / 1000)
      : undefined;
  const untilUnix =
    config.until !== undefined
      ? Math.floor(new Date(config.until).getTime() / 1000)
      : undefined;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "facebook",
    providerAccountId,
    apiCall: async (userToken) => {
      const pageAccessToken = await getPageAccessToken({
        accessToken: userToken,
        pageId: config.pageId,
      });
      return insightsGet({
        pageAccessToken,
        pageId: config.pageId,
        metric: config.metric,
        period: config.period,
        ...(sinceUnix !== undefined && { since: sinceUnix }),
        ...(untilUnix !== undefined && { until: untilUnix }),
      });
    },
  });

  return {
    output: {
      metrics: result.data,
      count: result.data.length,
      pageId: config.pageId,
      metric: config.metric,
      period: config.period,
    },
  };
};
