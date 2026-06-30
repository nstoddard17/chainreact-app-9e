/**
 * @jest-environment node
 *
 * Tests for GET /api/internal/react-agent/overview (INTERNAL-FEEDBACK-1).
 *
 * Runs through the REAL gate (`requireInternalAdmin`) — only the session read and
 * the internal-admin repo lookup are mocked at their boundaries. Business rule:
 * the endpoint is internal-admin-only and returns a metric-free stub. Anyone else
 * — signed out, or a signed-in customer account owner/admin — gets a 404
 * (non-disclosure), never a 403 and never data.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockIsInternalAdmin = jest.fn();
jest.mock("@/repositories/internalAdmins", () => ({
  isInternalAdmin: (...a: unknown[]) => mockIsInternalAdmin(...a),
}));

import { GET } from "@/app/api/internal/react-agent/overview/route";

beforeEach(() => {
  mockGetUser.mockReset();
  mockIsInternalAdmin.mockReset();
});

describe("GET /api/internal/react-agent/overview", () => {
  it("404s a signed-out caller without revealing the surface", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET();
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "not_found" });
    expect(mockIsInternalAdmin).not.toHaveBeenCalled();
  });

  it("404s a signed-in customer account owner who is not an internal admin", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "owner1", email: "owner@x.io" } } });
    mockIsInternalAdmin.mockResolvedValue(false);
    const res = await GET();
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "not_found" });
  });

  it("returns a metric-free stub for an internal admin", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "marcus@x.io" } } });
    mockIsInternalAdmin.mockResolvedValue(true);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("not_connected");
    expect(body.sections.map((s: { id: string }) => s.id)).toEqual([
      "overview",
      "preview-funnel",
      "setup-issues",
      "test-outcomes",
      "recent-attempts",
    ]);
    // No metric numbers anywhere in the payload.
    expect(JSON.stringify(body)).not.toMatch(/\d/);
  });
});
