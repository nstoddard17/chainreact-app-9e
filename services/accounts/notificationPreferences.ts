import * as userProfilesRepo from "@/repositories/userProfiles";
import type { NotificationPreferences } from "@/contracts/notificationPreferences";

/**
 * Notification-preferences service (4.ACCOUNT-SETTINGS-4).
 *
 * Self-scoped, like the display-name service: the caller's user id always comes
 * from the verified session (never request input), and the repo write is
 * RLS-gated to the caller's own row. Booleans need no normalization — the route
 * Zod already guarantees three booleans — so these are thin pass-throughs that
 * return the canonical stored shape.
 */

export async function getOwnNotificationPreferences(
  userId: string,
): Promise<NotificationPreferences> {
  return userProfilesRepo.getNotificationPreferences(userId);
}

export async function updateOwnNotificationPreferences(
  userId: string,
  prefs: NotificationPreferences,
): Promise<NotificationPreferences> {
  await userProfilesRepo.updateNotificationPreferences(userId, prefs);
  return prefs;
}
