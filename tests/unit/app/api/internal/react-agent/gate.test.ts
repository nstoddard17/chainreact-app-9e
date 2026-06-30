/**
 * @jest-environment node
 *
 * Tests for the internal-admin gate seam (app/api/internal/react-agent/_shared.ts,
 * INTERNAL-FEEDBACK-1).
 *
 * Business rule: the gate distinguishes three states so each consumer applies its
 * own denial convention — `anonymous` (no session), `denied` (signed in, not an
 * internal admin), `ok` (internal admin). The API wrapper `requireInternalAdmin`
 * collapses anonymous+denied to a single 404 (non-disclosure: never 403). A
 * customer account owner/admin is exactly the `denied` case.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockIsInternalAdmin = jest.fn();
jest.mock("@/repositories/internalAdmins", () => ({
  isInternalAdmin: (...a: unknown[]) => mockIsInternalAdmin(...a),
}));

import { loadInternalAdmin, requireInternalAdmin } from "@/app/api/internal/react-agent/_shared";

beforeEach(() => {
  mockGetUser.mockReset();
  mockIsInternalAdmin.mockReset();
});

describe("loadInternalAdmin", () => {
  it("reports anonymous when there is no session", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    await expect(loadInternalAdmin()).resolves.toEqual({ status: "anonymous" });
    expect(mockIsInternalAdmin).not.toHaveBeenCalled();
  });

  it("reports denied for a signed-in user who is not an internal admin", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "owner1", email: "owner@x.io" } } });
    mockIsInternalAdmin.mockResolvedValue(false);
    await expect(loadInternalAdmin()).resolves.toEqual({ status: "denied" });
    expect(mockIsInternalAdmin).toHaveBeenCalledWith("owner1");
  });

  it("reports ok with id + email for an internal admin", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "marcus@x.io" } } });
    mockIsInternalAdmin.mockResolvedValue(true);
    await expect(loadInternalAdmin()).resolves.toEqual({
      status: "ok",
      userId: "u1",
      email: "marcus@x.io",
    });
  });
});

describe("requireInternalAdmin (API wrapper)", () => {
  it("returns a 404 (not 403) for an anonymous caller — non-disclosure", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const result = await requireInternalAdmin();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(404);
  });

  it("returns a 404 for a signed-in non-internal-admin (e.g. account owner)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "owner1", email: "owner@x.io" } } });
    mockIsInternalAdmin.mockResolvedValue(false);
    const result = await requireInternalAdmin();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(404);
  });

  it("passes through the internal admin's id + email", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "marcus@x.io" } } });
    mockIsInternalAdmin.mockResolvedValue(true);
    const result = await requireInternalAdmin();
    expect(result).toEqual({ ok: true, userId: "u1", email: "marcus@x.io" });
  });
});
