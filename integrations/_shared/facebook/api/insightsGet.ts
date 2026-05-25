import { graphRequest } from "./_request";

/**
 * Facebook `GET /{pageId}/insights` — Slice 3.FACEBOOK-2. Pure read of Page
 * analytics. `metric` is a comma-separated list of Graph metric names;
 * `period` is `day` / `week` / `days_28`. Optional `since`/`until` (unix
 * seconds) bound the window. Uses a Page access token.
 */
export interface FacebookInsightValue {
  value: unknown;
  end_time?: string;
}
export interface FacebookInsightMetric {
  name: string;
  period: string;
  title?: string;
  description?: string;
  values: FacebookInsightValue[];
}
export interface FacebookInsightsResult {
  data: FacebookInsightMetric[];
  paging?: Record<string, unknown>;
}

export async function insightsGet(input: {
  pageAccessToken: string;
  pageId: string;
  metric: string;
  period: string;
  since?: number;
  until?: number;
}): Promise<FacebookInsightsResult> {
  return graphRequest<FacebookInsightsResult>({
    accessToken: input.pageAccessToken,
    path: `/${input.pageId}/insights`,
    query: {
      metric: input.metric,
      period: input.period,
      since: input.since,
      until: input.until,
    },
  });
}
