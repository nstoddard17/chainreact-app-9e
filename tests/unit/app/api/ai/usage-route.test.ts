/**
 * @jest-environment node
 *
 * Tests for GET /api/ai/usage (Slice 4.AI-12).
 *
 * Auth runs through the real `requireUser` (createClient mocked); the analytics
 * service is mocked so the route's auth / query-validation / range / shape /
 * no-leak / read-only contract is isolated. The route is ACCOUNT-scoped
 * (4.ACCOUNT-MODEL-9d) and read-only — these assert it never writes the ledger
 * or imports model/planner, and that it queries by the caller's account.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

const mockEnsurePersonalAccount = jest.fn();
jest.mock("@/services/accounts/ensurePersonalAccount", () => ({
  ensurePersonalAccount: (...a: unknown[]) => mockEnsurePersonalAccount(...a),
}));

const mockGetAnalytics = jest.fn();
jest.mock("@/services/analytics/aiAnalyticsReport", () => ({
  getAiAnalyticsForAccount: (...a: unknown[]) => mockGetAnalytics(...a),
}));

import { GET } from "@/app/api/ai/usage/route";

const sampleReport = {
  overview: {
    totalEvents: 3,
    totalInputTokens: 10,
    totalOutputTokens: 20,
    totalEstimatedCostMicros: 0,
    totalAiCredits: 0,
    acceptedCount: 1,
    rejectedCount: 0,
    byFeature: { workflow_creation: 3 },
    byEventType: { ai_patch_applied: 1 },
    modelCallsCompleted: 1,
    modelCallsFailed: 0,
    totalTokens: 30,
    toolCallCount: 0,
    toolFailureCount: 0,
    safetyBlockCount: 0,
    latencyAvgMs: 100,
    latencyP95Ms: 100,
  },
  byFeature: { workflow_creation: { count: 3, inputTokens: 10, outputTokens: 20, totalTokens: 30, estimatedCostMicros: 0, aiCredits: 0 } },
  byModel: {},
  patchOutcomes: { proposed: 1, validationFailed: 0, previewed: 1, applied: 1, rejected: 0, acceptanceRate: 1 },
  toolStats: { totalCalls: 0, totalFailures: 0, byTool: {} },
  validationFailures: {},
  safetyBlocks: {},
  feedback: { total: 0, accepted: 0, rejected: 0 },
  templateSignals: { recommended: 0, instantiated: 0, metadataTemplateIdCount: 0 },
  customNodeSignals: { customProviderIdCount: 0, customNodeIdCount: 0 },
};

function call(query = "") {
  return GET(new Request(`http://x/api/ai/usage${query}`));
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  mockEnsurePersonalAccount.mockReset();
  mockEnsurePersonalAccount.mockResolvedValue({ id: "acct-user-1" });
  mockGetAnalytics.mockReset();
  mockGetAnalytics.mockResolvedValue(sampleReport);
});

describe("auth", () => {
  it("returns 401 for an unauthenticated request and never calls the service", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "no session" } });
    const res = await call();
    expect(res.status).toBe(401);
    expect(mockGetAnalytics).not.toHaveBeenCalled();
  });
});

describe("default range + scope", () => {
  it("returns 200 with a ~30-day default range, account scope, and the report", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scope).toBe("account");
    expect(body.range.from).toBeDefined();
    expect(body.range.to).toBeDefined();
    expect(body.overview.totalEvents).toBe(3);
    const spanDays = (Date.parse(body.range.to) - Date.parse(body.range.from)) / 86_400_000;
    expect(Math.round(spanDays)).toBe(30);
  });

  it("scopes the service call to the caller's account (never another account)", async () => {
    await call();
    expect(mockEnsurePersonalAccount).toHaveBeenCalledWith("user-1");
    expect(mockGetAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "acct-user-1" }),
    );
  });
});

describe("query validation", () => {
  it("returns 400 for an invalid 'from' date", async () => {
    const res = await call("?from=not-a-date");
    expect(res.status).toBe(400);
    expect(mockGetAnalytics).not.toHaveBeenCalled();
  });

  it("returns 400 when 'from' is after 'to'", async () => {
    const res = await call("?from=2026-05-25T00:00:00Z&to=2026-05-01T00:00:00Z");
    expect(res.status).toBe(400);
  });

  it.each(["0", "999", "abc", "1.5", "-5"])("returns 400 for invalid days=%s", async (days) => {
    const res = await call(`?days=${days}`);
    expect(res.status).toBe(400);
  });

  it.each(["0", "99999", "abc", "2.5"])("returns 400 for invalid limit=%s", async (limit) => {
    const res = await call(`?limit=${limit}`);
    expect(res.status).toBe(400);
  });

  it("accepts a valid days param and computes the range", async () => {
    const res = await call("?days=7");
    expect(res.status).toBe(200);
    const body = await res.json();
    const spanDays = (Date.parse(body.range.to) - Date.parse(body.range.from)) / 86_400_000;
    expect(Math.round(spanDays)).toBe(7);
  });

  it("forwards a valid limit to the service", async () => {
    await call("?limit=50");
    expect(mockGetAnalytics).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }));
  });
});

describe("response shape + empty data", () => {
  it("has the full report shape", async () => {
    const res = await call();
    const body = await res.json();
    for (const key of [
      "overview",
      "byFeature",
      "byModel",
      "patchOutcomes",
      "toolStats",
      "validationFailures",
      "safetyBlocks",
      "feedback",
      "templateSignals",
      "customNodeSignals",
    ]) {
      expect(body).toHaveProperty(key);
    }
  });

  it("returns zeros/empties when there is no data", async () => {
    mockGetAnalytics.mockResolvedValueOnce({
      ...sampleReport,
      overview: { ...sampleReport.overview, totalEvents: 0 },
      byFeature: {},
      byModel: {},
    });
    const res = await call();
    const body = await res.json();
    expect(body.overview.totalEvents).toBe(0);
    expect(body.byFeature).toEqual({});
  });
});

describe("errors", () => {
  it("returns a sanitized 500 when the service throws (no internals leaked)", async () => {
    mockGetAnalytics.mockRejectedValueOnce(new Error("listByUser failed: secret-connection-string"));
    const res = await call();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("secret-connection-string");
    expect(body.error).toBe("Failed to load AI analytics.");
  });
});

describe("read-only / no-leak", () => {
  it("does not import a model client, planner, apply, or event-write path", () => {
    const src = readFileSync(resolve(process.cwd(), "app/api/ai/usage/route.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["']@\/services\/ai\/planner/);
    expect(src).not.toMatch(/from\s+["']@\/services\/ai\/apply/);
    expect(src).not.toMatch(/from\s+["']@\/services\/ai\/modelClients/);
    expect(src).not.toMatch(/from\s+["']@\/services\/ai\/events/);
    expect(src).not.toMatch(/recordAi|insertEvent/);
  });

  it("response contains no secret-identifier substrings", async () => {
    const res = await call();
    const serialized = JSON.stringify(await res.json());
    for (const needle of ["accessToken", "refreshToken", "apiSecret", "clientSecret", "botToken", "Authorization", "Bearer ", "sk-ant-"]) {
      expect(serialized).not.toContain(needle);
    }
  });
});
