/**
 * @jest-environment node
 *
 * Slice 4.BILLING-PLAN-METADATA-6 / CS-5 — downgradePreview service. Mocks the member +
 * folder reads; asserts it gathers real counts and runs the pure rules (no mutation).
 */

const mockListMembers = jest.fn();
jest.mock("@/services/accounts/membership", () => ({
  listMembers: (...a: unknown[]) => mockListMembers(...a),
}));

const mockListFolders = jest.fn();
jest.mock("@/repositories/workflowFolders", () => ({
  listByAccount: (...a: unknown[]) => mockListFolders(...a),
}));

import { previewDowngrade } from "@/services/billing/downgradePreview";

function members(n: number) {
  return Array.from({ length: n }, (_, i) => ({ userId: `u${i}` }));
}
function folders(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `f${i}` }));
}

beforeEach(() => {
  mockListMembers.mockReset();
  mockListFolders.mockReset();
});

it("allows a downgrade when current usage fits the target plan", async () => {
  mockListMembers.mockResolvedValueOnce(members(3));
  mockListFolders.mockResolvedValueOnce(folders(40));
  const r = await previewDowngrade("acct-1", "team");
  expect(r.ok).toBe(true);
  expect(mockListMembers).toHaveBeenCalledWith("acct-1");
  expect(mockListFolders).toHaveBeenCalledWith("acct-1");
});

it("blocks when the live member count exceeds the target cap", async () => {
  mockListMembers.mockResolvedValueOnce(members(9)); // > Team's 5
  mockListFolders.mockResolvedValueOnce(folders(10));
  const r = await previewDowngrade("acct-1", "team");
  expect(r.ok).toBe(false);
  expect(r.blockers).toContainEqual({ kind: "members", current: 9, limit: 5 });
});

it("blocks when the live folder count exceeds the target cap", async () => {
  mockListMembers.mockResolvedValueOnce(members(2));
  mockListFolders.mockResolvedValueOnce(folders(140)); // > Team's 100
  const r = await previewDowngrade("acct-1", "team");
  expect(r.ok).toBe(false);
  expect(r.blockers).toContainEqual({ kind: "folders", current: 140, limit: 100 });
});
