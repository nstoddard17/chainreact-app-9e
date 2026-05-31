import { createHash, randomBytes } from "node:crypto";
import type { AccountType } from "@/contracts/accounts";
import * as invitationsRepo from "@/repositories/accountInvitations";
import type {
  AccountInvitationRecord,
  InvitationRole,
} from "@/repositories/accountInvitations";
import * as accountsRepo from "@/repositories/accounts";
import * as membershipsRepo from "@/repositories/accountMemberships";
import * as usersRepo from "@/repositories/users";
import * as notificationsRepo from "@/repositories/notifications";
import { setActiveAccount } from "@/services/accounts/activeAccount";

/**
 * Team invitation service (4.ACCOUNT-MODEL-15, Phase D D2a).
 *
 * Create / list / revoke / accept invites. Backend-only — NO outbound email (the
 * raw token is returned ONCE at creation; only its SHA-256 hash is stored). The
 * route layer owns authorization (`requireAccountRole`); this service owns the
 * invite rules + the membership write on accept.
 *
 * Abuse / rate-limiting (TODO before public UI launch — no rate-limit infra
 * exists yet): the existing protections are (1) email is normalized
 * (trim+lowercase), (2) the DB partial-unique index blocks duplicate PENDING
 * invites per (account,email), (3) the raw token is never stored and is exposed
 * only in the create response. A future slice should add per-account / per-user
 * invite-creation limits (and, with the email-infra slice, send throttling)
 * before the visible invite UI (D3) ships.
 */

export const INVITE_TTL_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function generateRawToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

function acceptPathFor(rawToken: string): string {
  return `/invitations/accept?token=${encodeURIComponent(rawToken)}`;
}

// ── create ───────────────────────────────────────────────────────────────────

export type CreateInvitationReason =
  | "owner_not_invitable"
  | "account_frozen"
  | "already_member"
  | "duplicate_pending";

export type CreateInvitationResult =
  | {
      ok: true;
      invitation: AccountInvitationRecord;
      /** Raw token — available ONLY here, never stored. */
      acceptToken: string;
      /** Internal app path carrying the raw token. */
      acceptPath: string;
    }
  | { ok: false; reason: CreateInvitationReason };

export async function createInvitation(input: {
  accountId: string;
  inviterUserId: string;
  email: string;
  role: InvitationRole;
  now?: Date;
}): Promise<CreateInvitationResult> {
  // owner is never invitable (route validates; this is the service floor).
  if ((input.role as string) === "owner") {
    return { ok: false, reason: "owner_not_invitable" };
  }

  const email = normalizeEmail(input.email);
  const now = input.now ?? new Date();

  // Refuse on a frozen account (non-operational).
  const status = await accountsRepo.getDeletionStatusServiceRole(input.accountId);
  if (status === "pending_deletion") {
    return { ok: false, reason: "account_frozen" };
  }

  // Already a member? (service-role membership check for the prospective invitee)
  const existingUserId = await usersRepo.findUserIdByEmailServiceRole(email);
  if (existingUserId && (await membershipsRepo.isMemberServiceRole(input.accountId, existingUserId))) {
    return { ok: false, reason: "already_member" };
  }

  const rawToken = generateRawToken();
  const tokenHash = hashInviteToken(rawToken);
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * MS_PER_DAY).toISOString();

  let invitation: AccountInvitationRecord;
  try {
    invitation = await invitationsRepo.insertPending({
      accountId: input.accountId,
      email,
      role: input.role,
      tokenHash,
      invitedByUserId: input.inviterUserId,
      expiresAt,
    });
  } catch (err) {
    if ((err as Error).message === invitationsRepo.DUPLICATE_PENDING_INVITE) {
      return { ok: false, reason: "duplicate_pending" };
    }
    throw err;
  }

  const acceptPath = acceptPathFor(rawToken);

  // Best-effort in-app notification for an already-registered invitee. Never
  // blocks invite creation.
  if (existingUserId) {
    try {
      const account = await accountsRepo.getByIdServiceRole(input.accountId);
      await notificationsRepo.create({
        userId: existingUserId,
        type: "account_invitation",
        severity: "warning",
        title: "You've been invited to a team",
        body: `You've been invited to join ${account?.name ?? "a team"} on ChainReact.`,
        actionUrl: acceptPath,
        metadata: { accountId: input.accountId, invitationId: invitation.id },
      });
    } catch (err) {
      console.warn(
        JSON.stringify({
          event: "account.invite.notify_failed",
          message: (err as Error).message,
        }),
      );
    }
  }

  return { ok: true, invitation, acceptToken: rawToken, acceptPath };
}

// ── list / revoke ────────────────────────────────────────────────────────────

export async function listInvitations(
  accountId: string,
): Promise<readonly AccountInvitationRecord[]> {
  return invitationsRepo.listPendingForAccountServiceRole(accountId);
}

export type RevokeInvitationResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "not_pending" };

export async function revokeInvitation(input: {
  accountId: string;
  invitationId: string;
  now?: Date;
}): Promise<RevokeInvitationResult> {
  const invite = await invitationsRepo.getByIdServiceRole(input.invitationId);
  // Scope to the account in the route path — never revoke another account's invite.
  if (!invite || invite.accountId !== input.accountId) {
    return { ok: false, reason: "not_found" };
  }
  if (invite.status !== "pending") {
    return { ok: false, reason: "not_pending" };
  }
  await invitationsRepo.markRevokedServiceRole(
    input.invitationId,
    (input.now ?? new Date()).toISOString(),
  );
  return { ok: true };
}

// ── accept ───────────────────────────────────────────────────────────────────

export type AcceptInvitationReason =
  | "not_found"
  | "expired"
  | "revoked"
  | "already_accepted"
  | "wrong_email"
  | "account_frozen";

export interface AcceptedAccount {
  id: string;
  name: string;
  type: AccountType;
}

export type AcceptInvitationResult =
  | { ok: true; account: AcceptedAccount; alreadyMember: boolean }
  | { ok: false; reason: AcceptInvitationReason };

export async function acceptInvitation(input: {
  token: string;
  userId: string;
  userEmail: string | null;
  now?: Date;
}): Promise<AcceptInvitationResult> {
  const now = input.now ?? new Date();
  const tokenHash = hashInviteToken(input.token);
  const invite = await invitationsRepo.getByTokenHashServiceRole(tokenHash);
  if (!invite) return { ok: false, reason: "not_found" };

  // Lifecycle: only a pending, non-expired invite accepts. An already-accepted
  // invite re-presented by the SAME user is idempotent (handled below after the
  // membership check); any other terminal state is refused.
  if (invite.status === "revoked") return { ok: false, reason: "revoked" };
  if (invite.status === "expired") return { ok: false, reason: "expired" };
  if (invite.status === "accepted" && invite.acceptedByUserId !== input.userId) {
    return { ok: false, reason: "already_accepted" };
  }

  if (invite.status === "pending" && new Date(invite.expiresAt).getTime() < now.getTime()) {
    await invitationsRepo.markExpiredServiceRole(invite.id);
    return { ok: false, reason: "expired" };
  }

  // Email match — the accepting user's session email must equal the invite email.
  if (normalizeEmail(input.userEmail ?? "") !== normalizeEmail(invite.email)) {
    return { ok: false, reason: "wrong_email" };
  }

  // Account must be operational.
  const status = await accountsRepo.getDeletionStatusServiceRole(invite.accountId);
  if (status === "pending_deletion") {
    return { ok: false, reason: "account_frozen" };
  }

  const account = await accountsRepo.getByIdServiceRole(invite.accountId);
  if (!account) return { ok: false, reason: "not_found" };

  const alreadyMember = await membershipsRepo.isMemberServiceRole(
    invite.accountId,
    input.userId,
  );
  if (!alreadyMember) {
    await membershipsRepo.insertMembershipServiceRole(
      invite.accountId,
      input.userId,
      invite.role,
    );
  }

  // Settle the invite (idempotent — filtered to status='pending' in the repo).
  await invitationsRepo.markAcceptedServiceRole(invite.id, input.userId, now.toISOString());

  // Auto-activate the joined account (best-effort; membership just committed).
  const activated = await setActiveAccount(input.userId, invite.accountId);
  if (!activated.ok) {
    console.warn(
      JSON.stringify({
        event: "account.invite.accept.activate_failed",
        reason: activated.reason,
      }),
    );
  }

  return {
    ok: true,
    account: { id: account.id, name: account.name, type: account.type },
    alreadyMember,
  };
}
