/**
 * @jest-environment node
 *
 * Tests for GET /api/internal/react-agent/metrics (INTERNAL-FEEDBACK-2).
 *
 * Runs through the REAL internal-admin gate (only the session read + internal-admin
 * repo lookup are mocked). Business rule: internal-admin-only; anon / non-admin
 * (incl. a customer account owner) get 404 (non-disclosure, never 403); an internal
 * admin gets a 200 count-only DTO; an invalid range → 400; unexpected failure → 500.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockIsInternalAdmin = jest.fn();
jest.mock("@/repositories/internalAdmins", () => ({
  isInternalAdmin: (...a: unknown[]) => mockIsInternalAdmin(...a),
}));

const mockGetMetrics = jest.fn();
class MetricsRangeError extends Error {}
jest.mock("@/services/admin/reactAgentMetrics", () => ({
  getReactAgentMetrics: (...a: unknown[]) => mockGetMetrics(...a),
  MetricsRangeError,
}));

import { GET } from "@/app/api/internal/react-agent/metrics/route";

const DTO = {
  range: { from: null, to: null },
  totals: { agentChanges: 100, governanceEvents: 50 },
  previewFunnel: { created: 40, applied: 25, keptAsPreview: 5, discarded: 8, applyFailed: 3, undone: 2 },
  testOutcomes: { tested: 10, testFailed: 4 },
  setupIssues: { changesWithIssues: 3, totalIssues: 6, workflowsNeedingSetup: 2 },
  governance: { byOutcome: { success: 45, denied: 3, failed: 2 } },
};

const req = (qs = "") => new Request(`http://localhost/api/internal/react-agent/metrics${qs}`);

beforeEach(() => {
  mockGetUser.mockReset();
  mockIsInternalAdmin.mockReset();
  mockGetMetrics.mockReset();
});

describe("GET /api/internal/react-agent/metrics", () => {
  it("404s a signed-out caller and never queries metrics", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(req());
    expect(res.status).toBe(404);
    expect(mockGetMetrics).not.toHaveBeenCalled();
  });

  it("404s a signed-in customer account owner who is not an internal admin", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "owner1", email: "owner@x.io" } } });
    mockIsInternalAdmin.mockResolvedValue(false);
    const res = await GET(req());
    expect(res.status).toBe(404);
    expect(mockGetMetrics).not.toHaveBeenCalled();
  });

  it("returns 200 with a count-only DTO for an internal admin", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "marcus@x.io" } } });
    mockIsInternalAdmin.mockResolvedValue(true);
    mockGetMetrics.mockResolvedValue(DTO);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(DTO);
    // Count-only: no content/id keys anywhere in the payload.
    const s = JSON.stringify(body);
    for (const forbidden of ["prompt", "summary", "failure", "diff", "metadata", "account_id", "user_id", "workflow_id"]) {
      expect(s).not.toContain(forbidden);
    }
  });

  it("forwards from/to to the service", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "marcus@x.io" } } });
    mockIsInternalAdmin.mockResolvedValue(true);
    mockGetMetrics.mockResolvedValue(DTO);
    await GET(req("?from=2026-06-01&to=2026-06-30"));
    expect(mockGetMetrics).toHaveBeenCalledWith({ from: "2026-06-01", to: "2026-06-30" });
  });

  it("maps an invalid range to 400", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "marcus@x.io" } } });
    mockIsInternalAdmin.mockResolvedValue(true);
    mockGetMetrics.mockRejectedValue(new MetricsRangeError("bad range"));
    const res = await GET(req("?from=nope"));
    expect(res.status).toBe(400);
  });

  it("maps an unexpected failure to 500 without leaking detail", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "marcus@x.io" } } });
    mockIsInternalAdmin.mockResolvedValue(true);
    mockGetMetrics.mockRejectedValue(new Error("db exploded with SECRET detail"));
    const res = await GET(req());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toMatch(/SECRET/);
  });
});
