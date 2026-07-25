/**
 * @jest-environment node
 *
 * ANALYTICS-CONNECTED-DATA-CD-1 — POST /api/analytics/insights/query gate +
 * safe error mapping. Orchestrator mocked; gate/parse/mapping real.
 */
const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));
const mockResolveActiveAccount = jest.fn();
jest.mock("@/services/accounts/activeAccount", () => ({
  resolveActiveAccount: (...args: unknown[]) => mockResolveActiveAccount(...args),
}));
const mockRun = jest.fn();
jest.mock("@/services/analytics/insights/runConnectedQuery", () => ({
  runConnectedAnalyticsQuery: (...args: unknown[]) => mockRun(...args),
}));

import { POST } from "@/app/api/analytics/insights/query/route";
import { ConnectedAnalyticsError } from "@/contracts/connectedAnalytics";

const BODY = {
  source: "chainreact", dataset: "workflow_runs",
  measure: "runs", dimension: null, range: { preset: "7d" },
};
const post = (body: unknown) =>
  POST(new Request("http://localhost/api/analytics/insights/query", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));

beforeEach(() => {
  mockGetUser.mockReset().mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  mockResolveActiveAccount.mockReset().mockResolvedValue({ ok: true, accountId: "acct-1" });
  mockRun.mockReset();
});

describe("POST /api/analytics/insights/query", () => {
  it("401 unauthenticated; 403 frozen; scope is session-derived", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect((await post(BODY)).status).toBe(401);
    mockResolveActiveAccount.mockResolvedValueOnce({ ok: false, reason: "account_frozen" });
    expect((await post(BODY)).status).toBe(403);
    mockRun.mockResolvedValue({ kind: "kpi" });
    await post(BODY);
    expect(mockRun.mock.calls[0]![0]).toEqual({ accountId: "acct-1", userId: "u1" });
  });

  it("400 strict-body violations (unknown keys / account id injection)", async () => {
    expect((await post({ ...BODY, accountId: "acct-2" })).status).toBe(400);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("maps typed errors: UNKNOWN_SOURCE/UNKNOWN_DATASET/INVALID_QUERY → 400", async () => {
    for (const code of ["UNKNOWN_SOURCE", "UNKNOWN_DATASET", "INVALID_QUERY"] as const) {
      mockRun.mockRejectedValueOnce(new ConnectedAnalyticsError("Nope.", code));
      const res = await post(BODY);
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe(code);
    }
  });

  it("UNKNOWN_ENTITY is byte-identical regardless of thrown detail (no leak)", async () => {
    mockRun.mockRejectedValueOnce(new ConnectedAnalyticsError("generic", "UNKNOWN_ENTITY"));
    const a = await (await post(BODY)).json();
    mockRun.mockRejectedValueOnce(
      new ConnectedAnalyticsError(`cross-account id 22222222-…`, "UNKNOWN_ENTITY"),
    );
    const b = await (await post(BODY)).json();
    expect(a).toEqual(b);
    expect(a).toEqual({ error: "One or more selected items were not found.", code: "UNKNOWN_ENTITY" });
  });

  it("200 wraps the result; unexpected error → generic 500 without internals", async () => {
    mockRun.mockResolvedValueOnce({ kind: "kpi", value: 3 });
    const ok = await post(BODY);
    expect(ok.status).toBe(200);
    expect((await ok.json()).result.value).toBe(3);

    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockRun.mockRejectedValueOnce(new Error('workflow_runs scan failed for acct-1'));
    const res = await post(BODY);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Analytics query failed.", code: "ANALYTICS_QUERY_FAILED" });
    expect(JSON.stringify(body)).not.toContain("acct-1");
    spy.mockRestore();
  });
});
