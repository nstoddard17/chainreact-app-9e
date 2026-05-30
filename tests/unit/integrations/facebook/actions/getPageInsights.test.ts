/**
 * @jest-environment node
 *
 * Tests for `facebook:get_page_insights` — Slice 3.FACEBOOK-2 (pure read).
 */
const mockRefresh = jest.fn();
const mockGetPageToken = jest.fn();
const mockInsightsGet = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (...a: unknown[]) => mockRefresh(...a) };
});
jest.mock("@/integrations/_shared/facebook/api/getPageAccessToken", () => ({
  getPageAccessToken: (...a: unknown[]) => mockGetPageToken(...a),
}));
jest.mock("@/integrations/_shared/facebook/api/insightsGet", () => ({
  insightsGet: (...a: unknown[]) => mockInsightsGet(...a),
}));

import { getPageInsights } from "@/integrations/facebook/actions/getPageInsights";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";

function input(config: Record<string, unknown>): ActionHandlerInput {
  return {
    workflowId: "wf", userId: "user-1", accountId: "acct-user-1", runId: "run", nodeId: "node", config,
    triggerEvent: { provider: "manual", eventType: "manual", eventId: "e", occurredAt: "t", providerAccountId: "a", payload: {} },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRefresh.mockImplementation(async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("USER_TOK"));
  mockGetPageToken.mockResolvedValue("PAGE_TOK");
  mockInsightsGet.mockResolvedValue({
    data: [{ name: "page_impressions", period: "day", values: [{ value: 42 }] }],
  });
});

describe("facebook get_page_insights", () => {
  it("passes metric + period and returns normalized metrics", async () => {
    const result = await getPageInsights(
      input({ pageId: "p", metric: "page_impressions", period: "day" }),
    );
    expect(mockInsightsGet.mock.calls[0]![0]).toMatchObject({
      pageAccessToken: "PAGE_TOK", pageId: "p", metric: "page_impressions", period: "day",
    });
    expect(result.output).toMatchObject({
      count: 1, pageId: "p", metric: "page_impressions", period: "day",
    });
    expect(Array.isArray(result.output.metrics)).toBe(true);
  });

  it("converts since/until ISO to unix seconds", async () => {
    await getPageInsights(
      input({ pageId: "p", metric: "m", period: "week", since: "2026-01-01T00:00:00Z", until: "2026-01-08T00:00:00Z" }),
    );
    const call = mockInsightsGet.mock.calls[0]![0];
    expect(call.since).toBe(Math.floor(new Date("2026-01-01T00:00:00Z").getTime() / 1000));
    expect(call.until).toBe(Math.floor(new Date("2026-01-08T00:00:00Z").getTime() / 1000));
  });
});
