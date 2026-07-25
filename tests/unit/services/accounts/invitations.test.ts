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
const mockUpdatePendingRole = jest.fn();
const mockCountPending = jest.fn();
const mockCountRecentByInviter = jest.fn();
const mockCountRecentForAccount = jest.fn();

jest.mock("@/repositories/accountInvitations", () => ({
  DUPLICATE_PENDING_INVITE: "DUPLICATE_PENDING_INVITE",
  insertPending: (...a: unknown[]) => mockInsertPending(...a),
  getByTokenHashServiceRole: (...a: unknown[]) => mockGetByTokenHash(...a),
  getByIdServiceRole: (...a: unknown[]) => mockGetById(...a),
  listPendingForAccountServiceRole: (...a: unknown[]) => mockListPending(...a),
  countPendingForAccountServiceRole: (...a: unknown[]) => mockCountPending(...a),
  countCreatedSinceByInviterServiceRole: (...a: unknown[]) => mockCountRecentByInviter(...a),
  countCreatedSinceForAccountServiceRole: (...a: unknown[]) => mockCountRecentForAccount(...a),
  markAcceptedServiceRole: (...a: unknown[]) => mockMarkAccepted(...a),
  markRevokedServiceRole: (...a: unknown[]) => mockMarkRevoked(...a),
  updatePendingRoleServiceRole: (...a: unknown[]) => mockUpdatePendingRole(...a),
}));

// External email boundary — the ONLY email mock (template + origin run real).
const mockSendEmail = jest.fn();
jest.mock("@/services/email/sendTransactionalEmail", () => ({
  sendTransactionalEmail: (...a: unknown[]) => mockSendEmail(...a),
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
  changeInvitationRole,
  replaceInvitationEmail,
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
    // Non-expiring (TEAM-INVITATION-LIFECYCLE-2).
    expiresAt: null,
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
    mockMarkAccepted, mockMarkRevoked, mockUpdatePendingRole, mockGetDeletionStatus,
    mockGetAccountById, mockIsMemberSR, mockInsertMember, mockFindUserByEmail,
    mockNotify, mockSetActiveAccount, mockCountMembers, mockCountPending,
    mockCountRecentByInviter, mockCountRecentForAccount, mockSendEmail,
  ].forEach((m) => m.mockReset());

  mockGetDeletionStatus.mockResolvedValue("active");
  mockGetAccountById.mockResolvedValue({ id: ACCOUNT, name: "Acme", type: "team", deletionStatus: "active" });
  // Default well under the 5-member team cap so unrelated tests don't trip it.
  mockCountMembers.mockResolvedValue(1);
  mockCountPending.mockResolvedValue(0);
  // Default well under the send throttle so unrelated tests don't trip it.
  mockCountRecentByInviter.mockResolvedValue(0);
  mockCountRecentForAccount.mockResolvedValue(0);
  mockSendEmail.mockResolvedValue({ status: "sent" });
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

describe("createInvitation — email delivery (TEAM-INVITATION-EMAIL-1)", () => {
  const PREV_APP_URL = process.env.NEXT_PUBLIC_APP_URL;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  });
  afterAll(() => {
    if (PREV_APP_URL === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = PREV_APP_URL;
  });

  it("emails a brand-new address (no user row): full canonical URL, team name, safe metadata", async () => {
    mockFindUserByEmail.mockResolvedValue(null);
    const res = await createInvitation({
      accountId: ACCOUNT, inviterUserId: INVITER, email: "Ghost@Example.com", role: "admin",
      inviter: { email: "owner@acme.com", displayName: "Pat Owner" },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.emailDelivery).toEqual({ status: "sent" });
    expect(mockNotify).not.toHaveBeenCalled(); // no account → no in-app notification
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const [message, meta] = mockSendEmail.mock.calls[0] as [
      { to: string; subject: string; html: string; text: string },
      Record<string, string>,
    ];
    expect(message.to).toBe("ghost@example.com"); // normalized
    expect(message.subject).toContain("Acme");
    // The emailed link is the CANONICAL configured origin + acceptPath — never request-derived.
    expect(message.text).toContain(`http://localhost:3000${res.acceptPath}`);
    expect(message.html).toContain("Acme");
    expect(message.html).toContain("Pat Owner");
    // Observability metadata is opaque ids only — no address, token, or URL.
    expect(JSON.stringify(meta)).not.toContain("ghost@example.com");
    expect(JSON.stringify(meta)).not.toContain(res.acceptToken);
    expect(meta.template).toBe("team_invitation");
  });

  it("emails an EXISTING user too — alongside the in-app notification", async () => {
    mockFindUserByEmail.mockResolvedValueOnce(INVITEE);
    const res = await createInvitation({
      accountId: ACCOUNT, inviterUserId: INVITER, email: "invitee@example.com", role: "member",
    });
    expect(res.ok).toBe(true);
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it("email failure leaves the invitation intact and returns the link with status 'failed'", async () => {
    mockSendEmail.mockResolvedValueOnce({ status: "failed", reason: "provider_500" });
    const res = await createInvitation({
      accountId: ACCOUNT, inviterUserId: INVITER, email: "x@example.com", role: "member",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.emailDelivery).toEqual({ status: "failed" });
    expect(res.acceptPath).toContain("token=");
    // Exactly ONE invitation was persisted — delivery failure never re-inserts or revokes.
    expect(mockInsertPending).toHaveBeenCalledTimes(1);
    expect(mockMarkRevoked).not.toHaveBeenCalled();
  });

  it("surfaces 'not_configured' for an environment without email credentials", async () => {
    mockSendEmail.mockResolvedValueOnce({ status: "not_configured" });
    const res = await createInvitation({
      accountId: ACCOUNT, inviterUserId: INVITER, email: "x@example.com", role: "member",
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.emailDelivery).toEqual({ status: "not_configured" });
  });

  it("sends NO email when the invite is refused (duplicate / already-member / team-full)", async () => {
    mockInsertPending.mockRejectedValueOnce(new Error("DUPLICATE_PENDING_INVITE"));
    await createInvitation({ accountId: ACCOUNT, inviterUserId: INVITER, email: "x@example.com", role: "member" });

    mockFindUserByEmail.mockResolvedValueOnce(INVITEE);
    mockIsMemberSR.mockResolvedValueOnce(true);
    await createInvitation({ accountId: ACCOUNT, inviterUserId: INVITER, email: "invitee@example.com", role: "member" });

    mockCountMembers.mockResolvedValueOnce(5);
    await createInvitation({ accountId: ACCOUNT, inviterUserId: INVITER, email: "y@example.com", role: "member" });

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("never logs the raw token or the full accept URL on delivery failure", async () => {
    mockSendEmail.mockResolvedValueOnce({ status: "failed", reason: "provider_500" });
    const res = await createInvitation({
      accountId: ACCOUNT, inviterUserId: INVITER, email: "x@example.com", role: "member",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const logged = [
      ...(console.warn as jest.Mock).mock.calls,
      ...(console.info as jest.Mock).mock.calls,
    ]
      .flat()
      .map(String)
      .join("\n");
    expect(logged).not.toContain(res.acceptToken);
    expect(logged).not.toContain("/invitations/accept?token=");
  });
});

describe("createInvitation — durable send throttle", () => {
  it("refuses when the inviter is over the rolling per-inviter cap (no row, no email)", async () => {
    mockCountRecentByInviter.mockResolvedValueOnce(10);
    const res = await createInvitation({
      accountId: ACCOUNT, inviterUserId: INVITER, email: "x@example.com", role: "member",
    });
    expect(res).toEqual({ ok: false, reason: "rate_limited" });
    expect(mockInsertPending).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("refuses when the account is over the rolling per-account cap", async () => {
    mockCountRecentForAccount.mockResolvedValueOnce(20);
    const res = await createInvitation({
      accountId: ACCOUNT, inviterUserId: INVITER, email: "x@example.com", role: "member",
    });
    expect(res).toEqual({ ok: false, reason: "rate_limited" });
    expect(mockInsertPending).not.toHaveBeenCalled();
  });

  it("counts against a rolling window derived from now", async () => {
    const now = new Date("2026-07-24T12:00:00.000Z");
    await createInvitation({
      accountId: ACCOUNT, inviterUserId: INVITER, email: "x@example.com", role: "member", now,
    });
    expect(mockCountRecentByInviter).toHaveBeenCalledWith(
      INVITER,
      "2026-07-24T11:00:00.000Z", // 60-minute window
    );
    expect(mockCountRecentForAccount).toHaveBeenCalledWith(
      ACCOUNT,
      "2026-07-24T11:00:00.000Z",
    );
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

  it("accepts a pending invite regardless of age — even a legacy past expires_at (non-expiring)", async () => {
    // TEAM-INVITATION-LIFECYCLE-2: pending invites never lapse. A legacy row
    // whose stored expires_at is decades past must still accept.
    signedInvite({ expiresAt: "2000-01-01T00:00:00.000Z", createdAt: "1999-01-01T00:00:00.000Z" });
    const res = await acceptInvitation({ token: TOKEN, userId: INVITEE, userEmail: "invitee@example.com" });
    expect(res.ok).toBe(true);
    expect(mockInsertMember).toHaveBeenCalledWith(ACCOUNT, INVITEE, "member");
  });

  it("still refuses a HISTORICAL 'expired' row (never reactivated)", async () => {
    signedInvite({ status: "expired" });
    const res = await acceptInvitation({ token: TOKEN, userId: INVITEE, userEmail: "invitee@example.com" });
    expect(res).toEqual({ ok: false, reason: "expired" });
    expect(mockInsertMember).not.toHaveBeenCalled();
  });

  it("acceptance applies the role CURRENTLY stored on the invitation", async () => {
    // e.g. invited as member, role changed to admin before acceptance.
    signedInvite({ role: "admin" });
    const res = await acceptInvitation({ token: TOKEN, userId: INVITEE, userEmail: "invitee@example.com" });
    expect(res.ok).toBe(true);
    expect(mockInsertMember).toHaveBeenCalledWith(ACCOUNT, INVITEE, "admin");
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

describe("changeInvitationRole (TEAM-INVITATION-LIFECYCLE-2)", () => {
  it("updates the pending invite IN PLACE — same id, no token touched, NO email sent", async () => {
    mockGetById.mockResolvedValueOnce(pendingInvite());
    mockUpdatePendingRole.mockResolvedValueOnce(pendingInvite({ role: "admin" }));
    const res = await changeInvitationRole({ accountId: ACCOUNT, invitationId: "inv-1", role: "admin" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.invitation.role).toBe("admin");
    expect(mockUpdatePendingRole).toHaveBeenCalledWith("inv-1", "admin");
    // In place: nothing revoked, nothing inserted, no new token, no email.
    expect(mockMarkRevoked).not.toHaveBeenCalled();
    expect(mockInsertPending).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("refuses another account's invite (not_found) and settled invites (not_pending)", async () => {
    mockGetById.mockResolvedValueOnce(pendingInvite({ accountId: "other" }));
    expect(await changeInvitationRole({ accountId: ACCOUNT, invitationId: "inv-1", role: "admin" }))
      .toEqual({ ok: false, reason: "not_found" });

    mockGetById.mockResolvedValueOnce(pendingInvite({ status: "accepted" }));
    expect(await changeInvitationRole({ accountId: ACCOUNT, invitationId: "inv-1", role: "admin" }))
      .toEqual({ ok: false, reason: "not_pending" });
    expect(mockUpdatePendingRole).not.toHaveBeenCalled();
  });

  it("maps a lost update race (row settled between read and update) to not_pending", async () => {
    mockGetById.mockResolvedValueOnce(pendingInvite());
    mockUpdatePendingRole.mockResolvedValueOnce(null);
    expect(await changeInvitationRole({ accountId: ACCOUNT, invitationId: "inv-1", role: "member" }))
      .toEqual({ ok: false, reason: "not_pending" });
  });
});

describe("replaceInvitationEmail (TEAM-INVITATION-LIFECYCLE-2)", () => {
  it("revokes the old invite, issues a NEW token for the new email with the SAME role, and emails it", async () => {
    mockGetById.mockResolvedValueOnce(pendingInvite({ role: "admin", email: "old@example.com" }));
    const res = await replaceInvitationEmail({
      accountId: ACCOUNT, invitationId: "inv-1", newEmail: "New@Example.com", inviterUserId: INVITER,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Old link dies…
    expect(mockMarkRevoked).toHaveBeenCalledWith("inv-1", expect.any(String));
    // …new invitation for the normalized new address, role preserved…
    const insertArg = mockInsertPending.mock.calls[0][0];
    expect(insertArg.email).toBe("new@example.com");
    expect(insertArg.role).toBe("admin");
    // …with a fresh token (hash of the returned raw token), emailed to the new address.
    expect(insertArg.tokenHash).toBe(hashInviteToken(res.acceptToken));
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect((mockSendEmail.mock.calls[0][0] as { to: string }).to).toBe("new@example.com");
    expect(res.acceptPath).toContain(encodeURIComponent(res.acceptToken));
  });

  it("email delivery failure leaves the NEW invitation valid (ok with status 'failed')", async () => {
    mockGetById.mockResolvedValueOnce(pendingInvite());
    mockSendEmail.mockResolvedValueOnce({ status: "failed", reason: "provider_500" });
    const res = await replaceInvitationEmail({
      accountId: ACCOUNT, invitationId: "inv-1", newEmail: "new@example.com", inviterUserId: INVITER,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.emailDelivery).toEqual({ status: "failed" });
    expect(mockInsertPending).toHaveBeenCalledTimes(1);
  });

  it("refuses a no-op change to the SAME email without killing the working link", async () => {
    mockGetById.mockResolvedValueOnce(pendingInvite({ email: "invitee@example.com" }));
    const res = await replaceInvitationEmail({
      accountId: ACCOUNT, invitationId: "inv-1", newEmail: "  Invitee@Example.COM ", inviterUserId: INVITER,
    });
    expect(res).toEqual({ ok: false, reason: "same_email" });
    expect(mockMarkRevoked).not.toHaveBeenCalled();
    expect(mockInsertPending).not.toHaveBeenCalled();
  });

  it("refuses another account's invite (not_found) and settled invites (not_pending)", async () => {
    mockGetById.mockResolvedValueOnce(pendingInvite({ accountId: "other" }));
    expect(await replaceInvitationEmail({
      accountId: ACCOUNT, invitationId: "inv-1", newEmail: "n@example.com", inviterUserId: INVITER,
    })).toEqual({ ok: false, reason: "not_found" });

    mockGetById.mockResolvedValueOnce(pendingInvite({ status: "revoked" }));
    expect(await replaceInvitationEmail({
      accountId: ACCOUNT, invitationId: "inv-1", newEmail: "n@example.com", inviterUserId: INVITER,
    })).toEqual({ ok: false, reason: "not_pending" });
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Foo@Bar.COM ")).toBe("foo@bar.com");
  });
});
