/**
 * Typed client for the invitation-acceptance route (5.ONBOARD-4).
 * Components never call fetch() directly (project rule).
 */

export type AcceptInvitationErrorCode =
  | "INVITATION_NOT_FOUND"
  | "INVITATION_EXPIRED"
  | "INVITATION_REVOKED"
  | "INVITATION_ALREADY_ACCEPTED"
  | "INVITATION_EMAIL_MISMATCH"
  | "ACCOUNT_PENDING_DELETION"
  | "TEAM_MEMBER_LIMIT_REACHED"
  | "UNAUTHENTICATED"
  | "BAD_REQUEST"
  | "UNKNOWN";

export class AcceptInvitationError extends Error {
  constructor(
    message: string,
    public readonly code: AcceptInvitationErrorCode,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AcceptInvitationError";
  }
}

const KNOWN_CODES: readonly AcceptInvitationErrorCode[] = [
  "INVITATION_NOT_FOUND",
  "INVITATION_EXPIRED",
  "INVITATION_REVOKED",
  "INVITATION_ALREADY_ACCEPTED",
  "INVITATION_EMAIL_MISMATCH",
  "ACCOUNT_PENDING_DELETION",
  "TEAM_MEMBER_LIMIT_REACHED",
];

export interface AcceptedInvitation {
  ok: true;
  account: { id: string; name: string; type: string };
  /** True when the user was already a member — acceptance is idempotent. */
  alreadyMember: boolean;
}

export async function acceptInvitation(token: string): Promise<AcceptedInvitation> {
  const res = await fetch("/api/invitations/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    let body: { error?: string; code?: string } = {};
    try {
      body = (await res.json()) as { error?: string; code?: string };
    } catch {
      /* not json */
    }
    const code = KNOWN_CODES.includes(body.code as AcceptInvitationErrorCode)
      ? (body.code as AcceptInvitationErrorCode)
      : res.status === 401
        ? "UNAUTHENTICATED"
        : res.status === 400
          ? "BAD_REQUEST"
          : "UNKNOWN";
    throw new AcceptInvitationError(
      body.error ?? `Couldn't accept this invite (HTTP ${res.status}).`,
      code,
      res.status,
    );
  }
  return (await res.json()) as AcceptedInvitation;
}
