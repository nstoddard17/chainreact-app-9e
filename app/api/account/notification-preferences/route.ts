import { NextResponse } from "next/server";
import {
  requireAuthedUserId,
  parseAccountBody,
  UpdateNotificationPreferencesBodySchema,
} from "@/app/api/account/_shared";
import {
  getOwnNotificationPreferences,
  updateOwnNotificationPreferences,
} from "@/services/accounts/notificationPreferences";

/**
 * GET / PATCH /api/account/notification-preferences (4.ACCOUNT-SETTINGS-4).
 *
 * Read / update the caller's OWN user-level notification toggles. Self-scoped:
 * the user id comes from the verified session, never the body, so a caller can
 * only ever touch their own `user_profiles` row (also RLS-gated by
 * `user_profiles_{select,update}_own`).
 *
 * PREFERENCE flags only — this route stores booleans; it sends nothing. No
 * email/push/Slack delivery, no per-account rules, no digests.
 */
export async function GET(): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;

  const preferences = await getOwnNotificationPreferences(auth.userId);
  return NextResponse.json({ ok: true, preferences });
}

export async function PATCH(request: Request): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;

  const body = await parseAccountBody(
    request,
    UpdateNotificationPreferencesBodySchema,
  );
  if (!body.ok) return body.response;

  const preferences = await updateOwnNotificationPreferences(
    auth.userId,
    body.data,
  );

  console.info(
    JSON.stringify({
      event: "account.notification_preferences.updated",
      // No user content — lifecycle bookkeeping only.
    }),
  );

  return NextResponse.json({ ok: true, preferences });
}
