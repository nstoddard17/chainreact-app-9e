/**
 * @jest-environment node
 *
 * Analytics API auth gate (Slice ANALYTICS-1 closeout). Proves the routes return
 * a clean 401 for an unauthenticated caller (not a 500) — deterministic coverage
 * of the `requireAccount` gate, independent of any local `next start` quirks.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

import { GET as getData } from "@/app/api/analytics/data/route";
import { GET as listDashboards, POST as createDashboard } from "@/app/api/analytics/dashboards/route";

beforeEach(() => {
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
});

describe("analytics API — unauthenticated returns 401 (not 500)", () => {
  it("GET /api/analytics/data → 401", async () => {
    const res = await getData(new Request("http://localhost/api/analytics/data?range=7d"));
    expect(res.status).toBe(401);
  });

  it("GET /api/analytics/dashboards → 401", async () => {
    const res = await listDashboards();
    expect(res.status).toBe(401);
  });

  it("POST /api/analytics/dashboards → 401", async () => {
    const res = await createDashboard(
      new Request("http://localhost/api/analytics/dashboards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "X" }),
      }),
    );
    expect(res.status).toBe(401);
  });
});
