/**
 * @jest-environment node
 *
 * Unit tests for requireAccountRole (4.ACCOUNT-MODEL-15). Mocks
 * accountMemberships.getRole so the allow/deny logic is isolated.
 */

const mockGetRole = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  getRole: (...a: unknown[]) => mockGetRole(...a),
}));

import { requireAccountRole } from "@/services/accounts/accountAuthz";

beforeEach(() => mockGetRole.mockReset());

describe("requireAccountRole", () => {
  it("allows a caller whose role is in the allowed set", async () => {
    mockGetRole.mockResolvedValueOnce("admin");
    const r = await requireAccountRole("u1", "acct-1", ["owner", "admin"]);
    expect(r).toEqual({ ok: true, role: "admin" });
  });

  it("forbids a caller whose role is NOT in the allowed set", async () => {
    mockGetRole.mockResolvedValueOnce("member");
    const r = await requireAccountRole("u1", "acct-1", ["owner", "admin"]);
    expect(r).toEqual({ ok: false, reason: "forbidden" });
  });

  it("returns not_member when the caller has no membership row", async () => {
    mockGetRole.mockResolvedValueOnce(null);
    const r = await requireAccountRole("u1", "acct-1", ["owner", "admin"]);
    expect(r).toEqual({ ok: false, reason: "not_member" });
  });

  it("passes (accountId, userId) to getRole in that order", async () => {
    mockGetRole.mockResolvedValueOnce("owner");
    await requireAccountRole("u1", "acct-1", ["owner"]);
    expect(mockGetRole).toHaveBeenCalledWith("acct-1", "u1");
  });
});
