import { NextResponse } from "next/server";
import {
  requireAuthedUserId,
  parseAccountBody,
  UpdateDisplayNameBodySchema,
} from "@/app/api/account/_shared";
import { updateOwnDisplayName } from "@/services/accounts/userProfile";

/**
 * PATCH /api/account/profile — update the caller's OWN profile basics
 * (4.ACCOUNT-SETTINGS-3). Today that's just the display name.
 *
 * Self-scoped: the user id comes from the verified session, never the body, so a
 * caller can only ever update their own `user_profiles` row (also RLS-gated by
 * `user_profiles_update_own`). The body carries only `displayName` (≤ 80 chars;
 * empty clears it). Returns the canonical stored value.
 *
 * Scope floor: display name only — no avatar, username, email, security, or any
 * other profile/account field.
 */
export async function PATCH(request: Request): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;

  const body = await parseAccountBody(request, UpdateDisplayNameBodySchema);
  if (!body.ok) return body.response;

  const result = await updateOwnDisplayName(auth.userId, body.data.displayName);

  console.info(
    JSON.stringify({
      event: "account.profile.display_name.updated",
      // No user content — lifecycle bookkeeping only.
      cleared: result.displayName === null,
    }),
  );

  return NextResponse.json({ ok: true, displayName: result.displayName });
}
