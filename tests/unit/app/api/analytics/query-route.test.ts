/**
 * @jest-environment node
 *
 * ANALYTICS-FLEXIBILITY-CS-1 — POST /api/analytics/query gate + error mapping.
 * The service is mocked; the route's auth resolution, strict parsing, and
 * SAFE error responses (non-leaking workflow errors, generic 500) are real.
 */
const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockResolveActiveAccount = jest.fn();
jest.mock("@/services/accounts/activeAccount", () => ({
  resolveActiveAccount: (...args: unknown[]) => mockResolveActiveAccount(...args),
}));

const mockRunAnalyticsQuery = jest.fn();
jest.mock("@/services/analytics/insightQuery", () => {
  const actual = jest.requireActual("@/services/analytics/insightQuery");
  return {
    ...actual,
    runAnalyticsQuery: (...args: unknown[]) => mockRunAnalyticsQuery(...args),
  };
});

import { POST } from "@/app/api/analytics/query/route";
import {
  AnalyticsQueryError,
  UNKNOWN_WORKFLOW_MESSAGE,
} from "@/services/analytics/insightQuery";

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/analytics/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const VALID_BODY = { measure: "runs", dimension: null, range: { preset: "7d" } };

beforeEach(() => {
  mockGetUser.mockReset();
  mockResolveActiveAccount.mockReset();
  mockRunAnalyticsQuery.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  mockResolveActiveAccount.mockResolvedValue({ ok: true, accountId: "acct-1" });
});

describe("POST /api/analytics/query — gate", () => {
  it("401 unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await post(VALID_BODY);
    expect(res.status).toBe(401);
    expect(mockRunAnalyticsQuery).not.toHaveBeenCalled();
  });

  it("403 when the active account is frozen / not a member", async () => {
    mockResolveActiveAccount.mockResolvedValue({ ok: false, reason: "account_frozen" });
    const res = await post(VALID_BODY);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("ACCOUNT_PENDING_DELETION");
  });

  it("scope comes from the session — the service gets the resolved account id", async () => {
    mockRunAnalyticsQuery.mockResolvedValue({ kind: "kpi" });
    await post(VALID_BODY);
    expect(mockRunAnalyticsQuery).toHaveBeenCalledTimes(1);
    expect(mockRunAnalyticsQuery.mock.calls[0]![0]).toBe("acct-1");
  });
});

describe("POST /api/analytics/query — validation + error mapping", () => {
  it("400 on strict-schema violations (unknown keys)", async () => {
    const res = await post({ ...VALID_BODY, accountId: "acct-2" });
    expect(res.status).toBe(400);
    expect(mockRunAnalyticsQuery).not.toHaveBeenCalled();
  });

  it("400 on invalid JSON", async () => {
    const res = await POST(
      new Request("http://localhost/api/analytics/query", {
        method: "POST",
        body: "not json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("maps INVALID_QUERY to a stable typed 400", async () => {
    mockRunAnalyticsQuery.mockRejectedValue(
      new AnalyticsQueryError("Success rate can't be shown over status.", "INVALID_QUERY"),
    );
    const res = await post(VALID_BODY);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_QUERY");
    expect(body.error).toBe("Success rate can't be shown over status.");
  });

  it("UNKNOWN_WORKFLOW is byte-identical regardless of the thrown detail (no leak)", async () => {
    mockRunAnalyticsQuery.mockRejectedValueOnce(
      new AnalyticsQueryError(UNKNOWN_WORKFLOW_MESSAGE, "UNKNOWN_WORKFLOW"),
    );
    const nonexistent = await post(VALID_BODY);
    mockRunAnalyticsQuery.mockRejectedValueOnce(
      // Even if a future service version put an id in the message, the route
      // must not echo it.
      new AnalyticsQueryError("cross-account id 22222222-…", "UNKNOWN_WORKFLOW"),
    );
    const crossAccount = await post(VALID_BODY);

    expect(nonexistent.status).toBe(400);
    expect(crossAccount.status).toBe(400);
    const a = await nonexistent.json();
    const b = await crossAccount.json();
    expect(a).toEqual(b);
    expect(a).toEqual({ error: UNKNOWN_WORKFLOW_MESSAGE, code: "UNKNOWN_WORKFLOW" });
  });

  it("200 wraps the normalized result", async () => {
    const result = { kind: "kpi", measure: "runs", value: 3 };
    mockRunAnalyticsQuery.mockResolvedValue(result);
    const res = await post(VALID_BODY);
    expect(res.status).toBe(200);
    expect((await res.json()).result).toEqual(result);
  });

  it("unexpected failure → generic 500, no internals leaked", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockRunAnalyticsQuery.mockRejectedValue(
      new Error('relation "workflow_runs" scan failed for account acct-1'),
    );
    const res = await post(VALID_BODY);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      error: "Analytics query failed.",
      code: "ANALYTICS_QUERY_FAILED",
    });
    expect(JSON.stringify(body)).not.toContain("workflow_runs");
    expect(JSON.stringify(body)).not.toContain("acct-1");
    spy.mockRestore();
  });
});
