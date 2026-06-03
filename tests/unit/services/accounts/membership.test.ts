/**
 * @jest-environment node
 *
 * Unit tests for the membership management service (4.ACCOUNT-MODEL-16, D2b).
 * Mocks repos so no DB is touched. Proves the owner-target / last-owner guard,
 * admin-manages-members-only, admin↔member-only role change, frozen refusal, and
 * the active-pointer clear on removal.
 */

const mockGetDeletionStatus = jest.fn();
jest.mock("@/repositories/accounts", () => ({
  getDeletionStatusServiceRole: (...a: unknown[]) => mockGetDeletionStatus(...a),
}));

const mockGetRoleSR = jest.fn();
const mockRemove = jest.fn();
const mockUpdateRole = jest.fn();
const mockListByAccount = jest.fn();
const mockListIdentities = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  getRoleServiceRole: (...a: unknown[]) => mockGetRoleSR(...a),
  removeMembershipServiceRole: (...a: unknown[]) => mockRemove(...a),
  updateMemberRoleServiceRole: (...a: unknown[]) => mockUpdateRole(...a),
  listByAccount: (...a: unknown[]) => mockListByAccount(...a),
  listMemberIdentities: (...a: unknown[]) => mockListIdentities(...a),
}));

const mockClearActiveIfMatches = jest.fn();
jest.mock("@/repositories/userProfiles", () => ({
  clearActiveAccountIfMatchesServiceRole: (...a: unknown[]) => mockClearActiveIfMatches(...a),
}));

const mockSoftDisconnect = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  softDisconnectPersonalForMember: (...a: unknown[]) => mockSoftDisconnect(...a),
}));

// TW-5: getMemberWorkflowImpact → countImpactedWorkflowsForMember reads the
// workflows repo. Mock it so the impact path can be exercised without a DB.
const mockWfListByAccount = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  listByAccount: (...a: unknown[]) => mockWfListByAccount(...a),
}));

import {
  listMembers,
  removeMember,
  changeMemberRole,
  getMemberWorkflowImpact,
} from "@/services/accounts/membership";

const ACCOUNT = "team-1";
const TARGET = "user-2";

beforeEach(() => {
  mockGetDeletionStatus.mockReset().mockResolvedValue("active");
  mockGetRoleSR.mockReset();
  mockRemove.mockReset().mockResolvedValue(undefined);
  mockUpdateRole.mockReset().mockResolvedValue(undefined);
  mockListByAccount.mockReset();
  mockListIdentities.mockReset().mockResolvedValue([]);
  mockClearActiveIfMatches.mockReset().mockResolvedValue(undefined);
  mockSoftDisconnect
    .mockReset()
    .mockResolvedValue({ disconnectedCount: 0, disconnectedProviders: [] });
  mockWfListByAccount.mockReset().mockResolvedValue([]);
});

function wfRec(createdByUserId: string, providers: string[]) {
  return {
    id: `wf-${providers.join("-")}-${createdByUserId}`,
    accountId: ACCOUNT,
    createdByUserId,
    name: "wf",
    state: "draft",
    draftDefinition: {
      nodes: providers.map((provider, i) => ({
        id: `n${i}`,
        kind: "action",
        provider,
        type: "x",
        config: {},
        position: { x: 0, y: i },
      })),
      edges: [],
    },
  };
}

describe("getMemberWorkflowImpact (TW-5)", () => {
  it("returns the impacted-workflow count for an authorized removal target", async () => {
    mockGetRoleSR.mockResolvedValue("member"); // target is a removable member
    mockWfListByAccount.mockResolvedValue([
      wfRec(TARGET, ["gmail"]), // personal → counts
      wfRec(TARGET, ["slack"]), // account-only → no
      wfRec("other", ["gmail"]), // other member → no
    ]);

    const r = await getMemberWorkflowImpact({
      accountId: ACCOUNT,
      targetUserId: TARGET,
      actingRole: "owner",
    });
    expect(r).toEqual({ ok: true, affectedWorkflowCount: 1 });
  });

  it("refuses (no count) when the target is the owner — gate fails before any workflow read", async () => {
    mockGetRoleSR.mockResolvedValue("owner");
    const r = await getMemberWorkflowImpact({
      accountId: ACCOUNT,
      targetUserId: TARGET,
      actingRole: "admin",
    });
    expect(r).toEqual({ ok: false, reason: "owner_target" });
    expect(mockWfListByAccount).not.toHaveBeenCalled();
  });

  it("refuses (no count) when an admin targets another admin", async () => {
    mockGetRoleSR.mockResolvedValue("admin");
    const r = await getMemberWorkflowImpact({
      accountId: ACCOUNT,
      targetUserId: TARGET,
      actingRole: "admin",
    });
    expect(r).toEqual({ ok: false, reason: "forbidden_target" });
    expect(mockWfListByAccount).not.toHaveBeenCalled();
  });

  it("refuses (no count) on a frozen account", async () => {
    mockGetDeletionStatus.mockResolvedValue("pending_deletion");
    const r = await getMemberWorkflowImpact({
      accountId: ACCOUNT,
      targetUserId: TARGET,
      actingRole: "owner",
    });
    expect(r).toEqual({ ok: false, reason: "account_frozen" });
    expect(mockWfListByAccount).not.toHaveBeenCalled();
  });
});

describe("listMembers", () => {
  it("merges roster (role/joined) with co-member display identity by userId", async () => {
    mockListByAccount.mockResolvedValueOnce([
      { userId: "a", role: "owner", joinedAt: "t1", invitedByUserId: null },
      { userId: "b", role: "member", joinedAt: "t2", invitedByUserId: "a" },
    ]);
    mockListIdentities.mockResolvedValueOnce([
      { userId: "a", email: "a@x.io", displayName: "Ada" },
      { userId: "b", email: "b@x.io", displayName: null },
    ]);
    const r = await listMembers(ACCOUNT);
    expect(r).toEqual([
      { userId: "a", role: "owner", joinedAt: "t1", invitedByUserId: null, email: "a@x.io", displayName: "Ada" },
      { userId: "b", role: "member", joinedAt: "t2", invitedByUserId: "a", email: "b@x.io", displayName: null },
    ]);
    expect(mockListByAccount).toHaveBeenCalledWith(ACCOUNT);
    expect(mockListIdentities).toHaveBeenCalledWith(ACCOUNT);
  });

  it("falls back to null identity when no identity row matches a member", async () => {
    mockListByAccount.mockResolvedValueOnce([
      { userId: "a", role: "owner", joinedAt: "t1", invitedByUserId: null },
    ]);
    mockListIdentities.mockResolvedValueOnce([]); // RPC returned nothing for 'a'
    const r = await listMembers(ACCOUNT);
    expect(r).toEqual([
      { userId: "a", role: "owner", joinedAt: "t1", invitedByUserId: null, email: null, displayName: null },
    ]);
  });
});

describe("removeMember", () => {
  it("owner removes an admin → deletes membership + clears active pointer", async () => {
    mockGetRoleSR.mockResolvedValueOnce("admin");
    const r = await removeMember({ accountId: ACCOUNT, targetUserId: TARGET, actingRole: "owner" });
    expect(r).toEqual({ ok: true });
    expect(mockRemove).toHaveBeenCalledWith(ACCOUNT, TARGET);
    expect(mockClearActiveIfMatches).toHaveBeenCalledWith(TARGET, ACCOUNT);
  });

  it("offboarding (22C): soft-disconnects the removed member's personal creds, before membership deletion", async () => {
    mockGetRoleSR.mockResolvedValueOnce("member");
    mockSoftDisconnect.mockResolvedValueOnce({
      disconnectedCount: 1,
      disconnectedProviders: ["gmail"],
    });
    const r = await removeMember({ accountId: ACCOUNT, targetUserId: TARGET, actingRole: "owner" });
    expect(r).toEqual({ ok: true });
    expect(mockSoftDisconnect).toHaveBeenCalledWith({
      accountId: ACCOUNT,
      connectedByUserId: TARGET,
    });
    // Disconnect happens BEFORE the membership delete (retry-safety).
    const disconnectOrder = mockSoftDisconnect.mock.invocationCallOrder[0]!;
    const removeOrder = mockRemove.mock.invocationCallOrder[0]!;
    expect(disconnectOrder).toBeLessThan(removeOrder);
  });

  it("does NOT soft-disconnect when the gate fails (owner_target)", async () => {
    mockGetRoleSR.mockResolvedValueOnce("owner");
    const r = await removeMember({ accountId: ACCOUNT, targetUserId: TARGET, actingRole: "owner" });
    expect(r).toEqual({ ok: false, reason: "owner_target" });
    expect(mockSoftDisconnect).not.toHaveBeenCalled();
  });

  it("does NOT soft-disconnect on a frozen account", async () => {
    mockGetDeletionStatus.mockResolvedValueOnce("pending_deletion");
    const r = await removeMember({ accountId: ACCOUNT, targetUserId: TARGET, actingRole: "owner" });
    expect(r).toEqual({ ok: false, reason: "account_frozen" });
    expect(mockSoftDisconnect).not.toHaveBeenCalled();
  });

  it("admin removes a member → allowed", async () => {
    mockGetRoleSR.mockResolvedValueOnce("member");
    const r = await removeMember({ accountId: ACCOUNT, targetUserId: TARGET, actingRole: "admin" });
    expect(r).toEqual({ ok: true });
    expect(mockRemove).toHaveBeenCalled();
  });

  it("refuses removing the OWNER (owner_target) — never deletes", async () => {
    mockGetRoleSR.mockResolvedValueOnce("owner");
    const r = await removeMember({ accountId: ACCOUNT, targetUserId: TARGET, actingRole: "owner" });
    expect(r).toEqual({ ok: false, reason: "owner_target" });
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("refuses an ADMIN removing another ADMIN (forbidden_target)", async () => {
    mockGetRoleSR.mockResolvedValueOnce("admin");
    const r = await removeMember({ accountId: ACCOUNT, targetUserId: TARGET, actingRole: "admin" });
    expect(r).toEqual({ ok: false, reason: "forbidden_target" });
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("refuses on a frozen account", async () => {
    mockGetDeletionStatus.mockResolvedValueOnce("pending_deletion");
    const r = await removeMember({ accountId: ACCOUNT, targetUserId: TARGET, actingRole: "owner" });
    expect(r).toEqual({ ok: false, reason: "account_frozen" });
    expect(mockGetRoleSR).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("404s a non-member target", async () => {
    mockGetRoleSR.mockResolvedValueOnce(null);
    const r = await removeMember({ accountId: ACCOUNT, targetUserId: TARGET, actingRole: "owner" });
    expect(r).toEqual({ ok: false, reason: "member_not_found" });
    expect(mockRemove).not.toHaveBeenCalled();
  });
});

describe("changeMemberRole", () => {
  it("owner promotes a member to admin", async () => {
    mockGetRoleSR.mockResolvedValueOnce("member");
    const r = await changeMemberRole({ accountId: ACCOUNT, targetUserId: TARGET, newRole: "admin", actingRole: "owner" });
    expect(r).toEqual({ ok: true });
    expect(mockUpdateRole).toHaveBeenCalledWith(ACCOUNT, TARGET, "admin");
  });

  it("refuses changing a role to owner (invalid_role — transfer is D5)", async () => {
    const r = await changeMemberRole({ accountId: ACCOUNT, targetUserId: TARGET, newRole: "owner" as never, actingRole: "owner" });
    expect(r).toEqual({ ok: false, reason: "invalid_role" });
    expect(mockGetRoleSR).not.toHaveBeenCalled();
    expect(mockUpdateRole).not.toHaveBeenCalled();
  });

  it("refuses changing the OWNER's role (owner_target)", async () => {
    mockGetRoleSR.mockResolvedValueOnce("owner");
    const r = await changeMemberRole({ accountId: ACCOUNT, targetUserId: TARGET, newRole: "member", actingRole: "owner" });
    expect(r).toEqual({ ok: false, reason: "owner_target" });
    expect(mockUpdateRole).not.toHaveBeenCalled();
  });

  it("refuses an ADMIN changing another ADMIN's role (forbidden_target)", async () => {
    mockGetRoleSR.mockResolvedValueOnce("admin");
    const r = await changeMemberRole({ accountId: ACCOUNT, targetUserId: TARGET, newRole: "member", actingRole: "admin" });
    expect(r).toEqual({ ok: false, reason: "forbidden_target" });
    expect(mockUpdateRole).not.toHaveBeenCalled();
  });

  it("refuses on a frozen account", async () => {
    mockGetDeletionStatus.mockResolvedValueOnce("pending_deletion");
    const r = await changeMemberRole({ accountId: ACCOUNT, targetUserId: TARGET, newRole: "admin", actingRole: "owner" });
    expect(r).toEqual({ ok: false, reason: "account_frozen" });
  });
});
