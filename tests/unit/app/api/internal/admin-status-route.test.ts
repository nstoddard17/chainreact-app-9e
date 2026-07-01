/**
 * @jest-environment node
 *
 * Tests for GET /api/internal/admin-status (internal-admin nav gate).
 *
 * Business rule: caller-only self-check — returns ONLY the caller's own boolean,
 * decided solely by the `internal_admins` gate (`loadInternalAdmin` → the
 * `isInternalAdmin` repo). Customer account roles never affect it. Anonymous →
 * 401 {false}; authenticated non-admin (incl. an account owner) → 200 {false};
 * internal admin → 200 {true}. Never returns the roster or any other data.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockIsInternalAdmin = jest.fn();
jest.mock("@/repositories/internalAdmins", () => ({
  isInternalAdmin: (...a: unknown[]) => mockIsInternalAdmin(...a),
}));

import { GET } from "@/app/api/internal/admin-status/route";

beforeEach(() => {
  mockGetUser.mockReset();
  mockIsInternalAdmin.mockReset();
});

describe("GET /api/internal/admin-status", () => {
  it("401 { isInternalAdmin:false } for an anonymous caller (never queries membership)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ isInternalAdmin: false });
    expect(mockIsInternalAdmin).not.toHaveBeenCalled();
  });

  it("200 { isInternalAdmin:false } for a signed-in normal user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "u1@x.io" } } });
    mockIsInternalAdmin.mockResolvedValue(false);
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ isInternalAdmin: false });
  });

  it("200 { isInternalAdmin:false } for a customer account owner who is not seeded", async () => {
    // Being an account owner/admin/org admin confers nothing here — only the
    // internal_admins membership (mocked false) decides.
    mockGetUser.mockResolvedValue({ data: { user: { id: "owner1", email: "owner@co.io" } } });
    mockIsInternalAdmin.mockResolvedValue(false);
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ isInternalAdmin: false });
    expect(mockIsInternalAdmin).toHaveBeenCalledWith("owner1");
  });

  it("200 { isInternalAdmin:true } for a seeded internal admin", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "marcus", email: "marcus@x.io" } } });
    mockIsInternalAdmin.mockResolvedValue(true);
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ isInternalAdmin: true });
  });

  it("fails closed to 500 { isInternalAdmin:false } if the check throws", async () => {
    mockGetUser.mockRejectedValue(new Error("session read blew up with SECRET detail"));
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ isInternalAdmin: false });
    expect(JSON.stringify(body)).not.toMatch(/SECRET/);
  });
});
