/**
 * @jest-environment node
 *
 * Slice 4.PLATFORM-BILLING-BUSINESS-DOWNGRADE-2 / CS-BD-1 — downgradeBusinessToTeam orchestration.
 *
 * Mocks every collaborator. Proves: flag gate; account/owner/type guards; non-owner members
 * removed THROUGH the existing offboarding seam (`removeMember`, never a direct membership delete);
 * owner retained; workflows moved to root (kept, not deleted) and folders sent to Trash
 * (`with_contents`, not hard delete); the atomic flip runs LAST; idempotent/resumable behavior; and
 * that an offboarding failure aborts before the flip.
 */

const mockFlag = jest.fn();
jest.mock("@/services/billing/billingFeatureFlags", () => ({
  isBusinessDowngradeEnabled: () => mockFlag(),
}));

const mockGetAccount = jest.fn();
jest.mock("@/repositories/accounts", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetAccount(...a),
}));

const mockGetRole = jest.fn();
const mockListMembers = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  getRoleServiceRole: (...a: unknown[]) => mockGetRole(...a),
  listByAccount: (...a: unknown[]) => mockListMembers(...a),
}));

const mockRemoveMember = jest.fn();
jest.mock("@/services/accounts/membership", () => ({
  removeMember: (...a: unknown[]) => mockRemoveMember(...a),
}));

const mockListWorkflows = jest.fn();
const mockUpdateFolder = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  listByAccount: (...a: unknown[]) => mockListWorkflows(...a),
  updateFolder: (...a: unknown[]) => mockUpdateFolder(...a),
}));

const mockListFolders = jest.fn();
jest.mock("@/repositories/workflowFolders", () => ({
  listByAccount: (...a: unknown[]) => mockListFolders(...a),
}));

const mockDeleteFolder = jest.fn();
jest.mock("@/services/workflowFolders/trashService", () => ({
  deleteFolder: (...a: unknown[]) => mockDeleteFolder(...a),
}));

const mockFlip = jest.fn();
jest.mock("@/repositories/accountBilling", () => ({
  applyBusinessDowngradeServiceRole: (...a: unknown[]) => mockFlip(...a),
}));

import { downgradeBusinessToTeam } from "@/services/billing/businessDowngrade";

const ACCOUNT = "acct-biz";
const OWNER = "user-owner";

beforeEach(() => {
  jest.clearAllMocks();
  mockFlag.mockReturnValue(true);
  mockGetAccount.mockResolvedValue({ type: "organization", deletionStatus: "active" });
  mockGetRole.mockResolvedValue("owner");
  mockListMembers.mockResolvedValue([
    { userId: OWNER, role: "owner" },
    { userId: "u-admin", role: "admin" },
    { userId: "u-member", role: "member" },
  ]);
  mockRemoveMember.mockResolvedValue({ ok: true });
  mockListWorkflows.mockResolvedValue([
    { id: "wf-1", folderId: "f-1" },
    { id: "wf-2", folderId: null }, // already at root
  ]);
  mockUpdateFolder.mockResolvedValue(undefined);
  mockListFolders.mockResolvedValue([
    { id: "f-1", parentFolderId: null },
    { id: "f-2", parentFolderId: "f-1" }, // child — skipped (covered by parent's with_contents)
  ]);
  mockDeleteFolder.mockResolvedValue({ ok: true, data: {} });
  mockFlip.mockResolvedValue({ ok: true, applied: true, reason: "downgraded" });
});

function call(over: Record<string, unknown> = {}) {
  return downgradeBusinessToTeam({ accountId: ACCOUNT, actorUserId: OWNER, ...over });
}

describe("guards", () => {
  it("returns disabled when the flag is OFF and touches nothing", async () => {
    mockFlag.mockReturnValue(false);
    expect(await call()).toEqual({ ok: false, reason: "disabled" });
    expect(mockGetAccount).not.toHaveBeenCalled();
    expect(mockRemoveMember).not.toHaveBeenCalled();
    expect(mockFlip).not.toHaveBeenCalled();
  });

  it("rejects a missing account", async () => {
    mockGetAccount.mockResolvedValue(null);
    expect(await call()).toEqual({ ok: false, reason: "account_not_found" });
    expect(mockRemoveMember).not.toHaveBeenCalled();
  });

  it("rejects a frozen account", async () => {
    mockGetAccount.mockResolvedValue({ type: "organization", deletionStatus: "pending_deletion" });
    expect(await call()).toEqual({ ok: false, reason: "account_frozen" });
    expect(mockRemoveMember).not.toHaveBeenCalled();
  });

  it("rejects a non-owner actor (destructive — owner only)", async () => {
    mockGetRole.mockResolvedValue("admin");
    expect(await call()).toEqual({ ok: false, reason: "not_owner" });
    expect(mockRemoveMember).not.toHaveBeenCalled();
    expect(mockFlip).not.toHaveBeenCalled();
  });

  it("rejects a personal (non-business) account", async () => {
    mockGetAccount.mockResolvedValue({ type: "personal", deletionStatus: "active" });
    expect(await call()).toEqual({ ok: false, reason: "not_business" });
    expect(mockRemoveMember).not.toHaveBeenCalled();
  });

  it("is a safe no-op when the account is already Team (resumable)", async () => {
    mockGetAccount.mockResolvedValue({ type: "team", deletionStatus: "active" });
    expect(await call()).toEqual({ ok: true, alreadyTeam: true, removedMembers: 0, flattenedFolders: 0 });
    expect(mockRemoveMember).not.toHaveBeenCalled();
    expect(mockFlip).not.toHaveBeenCalled();
  });
});

describe("happy path", () => {
  it("removes all NON-OWNER members via the offboarding seam, keeps the owner", async () => {
    await call();
    const removedTargets = mockRemoveMember.mock.calls.map((c) => (c[0] as { targetUserId: string }).targetUserId);
    expect(removedTargets).toEqual(["u-admin", "u-member"]);
    expect(removedTargets).not.toContain(OWNER); // owner retained
    // offboarding is invoked with actingRole 'owner' so admins can be removed
    expect(mockRemoveMember).toHaveBeenCalledWith({
      accountId: ACCOUNT,
      targetUserId: "u-admin",
      actingRole: "owner",
    });
  });

  it("moves workflows to root (kept, not deleted) and trashes top-level folders with_contents", async () => {
    await call();
    // wf-1 had a folder → moved to root; wf-2 already at root → not touched
    expect(mockUpdateFolder).toHaveBeenCalledTimes(1);
    expect(mockUpdateFolder).toHaveBeenCalledWith("wf-1", null);
    // only the top-level folder is deleted (child f-2 is covered by with_contents)
    expect(mockDeleteFolder).toHaveBeenCalledTimes(1);
    expect(mockDeleteFolder).toHaveBeenCalledWith({ folderId: "f-1", userId: OWNER, mode: "with_contents" });
  });

  it("calls the atomic flip LAST, after members + folders, and returns counts", async () => {
    const r = await call();
    expect(r).toEqual({ ok: true, alreadyTeam: false, removedMembers: 2, flattenedFolders: 1 });
    expect(mockFlip).toHaveBeenCalledWith({ accountId: ACCOUNT, planStatus: "active" });
    const lastRemove = Math.max(...mockRemoveMember.mock.invocationCallOrder);
    const lastDelete = Math.max(...mockDeleteFolder.mock.invocationCallOrder);
    const flipOrder = mockFlip.mock.invocationCallOrder[0]!;
    expect(flipOrder).toBeGreaterThan(lastRemove);
    expect(flipOrder).toBeGreaterThan(lastDelete);
  });

  it("forwards an explicit planStatus to the flip", async () => {
    await call({ planStatus: "canceled" });
    expect(mockFlip).toHaveBeenCalledWith({ accountId: ACCOUNT, planStatus: "canceled" });
  });
});

describe("idempotent / resumable", () => {
  it("treats an already-removed member (member_not_found) as done and continues", async () => {
    mockRemoveMember
      .mockResolvedValueOnce({ ok: false, reason: "member_not_found" }) // u-admin already gone
      .mockResolvedValueOnce({ ok: true }); // u-member removed
    const r = await call();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.removedMembers).toBe(1);
    expect(mockFlip).toHaveBeenCalled();
  });

  it("treats an already-trashed folder (FOLDER_NOT_FOUND) as done and continues", async () => {
    mockDeleteFolder.mockResolvedValueOnce({ ok: false, code: "FOLDER_NOT_FOUND" });
    const r = await call();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.flattenedFolders).toBe(0);
    expect(mockFlip).toHaveBeenCalled();
  });
});

describe("failure handling", () => {
  it("aborts with offboarding_failed (before the flip) on an unexpected member-removal failure", async () => {
    mockRemoveMember.mockResolvedValueOnce({ ok: false, reason: "account_frozen" });
    expect(await call()).toEqual({ ok: false, reason: "offboarding_failed" });
    expect(mockUpdateFolder).not.toHaveBeenCalled();
    expect(mockDeleteFolder).not.toHaveBeenCalled();
    expect(mockFlip).not.toHaveBeenCalled();
  });

  it("aborts with folder_flatten_failed (before the flip) on an unexpected folder error", async () => {
    mockDeleteFolder.mockResolvedValueOnce({ ok: false, code: "LIFECYCLE_CONFLICT" });
    expect(await call()).toEqual({ ok: false, reason: "folder_flatten_failed" });
    expect(mockFlip).not.toHaveBeenCalled();
  });

  it("returns flip_failed when the atomic flip does not apply", async () => {
    mockFlip.mockResolvedValue({ ok: false, applied: false, reason: "account_frozen" });
    expect(await call()).toEqual({ ok: false, reason: "flip_failed" });
  });
});
