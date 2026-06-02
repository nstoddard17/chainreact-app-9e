import type { AccountSummary, UserAccountsResult } from "@/services/accounts/accountList";

/**
 * Typed client for the account APIs (4.ACCOUNT-MODEL-18).
 *
 * Per project-structure-and-module-boundaries.md §5: client code calls this
 * module, never `fetch()` directly. Thin wrappers over the existing routes so the
 * future account switcher / Teams UI has a stable surface:
 *   - listAccounts()        → GET  /api/accounts
 *   - createTeam(name)      → POST /api/accounts   (auto-activates server-side)
 *   - setActiveAccount(id)  → POST /api/account/active
 *
 * Failures surface as `AccountApiError` so UI can branch on `code`.
 */

export type { AccountSummary, UserAccountsResult };

export type AccountApiErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "VALIDATION"
  | "CONFLICT"
  | "SERVER_ERROR"
  | "UNKNOWN";

export class AccountApiError extends Error {
  readonly code: AccountApiErrorCode;
  readonly status: number;
  constructor(message: string, code: AccountApiErrorCode, status: number) {
    super(message);
    this.name = "AccountApiError";
    this.code = code;
    this.status = status;
  }
}

/** GET /api/accounts — the caller's accounts + effective active id. */
export async function listAccounts(): Promise<UserAccountsResult> {
  const res = await fetch("/api/accounts");
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as UserAccountsResult;
}

export interface CreatedAccount {
  id: string;
  name: string;
  type: AccountSummary["type"];
}

/** POST /api/accounts — create a team (auto-activates server-side). */
export async function createTeam(name: string): Promise<CreatedAccount> {
  const res = await fetch("/api/accounts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { account: CreatedAccount };
  return body.account;
}

/** POST /api/account/active — set the caller's active account. */
export async function setActiveAccount(accountId: string): Promise<void> {
  const res = await fetch("/api/account/active", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accountId }),
  });
  if (!res.ok) throw await parseError(res);
}

// ── Team members + invitations (4.TEAM-PAGE-1) ─────────────────────────────────
// Thin wrappers over the existing account sub-routes so the Teams UI never calls
// fetch() directly. NO new backend behavior — invites return a copy-link (raw
// accept token) and no email is sent.

/** A non-`owner` role a member can hold or be invited as. */
export type TeamManageableRole = "admin" | "member";

export interface MemberSummary {
  userId: string;
  role: AccountSummary["role"];
  joinedAt: string;
  invitedByUserId: string | null;
}

export interface InvitationSummary {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

export interface CreatedInvitation {
  invitation: InvitationSummary;
  /** Raw accept token — returned ONCE on create, never stored. */
  acceptToken: string;
  /** App path carrying the raw token, e.g. `/invitations/accept?token=…`. */
  acceptPath: string;
}

/** GET /api/accounts/[id]/members — roster of an account the caller belongs to. */
export async function listMembers(accountId: string): Promise<MemberSummary[]> {
  const res = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/members`);
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { members: MemberSummary[] };
  return body.members;
}

/** GET /api/accounts/[id]/invitations — pending invites (owner/admin only). */
export async function listInvitations(
  accountId: string,
): Promise<InvitationSummary[]> {
  const res = await fetch(
    `/api/accounts/${encodeURIComponent(accountId)}/invitations`,
  );
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { invitations: InvitationSummary[] };
  return body.invitations;
}

/** POST /api/accounts/[id]/invitations — create an invite (owner/admin only). */
export async function createInvitation(
  accountId: string,
  email: string,
  role: TeamManageableRole,
): Promise<CreatedInvitation> {
  const res = await fetch(
    `/api/accounts/${encodeURIComponent(accountId)}/invitations`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, role }),
    },
  );
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as CreatedInvitation;
  return body;
}

/** DELETE /api/accounts/[id]/invitations/[invitationId] — revoke a pending invite. */
export async function revokeInvitation(
  accountId: string,
  invitationId: string,
): Promise<void> {
  const res = await fetch(
    `/api/accounts/${encodeURIComponent(accountId)}/invitations/${encodeURIComponent(
      invitationId,
    )}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw await parseError(res);
}

/** PATCH /api/accounts/[id]/members/[userId] — change a member's role. */
export async function changeMemberRole(
  accountId: string,
  userId: string,
  role: TeamManageableRole,
): Promise<void> {
  const res = await fetch(
    `/api/accounts/${encodeURIComponent(accountId)}/members/${encodeURIComponent(
      userId,
    )}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
    },
  );
  if (!res.ok) throw await parseError(res);
}

/** DELETE /api/accounts/[id]/members/[userId] — remove a non-owner member. */
export async function removeMember(
  accountId: string,
  userId: string,
): Promise<void> {
  const res = await fetch(
    `/api/accounts/${encodeURIComponent(accountId)}/members/${encodeURIComponent(
      userId,
    )}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw await parseError(res);
}

async function parseError(res: Response): Promise<AccountApiError> {
  let message = `Request failed (${res.status})`;
  try {
    const body = (await res.json()) as { error?: string };
    if (typeof body.error === "string" && body.error.length > 0) {
      message = body.error;
    }
  } catch {
    // Non-JSON body — keep the default message.
  }
  return new AccountApiError(message, codeForStatus(res.status), res.status);
}

function codeForStatus(status: number): AccountApiErrorCode {
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "FORBIDDEN";
  if (status === 400) return "VALIDATION";
  if (status === 409) return "CONFLICT";
  if (status >= 500) return "SERVER_ERROR";
  return "UNKNOWN";
}
