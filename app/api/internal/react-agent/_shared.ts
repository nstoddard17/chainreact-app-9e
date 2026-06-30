import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { isInternalAdmin } from "@/repositories/internalAdmins";

/**
 * Internal-admin auth gate for the React Agent feedback surfaces
 * (INTERNAL-FEEDBACK-1). Underscore-prefixed: NOT a route — shared by the
 * `/api/internal/react-agent/*` route(s) and the `/admin/react-agent` page.
 *
 * This is the COMPANY-internal gate (Marcus, partner, internal staff). It is
 * distinct from the customer account-role gates (`requireAccountRole`,
 * `requireUserWithAccount`): an account owner / team admin / org admin is NOT an
 * internal admin and gets nothing here. Internal-admin membership lives in the
 * `internal_admins` table; `isInternalAdmin` is the single seam that decides it.
 *
 * `loadInternalAdmin()` is the one decision point. It distinguishes three states
 * so each consumer can apply its OWN denial convention:
 *   - `anonymous`  — no session (the page redirects to sign-in; the API 404s).
 *   - `denied`     — signed in, but not an internal admin (both 404 / notFound,
 *                    non-disclosure: a non-admin can't tell the surface exists).
 *   - `ok`         — internal admin; proceed.
 */

export type InternalAdminState =
  | { status: "anonymous" }
  | { status: "denied" }
  | { status: "ok"; userId: string; email: string };

export async function loadInternalAdmin(): Promise<InternalAdminState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "anonymous" };

  const admin = await isInternalAdmin(user.id);
  if (!admin) return { status: "denied" };

  return { status: "ok", userId: user.id, email: user.email ?? "" };
}

export interface InternalAdminAuthOk {
  ok: true;
  userId: string;
  email: string;
}
export interface InternalAdminAuthFail {
  ok: false;
  response: NextResponse;
}

/**
 * API-route gate. Both `anonymous` and `denied` collapse to a 404 (non-disclosure
 * — the route behaves as if it does not exist for anyone who is not an internal
 * admin; it never returns 403, which would confirm the route exists).
 */
export async function requireInternalAdmin(): Promise<
  InternalAdminAuthOk | InternalAdminAuthFail
> {
  const state = await loadInternalAdmin();
  if (state.status === "ok") {
    return { ok: true, userId: state.userId, email: state.email };
  }
  return {
    ok: false,
    response: NextResponse.json({ error: "not_found" }, { status: 404 }),
  };
}
