/**
 * @jest-environment node
 *
 * Unit tests for the team invitation service (4.ACCOUNT-MODEL-15). Mocks repos +
 * setActiveAccount so no DB is touched. Proves token HASHING (raw never stored),
 * the create/accept/revoke rules, email match, lifecycle refusals, frozen-account
 * refusals, and best-effort notification.
 */

const mockInsertPending = jest.fn();
const mockGetByTokenHash = jest.fn();
const mockGetById = jest.fn();
const mockListPending = jest.fn();
const mockMarkAccepted = jest.fn();
const mockMarkRevoked = jest.fn();
const mockMarkExpired = jest.fn();
const mockCountPending = jest.fn();

jest.mock("@/repositories/accountInvitations", () => ({
  DUPLICATE_PENDING_INVITE: "DUPLICATE_PENDING_INVITE",
  insertPending: (...a: unknown[]) => mockInsertPending(...a),
  getByTokenHashServiceRole: (...a: unknown[]) => mockGetByTokenHash(...a),
  getByIdServiceRole: (...a: unknown[]) => mockGetById(...a),
  listPendingForAccountServiceRole: (...a: unknown[]) => mockListPending(...a),
  countPendingForAccountServiceRole: (...a: unknown[]) => mockCountPending(...a),
  markAcceptedServiceRole: (...a: unknown[]) => mockMarkAccepted(...a),
  markRevokedServiceRole: (...a: unknown[]) => mockMarkRevoked(...a),
  markExpiredServiceRole: (...a: unknown[]) => mockMarkExpired(...a),
}));

const mockGetDeletionStatus = jest.fn();
const mockGetAccountById = jest.fn();
jest.mock("@/repositories/accounts", () => ({
  getDeletionStatusServiceRole: (...a: unknown[]) => mockGetDeletionStatus(...a),
  getByIdServiceRole: (...a: unknown[]) => mockGetAccountById(...a),
}));

const mockIsMemberSR = jest.fn();
const mockInsertMember = jest.fn();
const mockCountMembers = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  isMemberServiceRole: (...a: unknown[]) => mockIsMemberSR(...a),
  insertMembershipServiceRole: (...a: unknown[]) => mockInsertMember(...a),
  countMembersServiceRole: (...a: unknown[]) => mockCountMembers(...a),
}));

const mockFindUserByEmail = jest.fn();
jest.mock("@/repositories/users", () => ({
  findUserIdByEmailServiceRole: (...a: unknown[]) => mockFindUserByEmail(...a),
}));

const mockNotify = jest.fn();
jest.mock("@/repositories/notifications", () => ({
  create: (...a: unknown[]) => mockNotify(...a),
}));

const mockSetActiveAccount = jest.fn();
jest.mock("@/services/accounts/activeAccount", () => ({
  setActiveAccount: (...a: unknown[]) => mockSetActiveAccount(...a),
}));

import {
  createInvitation,
  acceptInvitation,
  revokeInvitation,
  hashInviteToken,
  normalizeEmail,
} from "@/services/accounts/invitations";

const ACCOUNT = "team-1";
const INVITER = "owner-1";
const INVITEE = "user-2";

function pendingInvite(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv-1",
    accountId: ACCOUNT,
    email: "invitee@example.com",
    role: "member",
    status: "pending",
    invitedByUserId: INVITER,
    expiresAt: "2999-01-01T00:00:00.000Z",
    acceptedByUserId: null,
    acceptedAt: null,
    revokedAt: null,
    createdAt: "2026-05-31T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  [
    mockInsertPending, mockGetByTokenHash, mockGetById, mockListPending,
    mockMarkAccepted, mockMarkRevoked, mockMarkExpired, mockGetDeletionStatus,
    mockGetAccountById, mockIsMemberSR, mockInsertMember, mockFindUserByEmail,
    mockNotify, mockSetActiveAccount, mockCountMembers, mockCountPending,
  ].forEach((m) => m.mockReset());

  mockGetDeletionStatus.mockResolvedValue("active");
  mockGetAccountById.mockResolvedValue({ id: ACCOUNT, name: "Acme", type: "team", deletionStatus: "active" });
  // Default well under the 5-member team cap so unrelated tests don't trip it.
  mockCountMembers.mockResolvedValue(1);
  mockCountPending.mockResolvedValue(0);
  mockFindUserByEmail.mockResolvedValue(null);
  mockIsMemberSR.mockResolvedValue(false);
  mockSetActiveAccount.mockResolvedValue({ ok: true, account: {} });
  mockInsertPending.mockImplementation(async (i: { role: string }) => pendingInvite({ role: i.role }));
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  (console.info as jest.Mock).mockRestore?.();
  (console.warn as jest.Mock).mockRestore?.();
});

describe("createInvitation", () => {
  it("stores only the HASH of the token; the raw token is returned, never stored", async () => {
    const res = await createInvitation({
      accountId: ACCOUNT, inviterUserId: INVITER, email: "Invitee@Example.com", role: "member",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const insertArg = mockInsertPending.mock.calls[0][0];
    // The stored token_hash equals sha256(raw); the raw token is NOT in the stored args.
    expect(insertArg.tokenHash).toBe(hashInviteToken(res.acceptToken));
    expect(insertArg.tokenHash).not.toBe(res.acceptToken);
    expect(JSON.stringify(insertArg)).not.toContain(res.acceptToken);
    // email normalized; accept link carries the raw token.
    expect(insertArg.email).toBe("invitee@example.com");
    expect(res.acceptPath).toContain(encodeURIComponent(res.acceptToken));
  });

  it("refuses an 'owner' role", async () => {
    const res = await createInvitation({
      accountId: ACCOUNT, inviterUserId: INVITER, email: "x@example.com", role: "owner" as never,
    });
    expect(res).toEqual({ ok: false, reason: "owner_not_invitable" });
    expect(mockInsertPending).not.toHaveBeenCalled();
  });

  it("refuses a frozen (pending_deletion) account", async () => {
    mockGetAccountById.mockResolvedValueOnce({ id: ACCOUNT, name: "Acme", type: "team", deletionStatus: "pending_deletion" });
    const res = await createInvitation({
      accountId: ACCOUNT, inviterUserId: INVITER, email: "x@example.com", role: "member",
    });
    expect(res).toEqual({ ok: false, reason: "account_frozen" });
    expect(mockInsertPending).not.toHaveBeenCalled();
  });

  it("refuses inviting an email that is already a member", async () => {
    mockFindUserByEmail.mockResolvedValueOnce(INVITEE);
    mockIsMemberSR.mockResolvedValueOnce(true);
    const res = await createInvitation({
      accountId: ACCOUNT, inviterUserId: INVITER, email: "invitee@example.com", role: "member",
    });
    expect(res).toEqual({ ok: false, reason: "already_member" });
    expect(mockInsertPending).not.toHaveBeenCalled();
  });

  it("maps a duplicate pending invite to duplicate_pending", async () => {
    mockInsertPending.mockRejectedValueOnce(new Error("DUPLICATE_PENDING_INVITE"));
    const res = await createInvitation({
      accountId: ACCOUNT, inviterUserId: INVITER, email: "x@example.com", role: "member",
    });
    expect(res).toEqual({ ok: false, reason: "duplicate_pending" });
  });

  it("notifies an already-registered invitee (best-effort); never for an unknown email", async () => {
    mockFindUserByEmail.mockResolvedValueOnce(INVITEE); // exists, not a member
    const res = await createInvitation({
      accountId: ACCOUNT, inviterUserId: INVITER, email: "invitee@example.com", role: "member",
    });
    expect(res.ok).toBe(true);
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: INVITEE, type: "account_invitation" }),
    );
  });

  it("does NOT notify when the invitee has no account", async () => {
    mockFindUserByEmail.mockResolvedValue(null);
    await createInvitation({
      accountId: ACCOUNT, inviterUserId: INVITER, email: "ghost@example.com", role: "member",
    });
    expect(mockNotify).not.toHaveBeenCalled();
  });
});

describe("acceptInvitation", () => {
  const TOKEN = "raw-token-abc";
  function signedInvite(overrides: Record<string, unknown> = {}) {
    mockGetByTokenHash.mockResolvedValueOnce(pendingInvite(overrides));
  }

  it("accepts a valid invite: inserts membership, marks accepted, auto-activates", async () => {
    signedInvite();
    const res = await acceptInvitation({ token: TOKEN, userId: INVITEE, userEmail: "invitee@example.com" });
    expect(res).toEqual({
      ok: true,
      account: { id: ACCOUNT, name: "Acme", type: "team" },
      alreadyMember: false,
    });
    expect(mockGetByTokenHash).toHaveBeenCalledWith(hashInviteToken(TOKEN));
    expect(mockInsertMember).toHaveBeenCalledWith(ACCOUNT, INVITEE, "member");
    expect(mockMarkAccepted).toHaveBeenCalledWith("inv-1", INVITEE, expect.any(String));
    expect(mockSetActiveAccount).toHaveBeenCalledWith(INVITEE, ACCOUNT);
  });

  it("rejects a wrong-email acceptance and writes nothing", async () => {
    signedInvite();
    const res = await acceptInvitation({ token: TOKEN, userId: INVITEE, userEmail: "someone-else@example.com" });
    expect(res).toEqual({ ok: false, reason: "wrong_email" });
    expect(mockInsertMember).not.toHaveBeenCalled();
    expect(mockMarkAccepted).not.toHaveBeenCalled();
  });

  it("rejects + marks expired when past expiry", async () => {
    signedInvite({ expiresAt: "2000-01-01T00:00:00.000Z" });
    const res = await acceptInvitation({ token: TOKEN, userId: INVITEE, userEmail: "invitee@example.com" });
    expect(res).toEqual({ ok: false, reason: "expired" });
    expect(mockMarkExpired).toHaveBeenCalledWith("inv-1");
    expect(mockInsertMember).not.toHaveBeenCalled();
  });

  it("rejects a revoked invite", async () => {
    signedInvite({ status: "revoked" });
    const res = await acceptInvitation({ token: TOKEN, userId: INVITEE, userEmail: "invitee@example.com" });
    expect(res).toEqual({ ok: false, reason: "revoked" });
  });

  it("rejects an already-accepted invite presented by a different user", async () => {
    signedInvite({ status: "accepted", acceptedByUserId: "other-user" });
    const res = await acceptInvitation({ token: TOKEN, userId: INVITEE, userEmail: "invitee@example.com" });
    expect(res).toEqual({ ok: false, reason: "already_accepted" });
  });

  it("is idempotent when the user is already a member (no duplicate insert)", async () => {
    signedInvite();
    mockIsMemberSR.mockResolvedValueOnce(true);
    const res = await acceptInvitation({ token: TOKEN, userId: INVITEE, userEmail: "invitee@example.com" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.alreadyMember).toBe(true);
    expect(mockInsertMember).not.toHaveBeenCalled();
  });

  it("refuses to accept into a frozen account", async () => {
    signedInvite();
    mockGetAccountById.mockResolvedValueOnce({ id: ACCOUNT, name: "Acme", type: "team", deletionStatus: "pending_deletion" });
    const res = await acceptInvitation({ token: TOKEN, userId: INVITEE, userEmail: "invitee@example.com" });
    expect(res).toEqual({ ok: false, reason: "account_frozen" });
    expect(mockInsertMember).not.toHaveBeenCalled();
  });

  it("404s an unknown token", async () => {
    mockGetByTokenHash.mockResolvedValueOnce(null);
    const res = await acceptInvitation({ token: "nope", userId: INVITEE, userEmail: "invitee@example.com" });
    expect(res).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("revokeInvitation", () => {
  it("revokes a pending invite for the account", async () => {
    mockGetById.mockResolvedValueOnce(pendingInvite());
    const res = await revokeInvitation({ accountId: ACCOUNT, invitationId: "inv-1" });
    expect(res).toEqual({ ok: true });
    expect(mockMarkRevoked).toHaveBeenCalledWith("inv-1", expect.any(String));
  });

  it("refuses to revoke another account's invite (not_found)", async () => {
    mockGetById.mockResolvedValueOnce(pendingInvite({ accountId: "other-account" }));
    const res = await revokeInvitation({ accountId: ACCOUNT, invitationId: "inv-1" });
    expect(res).toEqual({ ok: false, reason: "not_found" });
    expect(mockMarkRevoked).not.toHaveBeenCalled();
  });

  it("refuses to revoke a non-pending invite", async () => {
    mockGetById.mockResolvedValueOnce(pendingInvite({ status: "accepted" }));
    const res = await revokeInvitation({ accountId: ACCOUNT, invitationId: "inv-1" });
    expect(res).toEqual({ ok: false, reason: "not_pending" });
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Foo@Bar.COM ")).toBe("foo@bar.com");
  });
});
