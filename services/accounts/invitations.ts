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
import { memberLimitFor } from "@/services/accounts/memberLimits";
import { publicAppOrigin } from "@/services/email/appOrigin";
import { sendTransactionalEmail } from "@/services/email/sendTransactionalEmail";
import { renderTeamInvitationEmail } from "@/services/email/templates/teamInvitation";
import type { EmailDeliveryStatus } from "@/services/email/transport";

/**
 * Team invitation service (4.ACCOUNT-MODEL-15, Phase D D2a; email delivery
 * TEAM-INVITATION-EMAIL-1; lifecycle rules TEAM-INVITATION-LIFECYCLE-2).
 *
 * Create / list / revoke / accept / change-role / replace-email. The raw token
 * is returned ONCE at creation; only its SHA-256 hash is stored. The route
 * layer owns authorization (`requireAccountRole`); this service owns the
 * invite rules + the membership write on accept.
 *
 * Lifecycle (TEAM-INVITATION-LIFECYCLE-2 — locked product rules):
 *   - Pending invitations NEVER expire automatically. They stay active until
 *     accepted, canceled (revoked), or replaced by an email change. Historical
 *     'expired' rows remain refusable history and are never reactivated.
 *   - A ROLE change updates the pending invitation in place — same id, email,
 *     token hash, and link; NO new email is sent. Acceptance always applies
 *     the role stored on the invitation at accept time.
 *   - An EMAIL change REPLACES the invitation: the old one is revoked (its
 *     link dies), a brand-new token/invitation is issued for the new address
 *     with the same role, and a new invitation email is sent.
 *
 * Delivery semantics (TEAM-INVITATION-EMAIL-1): the DB invitation is the
 * durable source of truth; email is external delivery, attempted AFTER the
 * invitation persists. A provider failure never deletes/revokes the invitation
 * and never fails the create — the caller receives the created invitation plus
 * a typed `emailDelivery.status` so the UI can fall back to the one-time
 * copyable link.
 *
 * Abuse controls: (1) email is normalized (trim+lowercase), (2) the DB
 * partial-unique index blocks duplicate PENDING invites per (account,email),
 * (3) the raw token is never stored and is exposed only in the create
 * response, (4) a DURABLE send throttle counts invitation rows created inside
 * the rolling window — per inviter and per account — so rapid repeated sends
 * are refused (`rate_limited`) before a row or email exists. The rows
 * themselves are the counter (cross-instance safe; no in-memory state).
 */

/** Rolling send-throttle window + caps (modest; team cap is 5, business 25). */
export const INVITE_SEND_WINDOW_MINUTES = 60;
export const INVITE_SEND_LIMIT_PER_INVITER = 10;
export const INVITE_SEND_LIMIT_PER_ACCOUNT = 20;

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
  | "duplicate_pending"
  | "team_member_limit_reached"
  | "rate_limited";

export type CreateInvitationResult =
  | {
      ok: true;
      invitation: AccountInvitationRecord;
      /** Raw token — available ONLY here, never stored. */
      acceptToken: string;
      /** Internal app path carrying the raw token. */
      acceptPath: string;
      /**
       * Outcome of the transactional email attempt. "sent" only when the
       * provider accepted the message; "not_configured" in environments with
       * no email transport. Never affects whether the invitation persisted.
       */
      emailDelivery: { status: EmailDeliveryStatus };
    }
  | { ok: false; reason: CreateInvitationReason };

export async function createInvitation(input: {
  accountId: string;
  inviterUserId: string;
  email: string;
  role: InvitationRole;
  /**
   * Safe display identity of the inviter for the email body (session email +
   * their own profile display name — both resolved by the route from the
   * verified session, never from request input). Optional: absent → generic
   * "You've been invited" copy.
   */
  inviter?: { email: string | null; displayName: string | null };
  now?: Date;
}): Promise<CreateInvitationResult> {
  // owner is never invitable (route validates; this is the service floor).
  if ((input.role as string) === "owner") {
    return { ok: false, reason: "owner_not_invitable" };
  }

  const email = normalizeEmail(input.email);
  const now = input.now ?? new Date();

  // Resolve the account once — type (for the member-limit policy) + deletion
  // status (freeze) + name (notification).
  const account = await accountsRepo.getByIdServiceRole(input.accountId);
  if (!account) {
    // Caller passed requireAccountRole (is a member) so this is unreachable;
    // treat a vanished account as frozen rather than proceeding.
    return { ok: false, reason: "account_frozen" };
  }
  if (account.deletionStatus === "pending_deletion") {
    return { ok: false, reason: "account_frozen" };
  }

  // Already a member? (service-role membership check for the prospective invitee)
  const existingUserId = await usersRepo.findUserIdByEmailServiceRole(email);
  if (existingUserId && (await membershipsRepo.isMemberServiceRole(input.accountId, existingUserId))) {
    return { ok: false, reason: "already_member" };
  }

  // Member limit (4.ACCOUNT-MODEL-20; Business cap 4.ACCOUNT-MODEL-BUSINESS-LIMIT-1):
  // seats used = accepted members + pending invites; one more (this invite) must
  // not exceed the cap. Applies to Team (5) and Business/organization (25);
  // `memberLimitFor` returns null only for a future uncapped tier (none today).
  // Expired/revoked invites don't count (only `pending` is summed), so they free
  // slots naturally.
  const limit = memberLimitFor(account.type);
  if (limit !== null) {
    const [memberCount, pendingCount] = await Promise.all([
      membershipsRepo.countMembersServiceRole(input.accountId),
      invitationsRepo.countPendingForAccountServiceRole(input.accountId),
    ]);
    if (memberCount + pendingCount + 1 > limit) {
      return { ok: false, reason: "team_member_limit_reached" };
    }
  }

  // Durable send throttle (TEAM-INVITATION-EMAIL-1): every create attempts an
  // outbound email, so rapid repeated creates are refused before a row or email
  // exists. Counts invitation rows created inside the rolling window (any
  // status — a revoked invite still consumed a send), per inviter and per
  // account. DB-backed, so it holds across serverless instances.
  const sinceIso = new Date(
    now.getTime() - INVITE_SEND_WINDOW_MINUTES * 60 * 1000,
  ).toISOString();
  const [inviterRecent, accountRecent] = await Promise.all([
    invitationsRepo.countCreatedSinceByInviterServiceRole(input.inviterUserId, sinceIso),
    invitationsRepo.countCreatedSinceForAccountServiceRole(input.accountId, sinceIso),
  ]);
  if (
    inviterRecent >= INVITE_SEND_LIMIT_PER_INVITER ||
    accountRecent >= INVITE_SEND_LIMIT_PER_ACCOUNT
  ) {
    console.warn(
      JSON.stringify({
        event: "account.invite.rate_limited",
        accountId: input.accountId,
        inviterRecent,
        accountRecent,
      }),
    );
    return { ok: false, reason: "rate_limited" };
  }

  const rawToken = generateRawToken();
  const tokenHash = hashInviteToken(rawToken);

  let invitation: AccountInvitationRecord;
  try {
    invitation = await invitationsRepo.insertPending({
      accountId: input.accountId,
      email,
      role: input.role,
      tokenHash,
      invitedByUserId: input.inviterUserId,
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
      await notificationsRepo.create({
        userId: existingUserId,
        type: "account_invitation",
        severity: "warning",
        title: "You've been invited to a team",
        body: `You've been invited to join ${account.name} on ChainReact.`,
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

  // Transactional email (TEAM-INVITATION-EMAIL-1) — attempted only after the
  // invitation persisted. Works whether or not the address has a ChainReact
  // account. The full accept URL is built from the canonical configured origin
  // (publicAppOrigin — never request-derived). sendTransactionalEmail never
  // throws and logs its own SAFE structured warning on failure (opaque ids
  // only — never the address, token, URL, or body).
  const inviterName =
    input.inviter?.displayName?.trim() || input.inviter?.email || null;
  const rendered = renderTeamInvitationEmail({
    teamName: account.name,
    inviterName,
    role: input.role,
    acceptUrl: `${publicAppOrigin()}${acceptPath}`,
  });
  const delivery = await sendTransactionalEmail(
    { to: email, subject: rendered.subject, html: rendered.html, text: rendered.text },
    {
      template: "team_invitation",
      invitationId: invitation.id,
      accountId: input.accountId,
    },
  );

  return {
    ok: true,
    invitation,
    acceptToken: rawToken,
    acceptPath,
    emailDelivery: { status: delivery.status },
  };
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

// ── change role / replace email (TEAM-INVITATION-LIFECYCLE-2) ────────────────

export type ChangeInvitationRoleResult =
  | { ok: true; invitation: AccountInvitationRecord }
  | { ok: false; reason: "not_found" | "not_pending" };

/**
 * Change a PENDING invitation's role in place: same id, same email, same token
 * hash, same link. NO email is sent — the existing invitation link remains
 * active, and acceptance applies whatever role is stored at accept time.
 */
export async function changeInvitationRole(input: {
  accountId: string;
  invitationId: string;
  role: InvitationRole;
}): Promise<ChangeInvitationRoleResult> {
  const invite = await invitationsRepo.getByIdServiceRole(input.invitationId);
  // Account-scoped like revoke — never touch another account's invite.
  if (!invite || invite.accountId !== input.accountId) {
    return { ok: false, reason: "not_found" };
  }
  if (invite.status !== "pending") {
    return { ok: false, reason: "not_pending" };
  }
  const updated = await invitationsRepo.updatePendingRoleServiceRole(
    input.invitationId,
    input.role,
  );
  // The pending row can settle between the read and the filtered update.
  if (!updated) return { ok: false, reason: "not_pending" };
  return { ok: true, invitation: updated };
}

export type ReplaceInvitationEmailResult =
  | Extract<CreateInvitationResult, { ok: true }>
  | { ok: false; reason: CreateInvitationReason | "not_found" | "not_pending" | "same_email" };

/**
 * Change the INVITED EMAIL by replacing the invitation: revoke the old one
 * (its link stops working immediately), then create a brand-new invitation —
 * new token, same role — for the new address, which also sends the new
 * invitation email and returns the new one-time copyable link.
 *
 * Ordering: revoke FIRST, then create. This keeps the one-pending-per-email
 * rule and the seat math correct (the old pending invite no longer occupies a
 * seat when the replacement is counted). If the create then refuses (e.g. the
 * new address is already a member), the old invitation stays revoked — the
 * inviter asked to stop that address's invite either way — and the UI surfaces
 * the typed reason.
 *
 * Email delivery failure does NOT invalidate the new invitation (same
 * persist-first semantics as createInvitation).
 */
export async function replaceInvitationEmail(input: {
  accountId: string;
  invitationId: string;
  newEmail: string;
  inviterUserId: string;
  inviter?: { email: string | null; displayName: string | null };
  now?: Date;
}): Promise<ReplaceInvitationEmailResult> {
  const invite = await invitationsRepo.getByIdServiceRole(input.invitationId);
  if (!invite || invite.accountId !== input.accountId) {
    return { ok: false, reason: "not_found" };
  }
  if (invite.status !== "pending") {
    return { ok: false, reason: "not_pending" };
  }
  const newEmail = normalizeEmail(input.newEmail);
  if (newEmail === normalizeEmail(invite.email)) {
    // Not a change — refuse rather than silently kill a working link.
    return { ok: false, reason: "same_email" };
  }

  await invitationsRepo.markRevokedServiceRole(
    input.invitationId,
    (input.now ?? new Date()).toISOString(),
  );

  const created = await createInvitation({
    accountId: input.accountId,
    inviterUserId: input.inviterUserId,
    email: newEmail,
    role: invite.role, // preserve the currently selected role
    inviter: input.inviter,
    now: input.now,
  });
  if (!created.ok) return created;
  return created;
}

// ── accept ───────────────────────────────────────────────────────────────────

export type AcceptInvitationReason =
  | "not_found"
  | "expired"
  | "revoked"
  | "already_accepted"
  | "wrong_email"
  | "account_frozen"
  | "team_member_limit_reached";

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

  // Lifecycle: only a PENDING invite accepts. Pending invitations never expire
  // (TEAM-INVITATION-LIFECYCLE-2) — no age or expires_at check. Historical
  // 'expired' rows (pre-rule) remain refusable history and are never
  // reactivated. An already-accepted invite re-presented by the SAME user is
  // idempotent (handled below after the membership check); any other terminal
  // state is refused.
  if (invite.status === "revoked") return { ok: false, reason: "revoked" };
  if (invite.status === "expired") return { ok: false, reason: "expired" };
  if (invite.status === "accepted" && invite.acceptedByUserId !== input.userId) {
    return { ok: false, reason: "already_accepted" };
  }

  // Email match — the accepting user's session email must equal the invite email.
  if (normalizeEmail(input.userEmail ?? "") !== normalizeEmail(invite.email)) {
    return { ok: false, reason: "wrong_email" };
  }

  // Account must exist + be operational.
  const account = await accountsRepo.getByIdServiceRole(invite.accountId);
  if (!account) return { ok: false, reason: "not_found" };
  if (account.deletionStatus === "pending_deletion") {
    return { ok: false, reason: "account_frozen" };
  }

  const alreadyMember = await membershipsRepo.isMemberServiceRole(
    invite.accountId,
    input.userId,
  );
  if (!alreadyMember) {
    // Member-limit RE-CHECK (4.ACCOUNT-MODEL-20): a real seat is only consumed
    // here. Refuse if the account is already full even though the invite was
    // created earlier (e.g. another invite filled the last slot first). Applies
    // to Team (5) and Business/organization (25); null only for a future
    // uncapped tier (none today).
    const limit = memberLimitFor(account.type);
    if (limit !== null) {
      const memberCount = await membershipsRepo.countMembersServiceRole(invite.accountId);
      if (memberCount >= limit) {
        return { ok: false, reason: "team_member_limit_reached" };
      }
    }
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
