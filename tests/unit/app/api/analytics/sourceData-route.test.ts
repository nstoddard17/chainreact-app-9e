/**
 * @jest-environment node
 *
 * GET /api/analytics/sources/[provider]/data (Slice ANALYTICS-SOURCES-GITHUB-UI-1):
 * auth gate, session-derived context (personal-credential isolation), refresh,
 * and safe widget-level error mapping (no page crash, no raw leak).
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));
jest.mock("@/services/accounts/activeAccount", () => ({ resolveActiveAccount: jest.fn() }));
jest.mock("@/services/analytics/sources/querySource", () => ({ queryAnalyticsSource: jest.fn() }));

import { GET } from "@/app/api/analytics/sources/[provider]/data/route";
import { resolveActiveAccount } from "@/services/accounts/activeAccount";
import { queryAnalyticsSource } from "@/services/analytics/sources/querySource";
import { AnalyticsSourceError, type NormalizedAnalyticsResult } from "@/services/analytics/sources/types";

const mockResolve = resolveActiveAccount as jest.MockedFunction<typeof resolveActiveAccount>;
const mockQuery = queryAnalyticsSource as jest.MockedFunction<typeof queryAnalyticsSource>;

function req(qs: string): Request {
  return new Request(`http://localhost/api/analytics/sources/github/data${qs}`);
}
const params = Promise.resolve({ provider: "github" });

function okResult(): NormalizedAnalyticsResult {
  return {
    shape: "scalar",
    dimensions: [],
    measures: ["open_issues"],
    rows: [{ open_issues: 4 }],
    totals: { open_issues: 4 },
    generatedAt: "2026-06-17T00:00:00Z",
    freshness: { cached: false, ageSeconds: 0, ttlSeconds: 600 },
    warnings: [],
    truncated: false,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "e@x.co" } }, error: null });
  mockResolve.mockResolvedValue({
    ok: true,
    source: "personal",
    accountId: "acct-1",
    account: { id: "acct-1" } as never,
  });
});

it("401 when unauthenticated", async () => {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  const res = await GET(req("?metric=open_issues"), { params });
  expect(res.status).toBe(401);
  expect(mockQuery).not.toHaveBeenCalled();
});

it("400 when the metric param is missing", async () => {
  const res = await GET(req("?range=7d"), { params });
  expect(res.status).toBe(400);
  expect(mockQuery).not.toHaveBeenCalled();
});

it("success → 200 { ok: true } using the SESSION account + user (personal isolation)", async () => {
  mockQuery.mockResolvedValue(okResult());
  const res = await GET(req("?metric=open_issues&range=7d&repo=octocat/hello"), { params });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.result.totals).toEqual({ open_issues: 4 });
  const call = mockQuery.mock.calls[0]![0];
  expect(call.providerKey).toBe("github");
  expect(call.metricKey).toBe("open_issues");
  expect(call.filters).toEqual({ repo: "octocat/hello" });
  expect(call.context).toEqual({ accountId: "acct-1", userId: "u1" });
});

it("forwards refresh=1 to the query path", async () => {
  mockQuery.mockResolvedValue(okResult());
  await GET(req("?metric=open_issues&refresh=1"), { params });
  expect(mockQuery.mock.calls[0]![1]).toEqual({ refresh: true });
});

it("forwards allow-listed Slack filters (channel + keyword) and the SESSION account", async () => {
  mockQuery.mockResolvedValue(okResult());
  const slackParams = Promise.resolve({ provider: "slack" });
  await GET(
    new Request(
      "http://localhost/api/analytics/sources/slack/data?metric=keyword_mentions&range=30d&channel=C012AB3CD&keyword=launch",
    ),
    { params: slackParams },
  );
  const call = mockQuery.mock.calls[0]![0];
  expect(call.providerKey).toBe("slack");
  expect(call.filters).toEqual({ channel: "C012AB3CD", keyword: "launch" });
  expect(call.context).toEqual({ accountId: "acct-1", userId: "u1" });
});

it("does not forward unknown query params as filters (allow-list only)", async () => {
  mockQuery.mockResolvedValue(okResult());
  await GET(req("?metric=open_issues&repo=octocat/hello&evil=DROP+TABLE"), { params });
  const call = mockQuery.mock.calls[0]![0];
  expect(call.filters).toEqual({ repo: "octocat/hello" });
});

it("forwards the calendar filter for provider=google-calendar (session account)", async () => {
  mockQuery.mockResolvedValue(okResult());
  await GET(
    new Request(
      "http://localhost/api/analytics/sources/google-calendar/data?metric=meetings_over_time&range=30d&calendar=primary",
    ),
    { params: Promise.resolve({ provider: "google-calendar" }) },
  );
  const call = mockQuery.mock.calls[0]![0];
  expect(call.providerKey).toBe("google-calendar");
  expect(call.filters).toEqual({ calendar: "primary" });
  expect(call.context).toEqual({ accountId: "acct-1", userId: "u1" });
});

it("forwards the label filter for provider=gmail (session account)", async () => {
  mockQuery.mockResolvedValue(okResult());
  await GET(
    new Request(
      "http://localhost/api/analytics/sources/gmail/data?metric=label_message_count&range=30d&label=Label_7",
    ),
    { params: Promise.resolve({ provider: "gmail" }) },
  );
  const call = mockQuery.mock.calls[0]![0];
  expect(call.providerKey).toBe("gmail");
  expect(call.filters).toEqual({ label: "Label_7" });
  expect(call.context).toEqual({ accountId: "acct-1", userId: "u1" });
});

it("forwards the hubspot_pipeline filter for provider=hubspot (session account)", async () => {
  mockQuery.mockResolvedValue(okResult());
  await GET(
    new Request(
      "http://localhost/api/analytics/sources/hubspot/data?metric=deals_by_stage&range=30d&hubspot_pipeline=default",
    ),
    { params: Promise.resolve({ provider: "hubspot" }) },
  );
  const call = mockQuery.mock.calls[0]![0];
  expect(call.providerKey).toBe("hubspot");
  expect(call.metricKey).toBe("deals_by_stage");
  expect(call.filters).toEqual({ hubspot_pipeline: "default" });
  expect(call.context).toEqual({ accountId: "acct-1", userId: "u1" });
});

it("runs provider=shopify with no filters (account-shared, session account)", async () => {
  mockQuery.mockResolvedValue(okResult());
  await GET(
    new Request("http://localhost/api/analytics/sources/shopify/data?metric=revenue_sum&range=30d"),
    { params: Promise.resolve({ provider: "shopify" }) },
  );
  const call = mockQuery.mock.calls[0]![0];
  expect(call.providerKey).toBe("shopify");
  expect(call.metricKey).toBe("revenue_sum");
  expect(call.filters).toBeUndefined();
  expect(call.context).toEqual({ accountId: "acct-1", userId: "u1" });
});

it("AnalyticsSourceError → 200 { ok:false, code } (safe widget state, not a crash)", async () => {
  mockQuery.mockRejectedValue(new AnalyticsSourceError("Connect your GitHub account.", "MISSING_CREDENTIAL"));
  const res = await GET(req("?metric=open_issues"), { params });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ ok: false, code: "MISSING_CREDENTIAL" });
});

it("unexpected error → 200 generic PROVIDER_ERROR with no raw leak", async () => {
  mockQuery.mockRejectedValue(new Error("boom secret token=abc123"));
  const res = await GET(req("?metric=open_issues"), { params });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(false);
  expect(body.code).toBe("PROVIDER_ERROR");
  expect(JSON.stringify(body)).not.toMatch(/token=abc123|secret/);
});
