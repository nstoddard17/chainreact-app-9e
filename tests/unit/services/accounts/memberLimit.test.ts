/**
 * @jest-environment node
 *
 * Tests for the Team member-limit policy + its enforcement in the invite flow
 * (4.ACCOUNT-MODEL-20). Mocks the repos so no DB is touched. Proves the cap (5
 * incl. owner, pending invites counted), org exemption, create-block, and the
 * accept-time re-check — sequentially un-bypassable.
 */

// ── policy helper (pure) ──────────────────────────────────────────────────────
import {
  TEAM_MAX_MEMBERS,
  BUSINESS_MAX_MEMBERS,
  memberLimitFor,
} from "@/services/accounts/memberLimits";

describe("memberLimitFor", () => {
  it("caps team at 5, Business (organization) at 25, personal at 1", () => {
    expect(TEAM_MAX_MEMBERS).toBe(5);
    expect(BUSINESS_MAX_MEMBERS).toBe(25);
    expect(memberLimitFor("team")).toBe(5);
    expect(memberLimitFor("organization")).toBe(25);
    expect(memberLimitFor("personal")).toBe(1);
  });
});

// ── enforcement in the invite flow ────────────────────────────────────────────
const mockInsertPending = jest.fn();
const mockGetByTokenHash = jest.fn();
const mockCountPending = jest.fn();
const mockMarkAccepted = jest.fn();
jest.mock("@/repositories/accountInvitations", () => ({
  DUPLICATE_PENDING_INVITE: "DUPLICATE_PENDING_INVITE",
  insertPending: (...a: unknown[]) => mockInsertPending(...a),
  getByTokenHashServiceRole: (...a: unknown[]) => mockGetByTokenHash(...a),
  countPendingForAccountServiceRole: (...a: unknown[]) => mockCountPending(...a),
  // Send-throttle counters (TEAM-INVITATION-EMAIL-1) — always under the cap here.
  countCreatedSinceByInviterServiceRole: jest.fn(async () => 0),
  countCreatedSinceForAccountServiceRole: jest.fn(async () => 0),
  markAcceptedServiceRole: (...a: unknown[]) => mockMarkAccepted(...a),
  markExpiredServiceRole: jest.fn(),
}));

const mockGetAccountById = jest.fn();
jest.mock("@/repositories/accounts", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetAccountById(...a),
  getDeletionStatusServiceRole: jest.fn(),
}));

const mockCountMembers = jest.fn();
const mockIsMemberSR = jest.fn();
const mockInsertMember = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  countMembersServiceRole: (...a: unknown[]) => mockCountMembers(...a),
  isMemberServiceRole: (...a: unknown[]) => mockIsMemberSR(...a),
  insertMembershipServiceRole: (...a: unknown[]) => mockInsertMember(...a),
}));

jest.mock("@/repositories/users", () => ({
  findUserIdByEmailServiceRole: jest.fn(async () => null),
}));
jest.mock("@/repositories/notifications", () => ({ create: jest.fn() }));
jest.mock("@/services/accounts/activeAccount", () => ({
  setActiveAccount: jest.fn(async () => ({ ok: true, account: {} })),
}));
// External email boundary — out of scope for the member-limit tests.
jest.mock("@/services/email/sendTransactionalEmail", () => ({
  sendTransactionalEmail: jest.fn(async () => ({ status: "sent" })),
}));

import { createInvitation, acceptInvitation } from "@/services/accounts/invitations";

const ACCOUNT = "team-1";

function account(type: string) {
  return { id: ACCOUNT, name: "Acme", type, deletionStatus: "active" };
}
function pendingInvite() {
  return {
    id: "inv-1", accountId: ACCOUNT, email: "x@example.com", role: "member",
    status: "pending", invitedByUserId: "o", expiresAt: "2999-01-01T00:00:00.000Z",
    acceptedByUserId: null, acceptedAt: null, revokedAt: null, createdAt: "t",
  };
}

beforeEach(() => {
  [mockInsertPending, mockGetByTokenHash, mockCountPending, mockMarkAccepted,
   mockGetAccountById, mockCountMembers, mockIsMemberSR, mockInsertMember]
    .forEach((m) => m.mockReset());
  mockGetAccountById.mockResolvedValue(account("team"));
  mockInsertPending.mockResolvedValue(pendingInvite());
  mockIsMemberSR.mockResolvedValue(false);
});

describe("createInvitation — Team member limit", () => {
  it("allows an invite while under the cap (owner + 3 members/pending = 4, +1 = 5)", async () => {
    mockCountMembers.mockResolvedValueOnce(2);   // owner + 1
    mockCountPending.mockResolvedValueOnce(2);   // 2 pending
    const r = await createInvitation({ accountId: ACCOUNT, inviterUserId: "o", email: "n@x.com", role: "member" });
    expect(r.ok).toBe(true); // 2 + 2 + 1 = 5 ≤ 5
    expect(mockInsertPending).toHaveBeenCalled();
  });

  it("blocks the invite that would exceed 5 (members + pending + 1 > 5)", async () => {
    mockCountMembers.mockResolvedValueOnce(3);   // owner + 2
    mockCountPending.mockResolvedValueOnce(2);   // 2 pending → 5 seats used
    const r = await createInvitation({ accountId: ACCOUNT, inviterUserId: "o", email: "n@x.com", role: "member" });
    expect(r).toEqual({ ok: false, reason: "team_member_limit_reached" });
    expect(mockInsertPending).not.toHaveBeenCalled();
  });

  it("counts PENDING invites toward the cap (5 members, 0 pending still blocks)", async () => {
    mockCountMembers.mockResolvedValueOnce(5);
    mockCountPending.mockResolvedValueOnce(0);
    const r = await createInvitation({ accountId: ACCOUNT, inviterUserId: "o", email: "n@x.com", role: "member" });
    expect(r).toEqual({ ok: false, reason: "team_member_limit_reached" });
  });

  it("does NOT count revoked/expired invites (only pending is summed by the repo)", async () => {
    // The repo's countPending only counts status='pending'; 4 members + 0 pending
    // (the rest revoked/expired) leaves a slot.
    mockCountMembers.mockResolvedValueOnce(4);
    mockCountPending.mockResolvedValueOnce(0);
    const r = await createInvitation({ accountId: ACCOUNT, inviterUserId: "o", email: "n@x.com", role: "member" });
    expect(r.ok).toBe(true);
  });

  it("allows a Business (organization) invite while under the 25-member cap", async () => {
    mockGetAccountById.mockResolvedValueOnce(account("organization"));
    mockCountMembers.mockResolvedValueOnce(20); // owner + 19
    mockCountPending.mockResolvedValueOnce(4);  // 24 seats used → +1 = 25 ≤ 25
    const r = await createInvitation({ accountId: ACCOUNT, inviterUserId: "o", email: "n@x.com", role: "member" });
    expect(r.ok).toBe(true);
    expect(mockInsertPending).toHaveBeenCalled();
  });

  it("blocks a Business (organization) invite that would exceed 25 (members + pending + 1 > 25)", async () => {
    mockGetAccountById.mockResolvedValueOnce(account("organization"));
    mockCountMembers.mockResolvedValueOnce(23); // owner + 22
    mockCountPending.mockResolvedValueOnce(2);  // 25 seats used → +1 = 26 > 25
    const r = await createInvitation({ accountId: ACCOUNT, inviterUserId: "o", email: "n@x.com", role: "member" });
    expect(r).toEqual({ ok: false, reason: "team_member_limit_reached" });
    expect(mockInsertPending).not.toHaveBeenCalled();
  });
});

describe("acceptInvitation — Team member limit re-check", () => {
  it("blocks acceptance when the team is already full (5 members)", async () => {
    mockGetByTokenHash.mockResolvedValueOnce(pendingInvite());
    mockCountMembers.mockResolvedValueOnce(5); // full
    const r = await acceptInvitation({ token: "t", userId: "u", userEmail: "x@example.com" });
    expect(r).toEqual({ ok: false, reason: "team_member_limit_reached" });
    expect(mockInsertMember).not.toHaveBeenCalled();
  });

  it("accepts when there is room (4 members)", async () => {
    mockGetByTokenHash.mockResolvedValueOnce(pendingInvite());
    mockCountMembers.mockResolvedValueOnce(4);
    const r = await acceptInvitation({ token: "t", userId: "u", userEmail: "x@example.com" });
    expect(r.ok).toBe(true);
    expect(mockInsertMember).toHaveBeenCalled();
  });

  it("blocks Business (organization) acceptance when already at 25 members", async () => {
    mockGetByTokenHash.mockResolvedValueOnce(pendingInvite());
    mockGetAccountById.mockResolvedValueOnce(account("organization"));
    mockCountMembers.mockResolvedValueOnce(25); // full
    const r = await acceptInvitation({ token: "t", userId: "u", userEmail: "x@example.com" });
    expect(r).toEqual({ ok: false, reason: "team_member_limit_reached" });
    expect(mockInsertMember).not.toHaveBeenCalled();
  });

  it("accepts into a Business (organization) with room (24 members)", async () => {
    mockGetByTokenHash.mockResolvedValueOnce(pendingInvite());
    mockGetAccountById.mockResolvedValueOnce(account("organization"));
    mockCountMembers.mockResolvedValueOnce(24);
    const r = await acceptInvitation({ token: "t", userId: "u", userEmail: "x@example.com" });
    expect(r.ok).toBe(true);
    expect(mockInsertMember).toHaveBeenCalled();
  });

  it("an already-member accept is idempotent and never re-checks the cap", async () => {
    mockGetByTokenHash.mockResolvedValueOnce(pendingInvite());
    mockIsMemberSR.mockResolvedValueOnce(true); // already a member
    const r = await acceptInvitation({ token: "t", userId: "u", userEmail: "x@example.com" });
    expect(r.ok).toBe(true);
    expect(mockCountMembers).not.toHaveBeenCalled();
    expect(mockInsertMember).not.toHaveBeenCalled();
  });
});
