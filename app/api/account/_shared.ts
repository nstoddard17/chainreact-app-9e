import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { ensurePersonalAccount } from "@/services/accounts/ensurePersonalAccount";
import type { AccountRecord } from "@/contracts/accounts";

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
  /** The session user's email — required for the password re-auth step. */
  email: string | null;
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
}

/**
 * Minimal auth gate: resolve the authenticated caller's user id (or 401). Used
 * by routes that act on a target named in the body (e.g. set-active-account)
 * rather than on the caller's personal account. The user id always comes from
 * the verified session — never from request input — so a caller can only act as
 * themselves.
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
  return { ok: true, userId: user.id };
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

  return {
    ok: true,
    userId: user.id,
    email: user.email ?? null,
    account,
  };
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
 * The literal phrase the user must type to confirm an account-deletion request.
 * A GitHub/Stripe-style typed confirmation that defends against accidental or
 * automated submission, layered ON TOP of the password re-auth.
 */
export const DELETION_CONFIRM_PHRASE = "delete my account";

/** Body for POST /api/account/delete — re-auth password + typed confirmation. */
export const RequestDeletionBodySchema = z.object({
  password: z.string().min(1, "Password is required to confirm account deletion."),
  confirmText: z
    .string()
    .refine(
      (v) => v.trim().toLowerCase() === DELETION_CONFIRM_PHRASE,
      `Type "${DELETION_CONFIRM_PHRASE}" to confirm.`,
    ),
});
export type RequestDeletionBody = z.infer<typeof RequestDeletionBodySchema>;

/** Body for POST /api/account/active — the account to make active. */
export const SetActiveAccountBodySchema = z.object({
  accountId: z.string().uuid("A valid account id is required."),
});
export type SetActiveAccountBody = z.infer<typeof SetActiveAccountBodySchema>;

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
