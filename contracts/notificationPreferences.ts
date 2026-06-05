import { z } from "zod";

/**
 * User-level notification preferences (4.ACCOUNT-SETTINGS-4).
 *
 * Simple per-user boolean toggles stored on `user_profiles` (additive columns).
 * PREFERENCE flags only — no delivery (email/push/Slack) and no per-account
 * rules in this slice. Cross-layer contract: shared by the repo/service/route
 * (server) and the client wrapper + UI.
 */

export const NotificationPreferencesSchema = z.object({
  productUpdates: z.boolean(),
  workflowAlerts: z.boolean(),
  teamActivity: z.boolean(),
});
export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>;

/**
 * Launch defaults — operational signals ON, news OFF (opt-in). Used as the
 * fallback when a profile row hasn't been observed yet; the DB column DEFAULTs
 * mirror these exactly.
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  productUpdates: false,
  workflowAlerts: true,
  teamActivity: true,
};
