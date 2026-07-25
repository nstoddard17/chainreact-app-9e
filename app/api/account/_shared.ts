import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { readAccessTokenClaims } from "@/core/auth/accessTokenClaims";
import { ensurePersonalAccount } from "@/services/accounts/ensurePersonalAccount";
import type { AccountRecord } from "@/contracts/accounts";
import { NotificationPreferencesSchema } from "@/contracts/notificationPreferences";
import { DefaultBuilderViewSchema } from "@/contracts/builderViewPreference";

/**
 * Shared route-layer helpers for /api/account.
 *
 * Underscore-prefixed: not a route. Importable from sibling route.ts files only.
 *
 * Owns the auth/ownership gate for the self-serve account-deletion flow
 * (4.ACCOUNT-MODEL-10e). Unlike app/api/workflows/_shared.ts:requireUserWithAccount
 * — which deliberately 403s on a frozen (`pending_deletion`) account so every
 * operational surface is blocked — THIS resolver must keep resolving a frozen
 * account so the owner can still CANCEL the deletion during the grace window
 * (and a re-request is idempotent). The freeze enforcement layer from 10b is
 * untouched; the deletion routes are simply not part of it.
 */

export interface AccountOwnerSuccess {
  ok: true;
  userId: string;
  /**
   * The session user's email, read SERVER-SIDE from the verified auth identity.
   * The account-deletion challenge sends its code here and to nowhere else — a
   * destination address is never accepted from a request body.
   */
  email: string | null;
  /** Whether that address is confirmed (Supabase `email_confirmed_at`). */
  emailVerified: boolean;
  /**
   * Opaque auth-session id from the access token's `session_id` claim, or null
   * when it cannot be read. Sensitive-action challenges are bound to it, so a
   * code requested in one session cannot authorize the action from another.
   */
  sessionId: string | null;
  /** Session assurance level from the token's `aal` claim (null when unreadable). */
  aal: "aal1" | "aal2" | null;
  /** True when the user has a verified TOTP factor (i.e. MFA is enrolled). */
  hasVerifiedMfaFactor: boolean;
  /** The caller's OWN personal account (active OR pending_deletion). */
  account: AccountRecord;
}
export interface AccountRouteFailure {
  ok: false;
  response: NextResponse;
}

export interface AuthedUserSuccess {
  ok: true;
  userId: string;
  /** The session user's verified email (used by invite acceptance for the email match). */
  email: string | null;
}

/**
 * Minimal auth gate: resolve the authenticated caller's user id + email (or
 * 401). Used by routes that act on a target named in the body/path (e.g.
 * set-active-account, invitation accept) rather than on the caller's personal
 * account. The user id/email always come from the verified session — never from
 * request input — so a caller can only act as themselves.
 */
export async function requireAuthedUserId(): Promise<
  AuthedUserSuccess | AccountRouteFailure
> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
    };
  }
  return { ok: true, userId: user.id, email: user.email ?? null };
}

/**
 * Resolve the authenticated caller and their OWN personal account.
 *
 * Self-serve deletion applies only to the current user's personal account
 * (launch scope — no team/org, no account switcher). The account is resolved
 * from the verified session user id via `ensurePersonalAccount`; the routes
 * never accept an account id from the request body, so a caller can only ever
 * act on their own account. The `ownerUserId === userId` assertion is
 * belt-and-suspenders for the 1:1 personal-account invariant.
 */
export async function requireOwnPersonalAccount(): Promise<
  AccountOwnerSuccess | AccountRouteFailure
> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
    };
  }

  const account = await ensurePersonalAccount(user.id);
  if (account.ownerUserId !== user.id) {
    // Should be unreachable (personal account is 1:1 with its owner). If it ever
    // happens, refuse rather than act on an account the caller does not own.
    return {
      ok: false,
      response: NextResponse.json(
        { error: "forbidden", code: "NOT_ACCOUNT_OWNER" },
        { status: 403 },
      ),
    };
  }

  // Session claims for the sensitive-action challenge binding. `getUser()` above
  // already validated the token against the auth server, so decoding its payload
  // here is a read of ALREADY-VERIFIED data, not an identity check.
  //
  // BEST-EFFORT BY DESIGN. Most callers of this helper (profile, notification
  // preferences, builder view, usage, deletion CANCEL) need no session claims at
  // all, and none of them may start failing because an optional claim could not be
  // read. On any failure the claims come back null — which makes the DELETION
  // routes fail closed via `requireDeletionStepUpSession` (they refuse to bind a
  // challenge to nothing) while every other caller is unaffected.
  const claims = await readSessionClaims(supabase);

  return {
    ok: true,
    userId: user.id,
    email: user.email ?? null,
    emailVerified: Boolean(user.email_confirmed_at),
    sessionId: claims.sessionId,
    aal: claims.aal,
    hasVerifiedMfaFactor: (user.factors ?? []).some(
      (f) => f.status === "verified" && f.factor_type === "totp",
    ),
    account,
  };
}

/**
 * Destructive-action session gate shared by every step of the account-deletion
 * flow (ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1).
 *
 * Two preconditions, both refused with a typed non-enumerating error:
 *
 *  1. **A readable session id.** The challenge is session-bound; without a
 *     `session_id` claim we cannot bind it, so we refuse rather than issue an
 *     unbound code. (Supabase has emitted this claim for years — this is a
 *     fail-closed guard, not an expected branch.)
 *  2. **AAL2 when MFA is enrolled.** The email code is layered ON TOP of the
 *     existing assurance contract, never instead of it. The middleware already
 *     diverts MFA users to the challenge page for the SETTINGS UI; this repeats
 *     the check at the API so a direct call cannot skip it.
 */
export function requireDeletionStepUpSession(
  auth: AccountOwnerSuccess,
): { ok: true; sessionId: string } | AccountRouteFailure {
  if (auth.hasVerifiedMfaFactor && auth.aal !== "aal2") {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "Confirm your two-factor code first, then try deleting your account again.",
          code: "MFA_REQUIRED",
        },
        { status: 403 },
      ),
    };
  }
  if (!auth.sessionId) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Sign out and sign back in, then try again.",
          code: "SESSION_UNAVAILABLE",
        },
        { status: 401 },
      ),
    };
  }
  return { ok: true, sessionId: auth.sessionId };
}

/**
 * Read the non-secret `session_id` / `aal` claims of the caller's already-verified
 * access token. Never throws: an unreadable session yields empty claims, and the
 * callers that actually need them fail closed on that.
 */
async function readSessionClaims(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ sessionId: string | null; aal: "aal1" | "aal2" | null }> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return readAccessTokenClaims(session?.access_token);
  } catch {
    return { sessionId: null, aal: null };
  }
}

/** Parses request body with the supplied Zod schema; 400 on failure. */
export async function parseAccountBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Request body must be valid JSON." },
        { status: 400 },
      ),
    };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid request body.",
          issues: parsed.error.issues,
        },
        { status: 400 },
      ),
    };
  }
  return { ok: true, data: parsed.data };
}

/**
 * The literal word the user must type to confirm an account-deletion request
 * (ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1). A GitHub/Stripe-style typed
 * confirmation that defends against accidental or automated submission, layered
 * ON TOP of the emailed verification code.
 *
 * EXACT MATCH, case-sensitive: only `DELETE` is accepted. Deliberately stricter
 * than the previous trimmed/lowercased "delete my account" phrase — the typed
 * word is the last deliberate act before an irreversible lifecycle transition,
 * so "delete" or " Delete " must not pass for it.
 */
export const DELETION_CONFIRM_PHRASE = "DELETE";

/**
 * Body for POST /api/account/delete — typed confirmation ONLY.
 *
 * There is NO password field, for any auth provider. Deletion is authorized by
 * the verified, session-bound, single-use email challenge the caller already
 * completed; `.strict()` means a client that still sends `password` gets a 400
 * rather than having it silently ignored.
 */
export const RequestDeletionBodySchema = z
  .object({
    confirmText: z
      .string()
      .refine(
        (v) => v === DELETION_CONFIRM_PHRASE,
        `Type "${DELETION_CONFIRM_PHRASE}" to confirm.`,
      ),
  })
  .strict();
export type RequestDeletionBody = z.infer<typeof RequestDeletionBodySchema>;

/**
 * Body for POST /api/account/delete/verification-code/verify — the six-digit
 * code the user received. Whitespace/dashes from a paste are stripped by the
 * service; the schema only bounds the length so an oversized payload is rejected
 * before any crypto runs. `.strict()` rejects a smuggled email/userId/purpose —
 * every one of those is determined server-side.
 */
export const VerifyDeletionCodeBodySchema = z
  .object({
    code: z.string().min(1, "Enter the 6-digit code.").max(24, "Invalid code."),
  })
  .strict();
export type VerifyDeletionCodeBody = z.infer<typeof VerifyDeletionCodeBodySchema>;

/**
 * Body for POST /api/account/delete/verification-code — no fields. `.strict()`
 * so a client-supplied destination email is a hard 400 rather than something a
 * future edit might start reading.
 */
export const SendDeletionCodeBodySchema = z.object({}).strict();

/** Body for POST /api/account/active — the account to make active. */
export const SetActiveAccountBodySchema = z.object({
  accountId: z.string().uuid("A valid account id is required."),
});
export type SetActiveAccountBody = z.infer<typeof SetActiveAccountBodySchema>;

/**
 * Body for PATCH /api/account/profile — the caller's own display name
 * (4.ACCOUNT-SETTINGS-3). Empty string is allowed (clears to null in the
 * service); max length mirrors `MAX_DISPLAY_NAME_LENGTH`.
 */
export const UpdateDisplayNameBodySchema = z.object({
  displayName: z
    .string()
    .max(80, "Display name must be 80 characters or fewer."),
});
export type UpdateDisplayNameBody = z.infer<typeof UpdateDisplayNameBodySchema>;

/**
 * Body for PATCH /api/account/notification-preferences — the caller's own
 * boolean toggles (4.ACCOUNT-SETTINGS-4). Re-exported from the cross-layer
 * contract; `.strict()` rejects unknown keys so a malformed payload 400s.
 */
export const UpdateNotificationPreferencesBodySchema =
  NotificationPreferencesSchema.strict();

/**
 * Body for PATCH /api/account/builder-view — the caller's own default builder
 * view (BUILDER-VIEW-DEFAULT-1). `null` clears the default (→ ask on new
 * workflows); `.strict()` rejects unknown keys so a malformed payload 400s.
 */
export const UpdateBuilderViewBodySchema = z
  .object({ defaultBuilderView: DefaultBuilderViewSchema })
  .strict();

/**
 * Body for PATCH /api/account/password — current-password step-up + new password
 * (4.ACCOUNT-SETTINGS-7 / SEC-2). Min length mirrors `MIN_PASSWORD_LENGTH`; the
 * new password must differ from the current. Confirmation is a client concern.
 */
export const ChangePasswordBodySchema = z
  .object({
    currentPassword: z.string().min(1, "Your current password is required."),
    newPassword: z.string().min(8, "New password must be at least 8 characters."),
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: "New password must be different from your current password.",
    path: ["newPassword"],
  });
export type ChangePasswordBody = z.infer<typeof ChangePasswordBodySchema>;

/**
 * MFA (TOTP) route bodies (SEC-3). A TOTP code is 6 digits; we trim incidental
 * spaces the authenticator UIs sometimes insert before validating. The factor id
 * is a Supabase factor uuid. The disable body carries the current password for the
 * step-up re-auth (never logged).
 */
const TotpCodeSchema = z
  .string()
  .transform((v) => v.replace(/\s+/g, ""))
  .refine((v) => /^\d{6}$/.test(v), "Enter the 6-digit code from your authenticator app.");

export const MfaVerifyBodySchema = z.object({
  factorId: z.string().uuid("A valid factor id is required."),
  code: TotpCodeSchema,
});
export type MfaVerifyBody = z.infer<typeof MfaVerifyBodySchema>;

/**
 * Body for POST /api/account/mfa/disable. Disabling follows Supabase's AAL2 model,
 * NOT a password: when the session is already AAL2 no code is needed; when it's
 * AAL1 the caller supplies the current authenticator `code` to step up. Optional,
 * validated as 6 digits when present. No password field.
 */
export const MfaDisableBodySchema = z.object({
  code: TotpCodeSchema.optional(),
});
export type MfaDisableBody = z.infer<typeof MfaDisableBodySchema>;

export const MfaChallengeBodySchema = z.object({
  code: TotpCodeSchema,
});
export type MfaChallengeBody = z.infer<typeof MfaChallengeBodySchema>;

/** Shape returned by both routes — lifecycle state only, no account graph. */
export function toDeletionStatusResponse(state: {
  deletionStatus: string;
  deletionRequestedAt: string | null;
  purgeAfter: string | null;
}) {
  return {
    deletionStatus: state.deletionStatus,
    requestedAt: state.deletionRequestedAt,
    purgeAfter: state.purgeAfter,
  };
}
