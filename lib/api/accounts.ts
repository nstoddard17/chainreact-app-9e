import type { AccountSummary, UserAccountsResult } from "@/services/accounts/accountList";
import type { NotificationPreferences } from "@/contracts/notificationPreferences";
import type { DefaultBuilderView } from "@/contracts/builderViewPreference";

export type { NotificationPreferences };
export type { DefaultBuilderView };

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

export interface TransferOwnershipResult {
  ok: true;
  account: { id: string; name: string; type: AccountSummary["type"]; ownerUserId: string };
  transfer: {
    previousOwnerUserId: string;
    previousOwnerRole: "admin";
    newOwnerUserId: string;
    newOwnerRole: "owner";
  };
}

/**
 * POST /api/accounts/[id]/transfer-ownership — owner-initiated ownership
 * transfer (4.ACCOUNT-MODEL-TRANSFER-LEAVE-3 / TL-2). Owner-only + password
 * step-up; the target must already be a member. The old owner becomes admin and
 * the target becomes owner. Errors surface as `AccountApiError` (e.g. code
 * NOT_OWNER / TARGET_NOT_MEMBER / REAUTH_FAILED) so the future UI can branch.
 */
export async function transferOwnership(
  accountId: string,
  input: { targetUserId: string; password: string },
): Promise<TransferOwnershipResult> {
  const res = await fetch(
    `/api/accounts/${encodeURIComponent(accountId)}/transfer-ownership`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as TransferOwnershipResult;
}

/**
 * POST /api/accounts/[id]/leave — the caller leaves the account
 * (4.ACCOUNT-MODEL-TRANSFER-LEAVE-4 / TL-3). Reuses removal offboarding. A sole
 * owner is refused (`AccountApiError` code SOLE_OWNER_MUST_TRANSFER) and must
 * transfer ownership first.
 */
export async function leaveAccount(accountId: string): Promise<void> {
  const res = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/leave`, {
    method: "POST",
  });
  if (!res.ok) throw await parseError(res);
}

/**
 * GET /api/accounts/[id]/leave-impact — count of workflows in this account whose
 * personal-provider steps run under the CALLER's connection (as creator, or —
 * when reassignment is enabled — as the accepted per-node owner) and may stop
 * running after leave. Self-scoped advisory; count only.
 */
export async function getLeaveImpact(accountId: string): Promise<number> {
  const res = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/leave-impact`);
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { affectedWorkflowCount: number };
  return body.affectedWorkflowCount;
}

// ── Credential reassignment consent inbox (CS-7) ──────────────────────────────

/**
 * A pending per-node credential-reassignment request awaiting the caller's
 * consent. No-leak view — carries the workflow/node/provider-type + requester
 * display name only; never a token, provider account label, email, or scope.
 */
export interface CredentialRequestView {
  workflowId: string;
  nodeId: string;
  provider: string;
  workflowName: string;
  requestedByLabel: string;
  requestedAt: string;
}

/**
 * GET /api/accounts/[id]/credential-requests — the caller's own pending
 * credential-reassignment requests in this account. Self-scoped; empty when the
 * feature is off.
 */
export async function listCredentialRequests(
  accountId: string,
): Promise<CredentialRequestView[]> {
  const res = await fetch(
    `/api/accounts/${encodeURIComponent(accountId)}/credential-requests`,
  );
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { requests: CredentialRequestView[] };
  return body.requests;
}

/**
 * POST .../credential-owner/accept — the target consents; the step will run under
 * their connection (CS-3 route). Reuses the existing per-node credential route.
 */
export async function acceptCredentialRequest(
  workflowId: string,
  nodeId: string,
): Promise<void> {
  const res = await fetch(
    `/api/workflows/${encodeURIComponent(workflowId)}/nodes/${encodeURIComponent(
      nodeId,
    )}/credential-owner/accept`,
    { method: "POST" },
  );
  if (!res.ok) throw await parseError(res);
}

/** POST .../credential-owner/decline — the target declines; execution stays creator-pinned. */
export async function declineCredentialRequest(
  workflowId: string,
  nodeId: string,
): Promise<void> {
  const res = await fetch(
    `/api/workflows/${encodeURIComponent(workflowId)}/nodes/${encodeURIComponent(
      nodeId,
    )}/credential-owner/decline`,
    { method: "POST" },
  );
  if (!res.ok) throw await parseError(res);
}

// ── Profile basics (4.ACCOUNT-SETTINGS-3) ──────────────────────────────────────

/**
 * PATCH /api/account/profile — update the caller's OWN display name. Empty
 * string clears it (stored as null). Returns the canonical stored value.
 * Failures surface as `AccountApiError` (code VALIDATION on a too-long /
 * malformed payload, UNAUTHENTICATED on 401).
 */
export async function updateDisplayName(
  displayName: string,
): Promise<{ displayName: string | null }> {
  const res = await fetch("/api/account/profile", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName }),
  });
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { ok: true; displayName: string | null };
  return { displayName: body.displayName };
}

// ── Password change (4.ACCOUNT-SETTINGS-7 / SEC-2) ─────────────────────────────

/**
 * PATCH /api/account/password — change the caller's own password. Requires the
 * current password (step-up) + a new password (≥ 8 chars, different from
 * current). Failures surface as `AccountApiError` — the message carries the
 * backend reason (e.g. "Password confirmation failed." on a wrong current
 * password). Never returns the password.
 */
export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const res = await fetch("/api/account/password", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await parseError(res);
}

// ── Two-factor authentication (TOTP) (SEC-3) ───────────────────────────────────
// Thin wrappers over the self-scoped /api/account/mfa + /api/auth/mfa routes.
// The enrollment `secret`/`qrCode`/`uri` are returned by beginMfaEnrollment ONCE
// for a one-time render; the caller must never persist, log, or refetch them.

/** The caller's own two-factor status — non-secret metadata only. */
export interface MfaStatusView {
  enabled: boolean;
  factor: { id: string; friendlyName: string | null; createdAt: string } | null;
}

/** One-time enrollment material — shown once, never persisted or logged. */
export interface MfaEnrollmentView {
  factorId: string;
  /** SVG QR as a `data:` URI (render in an <img>). */
  qrCode: string;
  /** Base32 shared secret for manual entry. Sensitive. */
  secret: string;
  /** otpauth:// URI. Sensitive. */
  uri: string;
}

/** GET /api/account/mfa — the caller's own two-factor status. */
export async function getMfaStatus(): Promise<MfaStatusView> {
  const res = await fetch("/api/account/mfa");
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as MfaStatusView;
}

/** POST /api/account/mfa/enroll — start TOTP enrollment (returns one-time material). */
export async function beginMfaEnrollment(): Promise<MfaEnrollmentView> {
  const res = await fetch("/api/account/mfa/enroll", { method: "POST" });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as MfaEnrollmentView;
}

/** POST /api/account/mfa/verify — confirm enrollment with the first code (enables MFA). */
export async function confirmMfaEnrollment(input: {
  factorId: string;
  code: string;
}): Promise<void> {
  const res = await fetch("/api/account/mfa/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await parseError(res);
}

/**
 * Result of a disable attempt. Turning MFA off follows Supabase's AAL2 model (no
 * password): usually the session is already AAL2 and it just succeeds; if the
 * session is AAL1 the caller must supply the current authenticator code
 * (`mfa_required`), and a wrong code is `invalid_code`. Other failures throw.
 */
export type DisableMfaResult = { ok: true } | { ok: false; reason: "mfa_required" | "invalid_code" };

/**
 * POST /api/account/mfa/disable — turn MFA off. Pass the authenticator `code` only
 * when a prior call returned `mfa_required` (AAL1 session). No password.
 */
export async function disableMfa(code?: string): Promise<DisableMfaResult> {
  const res = await fetch("/api/account/mfa/disable", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(code ? { code } : {}),
  });
  if (res.ok) return { ok: true };
  let body: { error?: string; code?: string } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    // Non-JSON — fall through to a thrown generic error below.
  }
  if (body.code === "MFA_REQUIRED") return { ok: false, reason: "mfa_required" };
  if (body.code === "INVALID_CODE") return { ok: false, reason: "invalid_code" };
  const message =
    typeof body.error === "string" && body.error.length > 0
      ? body.error
      : `Request failed (${res.status})`;
  throw new AccountApiError(message, codeForStatus(res.status), res.status);
}

/** POST /api/auth/mfa/verify — satisfy the login-time MFA challenge (elevates session). */
export async function verifyMfaChallenge(code: string): Promise<void> {
  const res = await fetch("/api/auth/mfa/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw await parseError(res);
}

// ── Notification preferences (4.ACCOUNT-SETTINGS-4) ────────────────────────────

/** GET /api/account/notification-preferences — the caller's own toggles. */
export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const res = await fetch("/api/account/notification-preferences");
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { ok: true; preferences: NotificationPreferences };
  return body.preferences;
}

/**
 * PATCH /api/account/notification-preferences — replace the caller's own
 * toggles. Returns the canonical stored shape. Failures surface as
 * `AccountApiError` (code VALIDATION on a malformed payload, UNAUTHENTICATED on
 * 401).
 */
export async function updateNotificationPreferences(
  preferences: NotificationPreferences,
): Promise<NotificationPreferences> {
  const res = await fetch("/api/account/notification-preferences", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(preferences),
  });
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { ok: true; preferences: NotificationPreferences };
  return body.preferences;
}

// ── Default builder view (BUILDER-VIEW-DEFAULT-1) ──────────────────────────────

/** GET /api/account/builder-view — the caller's own default ("visual" | "document" | null = ask). */
export async function getDefaultBuilderView(): Promise<DefaultBuilderView> {
  const res = await fetch("/api/account/builder-view");
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { ok: true; defaultBuilderView: DefaultBuilderView };
  return body.defaultBuilderView;
}

/**
 * PATCH /api/account/builder-view — set (or clear with null) the caller's own
 * default builder view. Returns the canonical stored value; failures surface
 * as `AccountApiError`.
 */
export async function updateDefaultBuilderView(
  defaultBuilderView: DefaultBuilderView,
): Promise<DefaultBuilderView> {
  const res = await fetch("/api/account/builder-view", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ defaultBuilderView }),
  });
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { ok: true; defaultBuilderView: DefaultBuilderView };
  return body.defaultBuilderView;
}

// ── Personal account deletion (4.ACCOUNT-SETTINGS-1) ───────────────────────────
// Wrappers over the self-serve deletion lifecycle routes. The request route is a
// reversible FREEZE (grace window), not a hard delete; cancel restores during the
// window. Deletion errors carry a backend `code` so the settings UI can branch —
// surfaced via the dedicated `AccountDeletionError` (the owned-teams case also
// carries the `ownedAccounts` summaries for the remediation blocker).

/** Backend error codes for the deletion lifecycle routes. */
export type AccountDeletionErrorCode =
  | "ACCOUNT_HAS_OWNED_TEAMS"
  /**
   * The final deletion request arrived without a live, verified, session-bound
   * email authorization (ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1) — it was
   * never verified, it expired, or it was already spent. Deliberately one code:
   * the backend never tells the client which.
   */
  | "VERIFICATION_REQUIRED"
  | "INVALID_CONFIRMATION"
  | "ACCOUNT_PENDING_DELETION"
  /** MFA is enrolled but this session is still AAL1 — step up, then retry. */
  | "MFA_REQUIRED"
  /** The challenge subsystem is unavailable (missing server key / email transport). */
  | "VERIFICATION_UNAVAILABLE"
  /** No usable session id to bind a challenge to — sign out and back in. */
  | "SESSION_UNAVAILABLE"
  // ── Verification-code lifecycle ─────────────────────────────────────────────
  /** Resend requested inside the throttle window; `retryAfterSeconds` is set. */
  | "RESEND_TOO_SOON"
  /** The durable per-user send cap for this purpose is exhausted. */
  | "SEND_LIMIT_REACHED"
  /** The account has no confirmed address to send a code to (fail-closed). */
  | "NO_VERIFIED_EMAIL"
  /** The transactional-email transport did not accept the message. */
  | "EMAIL_UNAVAILABLE"
  /** Wrong code; `attemptsRemaining` is set. */
  | "INVALID_CODE"
  | "CODE_EXPIRED"
  | "TOO_MANY_ATTEMPTS"
  /** No live challenge for this user+session+purpose — send a new code. */
  | "NO_ACTIVE_CODE"
  /** Billing retry attempted on an account that isn't pending deletion. */
  | "NOT_PENDING_DELETION"
  /**
   * ACCOUNT-BILLING-LIFECYCLE-1 — the deletion request DID freeze the account, but the
   * ChainReact subscription could not be cancelled. A partial success, deliberately
   * surfaced as an error so the UI can never render a clean "done": the caller must retry.
   * `deletionState` carries the (real) frozen lifecycle state that accompanied it.
   */
  | "BILLING_CANCELLATION_FAILED"
  | "UNKNOWN";

/** An owned Team/Business account blocking personal deletion (TL-4 shape). */
export interface OwnedAccountSummary {
  id: string;
  name: string;
  type: AccountSummary["type"];
  /** User-facing tier label (org → "Business"); never the raw internal type. */
  typeLabel: string;
}

export class AccountDeletionError extends Error {
  readonly code: AccountDeletionErrorCode;
  readonly status: number;
  /** Present only for `ACCOUNT_HAS_OWNED_TEAMS` — the accounts to resolve first. */
  readonly ownedAccounts?: readonly OwnedAccountSummary[];
  /**
   * Present only for `BILLING_CANCELLATION_FAILED` — the account IS frozen, so the UI must
   * still move to the pending state while showing the billing-retry warning.
   */
  readonly deletionState?: DeletionStatusResult;
  /** Present only for `RESEND_TOO_SOON` — seconds until a resend is allowed. */
  readonly retryAfterSeconds?: number;
  /** Present only for `INVALID_CODE` — guesses left before the challenge locks. */
  readonly attemptsRemaining?: number;
  constructor(
    message: string,
    code: AccountDeletionErrorCode,
    status: number,
    extra: {
      ownedAccounts?: readonly OwnedAccountSummary[];
      deletionState?: DeletionStatusResult;
      retryAfterSeconds?: number;
      attemptsRemaining?: number;
    } = {},
  ) {
    super(message);
    this.name = "AccountDeletionError";
    this.code = code;
    this.status = status;
    this.ownedAccounts = extra.ownedAccounts;
    this.deletionState = extra.deletionState;
    this.retryAfterSeconds = extra.retryAfterSeconds;
    this.attemptsRemaining = extra.attemptsRemaining;
  }
}

/** Lifecycle state returned by both deletion routes (no account graph). */
export interface DeletionStatusResult {
  deletionStatus: "active" | "pending_deletion";
  requestedAt: string | null;
  purgeAfter: string | null;
  /**
   * Outcome of cancelling the account's ChainReact subscription as part of the request
   * (ACCOUNT-BILLING-LIFECYCLE-1). Absent on the cancel/restore route, which performs no
   * billing action by design.
   */
  billingCancellation?: "not_applicable" | "canceled" | "failed";
}

// ── Universal deletion verification (ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1) ─
// One flow for every auth provider — password, Google, email OTP, multi-identity.
// The client never sends a destination address and never receives a code or a
// challenge id: it only learns a MASKED address and the timing it needs to render
// the resend countdown. Codes are typed into the page and posted; they are never
// placed in a URL, stored, or logged.

/** What the UI needs after a code was sent. Carries no code and no challenge id. */
export interface DeletionCodeSentResult {
  /** Masked destination, e.g. `c••••••••@gmail.com`. Never the full address. */
  maskedEmail: string;
  expiresAt: string;
  /** Earliest time a resend is allowed — drives the countdown. */
  resendAvailableAt: string;
  codeLength: number;
  maxAttempts: number;
}

/**
 * POST /api/account/delete/verification-code — send (or resend) the deletion
 * verification code to the VERIFIED email on the caller's auth identity. Takes no
 * arguments by design: the server determines the destination.
 *
 * Throws `AccountDeletionError` — RESEND_TOO_SOON (with `retryAfterSeconds`),
 * SEND_LIMIT_REACHED, NO_VERIFIED_EMAIL, EMAIL_UNAVAILABLE, MFA_REQUIRED, or
 * VERIFICATION_UNAVAILABLE.
 */
export async function sendAccountDeletionCode(): Promise<DeletionCodeSentResult> {
  const res = await fetch("/api/account/delete/verification-code", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (!res.ok) throw await parseDeletionError(res);
  const body = (await res.json()) as { ok: true } & DeletionCodeSentResult;
  return {
    maskedEmail: body.maskedEmail,
    expiresAt: body.expiresAt,
    resendAvailableAt: body.resendAvailableAt,
    codeLength: body.codeLength,
    maxAttempts: body.maxAttempts,
  };
}

/**
 * POST /api/account/delete/verification-code/verify — check the emailed code.
 * Success authorizes deletion for a few minutes; it deletes nothing on its own.
 *
 * Throws `AccountDeletionError` — INVALID_CODE (with `attemptsRemaining`),
 * CODE_EXPIRED, TOO_MANY_ATTEMPTS, or NO_ACTIVE_CODE.
 */
export async function verifyAccountDeletionCode(
  code: string,
): Promise<{ authorizationExpiresAt: string }> {
  const res = await fetch("/api/account/delete/verification-code/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw await parseDeletionError(res);
  const body = (await res.json()) as { ok: true; authorizationExpiresAt: string };
  return { authorizationExpiresAt: body.authorizationExpiresAt };
}

/**
 * POST /api/account/delete — request deletion of the caller's OWN personal
 * account. Requires the exact typed word `DELETE` plus a verification code that
 * was already verified in THIS session. NO PASSWORD, for any auth provider.
 * Freezes the account (reversible during the grace window) and returns the
 * lifecycle state. Throws `AccountDeletionError` — code ACCOUNT_HAS_OWNED_TEAMS
 * (with `ownedAccounts`), VERIFICATION_REQUIRED, or INVALID_CONFIRMATION.
 */
export async function requestAccountDeletion(input: {
  confirmText: string;
}): Promise<DeletionStatusResult> {
  const res = await fetch("/api/account/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ confirmText: input.confirmText }),
  });
  if (!res.ok) throw await parseDeletionError(res);
  return (await res.json()) as DeletionStatusResult;
}

/**
 * POST /api/account/delete/retry-billing — re-attempt ONLY the subscription
 * cancellation after a partial failure. No code and no password: the account is
 * already frozen, so there is no destructive transition left to authorize.
 */
export async function retryAccountDeletionBilling(): Promise<DeletionStatusResult> {
  const res = await fetch("/api/account/delete/retry-billing", { method: "POST" });
  if (!res.ok) throw await parseDeletionError(res);
  return (await res.json()) as DeletionStatusResult;
}

/**
 * POST /api/account/delete/cancel — cancel a pending deletion during the grace
 * window (no re-auth; a safe restore must never strand the owner). Returns the
 * account to `active`.
 */
export async function cancelAccountDeletion(): Promise<DeletionStatusResult> {
  const res = await fetch("/api/account/delete/cancel", { method: "POST" });
  if (!res.ok) throw await parseDeletionError(res);
  return (await res.json()) as DeletionStatusResult;
}

async function parseDeletionError(res: Response): Promise<AccountDeletionError> {
  let body: {
    error?: string;
    code?: string;
    ownedAccounts?: OwnedAccountSummary[];
    deletionStatus?: string;
    requestedAt?: string | null;
    purgeAfter?: string | null;
    retryAfterSeconds?: number;
    attemptsRemaining?: number;
  } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    // Non-JSON body — fall through to the status-derived defaults.
  }
  const message =
    typeof body.error === "string" && body.error.length > 0
      ? body.error
      : `Request failed (${res.status})`;
  const code = deletionCodeFor(body.code, res.status);
  const ownedAccounts = Array.isArray(body.ownedAccounts)
    ? body.ownedAccounts
    : undefined;
  // The billing-partial-failure response carries the REAL (frozen) lifecycle state alongside
  // the error, so the card can show the pending state and the retry warning together.
  const deletionState =
    code === "BILLING_CANCELLATION_FAILED" && body.deletionStatus === "pending_deletion"
      ? {
          deletionStatus: "pending_deletion" as const,
          requestedAt: body.requestedAt ?? null,
          purgeAfter: body.purgeAfter ?? null,
          billingCancellation: "failed" as const,
        }
      : undefined;
  return new AccountDeletionError(message, code, res.status, {
    ownedAccounts,
    deletionState,
    retryAfterSeconds:
      typeof body.retryAfterSeconds === "number" ? body.retryAfterSeconds : undefined,
    attemptsRemaining:
      typeof body.attemptsRemaining === "number" ? body.attemptsRemaining : undefined,
  });
}

/**
 * Backend `code` values that map 1:1 onto a typed client code. The server is
 * authoritative; the status fallbacks below only cover a response that carried no
 * code at all.
 */
const PASSTHROUGH_DELETION_CODES = new Set<AccountDeletionErrorCode>([
  "ACCOUNT_HAS_OWNED_TEAMS",
  "VERIFICATION_REQUIRED",
  "ACCOUNT_PENDING_DELETION",
  "BILLING_CANCELLATION_FAILED",
  "MFA_REQUIRED",
  "VERIFICATION_UNAVAILABLE",
  "SESSION_UNAVAILABLE",
  "RESEND_TOO_SOON",
  "SEND_LIMIT_REACHED",
  "NO_VERIFIED_EMAIL",
  "EMAIL_UNAVAILABLE",
  "INVALID_CODE",
  "CODE_EXPIRED",
  "TOO_MANY_ATTEMPTS",
  "NO_ACTIVE_CODE",
  "NOT_PENDING_DELETION",
]);

/**
 * Map the backend `code` (authoritative) + HTTP status to a typed deletion code.
 * A bare 400 is the Zod validation failure on the typed `DELETE` confirmation; a
 * bare 401 on the deletion routes means the email authorization was missing or
 * spent (VERIFICATION_REQUIRED) — there is no password step any more.
 */
function deletionCodeFor(
  serverCode: string | undefined,
  status: number,
): AccountDeletionErrorCode {
  if (serverCode && PASSTHROUGH_DELETION_CODES.has(serverCode as AccountDeletionErrorCode)) {
    return serverCode as AccountDeletionErrorCode;
  }
  if (status === 409) return "ACCOUNT_HAS_OWNED_TEAMS";
  if (status === 400) return "INVALID_CONFIRMATION";
  if (status === 401) return "VERIFICATION_REQUIRED";
  return "UNKNOWN";
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
  /** Safe display identity (co-member-only). Null when unavailable. */
  email: string | null;
  displayName: string | null;
}

export interface InvitationSummary {
  id: string;
  email: string;
  role: string;
  status: string;
  /** Null since TEAM-INVITATION-LIFECYCLE-2 — pending invites don't expire. */
  expiresAt: string | null;
  createdAt: string;
}

export type InvitationEmailDeliveryStatus = "sent" | "failed" | "not_configured";

export interface CreatedInvitation {
  invitation: InvitationSummary;
  /** Raw accept token — returned ONCE on create, never stored. */
  acceptToken: string;
  /** App path carrying the raw token, e.g. `/invitations/accept?token=…`. */
  acceptPath: string;
  /**
   * Outcome of the transactional invitation email (TEAM-INVITATION-EMAIL-1).
   * "sent" only when the provider accepted the message. The invitation exists
   * regardless — on "failed"/"not_configured" the UI surfaces the copy link as
   * the delivery path.
   */
  emailDelivery: { status: InvitationEmailDeliveryStatus };
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
  const body = (await res.json()) as Omit<CreatedInvitation, "emailDelivery"> & {
    emailDelivery?: { status?: InvitationEmailDeliveryStatus };
  };
  // Missing/unknown delivery info degrades to "failed" — the UI then leads
  // with the copy link, which is always a safe instruction.
  const status = body.emailDelivery?.status;
  return {
    ...body,
    emailDelivery: {
      status:
        status === "sent" || status === "not_configured" ? status : "failed",
    },
  };
}

/**
 * PATCH /api/accounts/[id]/invitations/[invitationId] { role } — change a
 * pending invite's role IN PLACE (TEAM-INVITATION-LIFECYCLE-2). Same token and
 * link; no new email is sent.
 */
export async function changeInvitationRole(
  accountId: string,
  invitationId: string,
  role: TeamManageableRole,
): Promise<InvitationSummary> {
  const res = await fetch(
    `/api/accounts/${encodeURIComponent(accountId)}/invitations/${encodeURIComponent(invitationId)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
    },
  );
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { invitation: InvitationSummary };
  return body.invitation;
}

/**
 * PATCH /api/accounts/[id]/invitations/[invitationId] { email } — REPLACE the
 * invite for a new address (TEAM-INVITATION-LIFECYCLE-2): the old link stops
 * working; a new token/link/email is issued with the same role. Returns the
 * new one-time link + delivery status (same shape as create).
 */
export async function changeInvitationEmail(
  accountId: string,
  invitationId: string,
  email: string,
): Promise<CreatedInvitation> {
  const res = await fetch(
    `/api/accounts/${encodeURIComponent(accountId)}/invitations/${encodeURIComponent(invitationId)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    },
  );
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as Omit<CreatedInvitation, "emailDelivery"> & {
    emailDelivery?: { status?: InvitationEmailDeliveryStatus };
  };
  const status = body.emailDelivery?.status;
  return {
    ...body,
    emailDelivery: {
      status:
        status === "sent" || status === "not_configured" ? status : "failed",
    },
  };
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

/**
 * GET /api/accounts/[id]/members/[userId]/workflow-impact — advisory count of
 * workflows whose personal-provider steps run under the target's connection (as
 * creator, or — when reassignment is enabled — as the accepted per-node owner)
 * and may stop running after removal (4.TEAM-WORKFLOWS-7 / TW-5, extended CS-6).
 * Owner/admin only.
 */
export async function getMemberWorkflowImpact(
  accountId: string,
  userId: string,
): Promise<number> {
  const res = await fetch(
    `/api/accounts/${encodeURIComponent(accountId)}/members/${encodeURIComponent(
      userId,
    )}/workflow-impact`,
  );
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { affectedWorkflowCount: number };
  return body.affectedWorkflowCount;
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

// ── Account API keys (4.API-KEYS-FOUNDATION-4 / FK-3) ──────────────────────────
// Thin wrappers over the owner/admin-only FK-2 management routes. The raw key is
// returned by `createApiKey` EXACTLY ONCE (the create response) and must be shown
// once and never refetched, persisted, or logged. No route ever returns the
// `key_hash`; lists carry display metadata only.

/** The only scope enabled at launch. */
export const LAUNCH_API_KEY_SCOPE = "workflows:trigger";

export type ApiKeyStatus = "active" | "revoked" | "expired";

/** Display metadata for one API key — NEVER the raw key or `key_hash`. */
export interface ApiKeyMetadataView {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  status: ApiKeyStatus;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** The result of creating a key — the raw secret is present ONLY here. */
export interface CreatedApiKey {
  metadata: ApiKeyMetadataView;
  /** Raw secret — shown to the user exactly once; never refetch or persist it. */
  key: string;
}

export interface CreateApiKeyInput {
  name: string;
  /** Defaults to `[LAUNCH_API_KEY_SCOPE]`; only `workflows:trigger` is enabled. */
  scopes?: string[];
  /** Optional ISO-8601 expiry. Null/omitted = no expiry. */
  expiresAt?: string | null;
}

/** GET /api/accounts/[id]/api-keys — list this account's key metadata (owner/admin). */
export async function listApiKeys(accountId: string): Promise<ApiKeyMetadataView[]> {
  const res = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/api-keys`);
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { apiKeys: ApiKeyMetadataView[] };
  return body.apiKeys;
}

/**
 * POST /api/accounts/[id]/api-keys — mint a key (owner/admin). The raw secret is
 * returned ONCE in `key`; reveal it to the user a single time and never store it.
 */
export async function createApiKey(
  accountId: string,
  input: CreateApiKeyInput,
): Promise<CreatedApiKey> {
  const res = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/api-keys`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      scopes: input.scopes ?? [LAUNCH_API_KEY_SCOPE],
      expiresAt: input.expiresAt ?? null,
    }),
  });
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { apiKey: ApiKeyMetadataView; key: string };
  return { metadata: body.apiKey, key: body.key };
}

/** DELETE /api/accounts/[id]/api-keys/[keyId] — soft-revoke a key (owner/admin). */
export async function revokeApiKey(accountId: string, keyId: string): Promise<void> {
  const res = await fetch(
    `/api/accounts/${encodeURIComponent(accountId)}/api-keys/${encodeURIComponent(keyId)}`,
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
