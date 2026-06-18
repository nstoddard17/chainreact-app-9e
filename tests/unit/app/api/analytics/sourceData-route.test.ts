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
