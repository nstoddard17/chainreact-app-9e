import { createClient } from "@/utils/supabase/server";
import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import {
  DefaultBuilderViewSchema,
  type DefaultBuilderView,
} from "@/contracts/builderViewPreference";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from "@/contracts/notificationPreferences";

/**
 * Repository for user-scoped fields on `user_profiles`.
 *
 * 4.ACCOUNT-MODEL-11b — owns reads/writes of the active-account pointer
 * (`active_account_id`, added additively in 11a). Session-client only: the RLS
 * policies `user_profiles_select_own` / `user_profiles_update_own` gate on
 * `auth.uid() = id`, so a caller can only ever read/write their OWN profile row.
 *
 * The pointer is a UI default, NOT an authority. Whether the caller may actually
 * operate on the referenced account is decided by the resolver/service via a
 * membership check — never by this column. Writing it here grants nothing.
 */

/**
 * Read the caller's OWN stored display name (4.ACCOUNT-SETTINGS-3). Session
 * client — `user_profiles_select_own` gates on `auth.uid() = id`. Returns the
 * raw column value (NOT the OAuth-metadata fallback the member-identities RPC
 * applies); the Profile editor edits this exact column. `null` when unset.
 */
export async function getDisplayName(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle<{ display_name: string | null }>();
  if (error) {
    throw new Error(`user_profiles.getDisplayName failed: ${error.message}`);
  }
  return data?.display_name ?? null;
}

/**
 * Set the caller's OWN display name (4.ACCOUNT-SETTINGS-3). Session client —
 * `user_profiles_update_own` gates on `auth.uid() = id`, so a caller can only
 * ever write their own row. `null` clears it (downstream reads fall back to
 * OAuth metadata via the member-identities RPC).
 */
export async function updateDisplayName(
  userId: string,
  displayName: string | null,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("user_profiles")
    .update({ display_name: displayName })
    .eq("id", userId);
  if (error) {
    throw new Error(`user_profiles.updateDisplayName failed: ${error.message}`);
  }
}

/**
 * Read the caller's OWN notification preferences (4.ACCOUNT-SETTINGS-4). Session
 * client — `user_profiles_select_own` gates on `auth.uid() = id`. Falls back to
 * the launch defaults if the row is somehow absent (the columns are NOT NULL
 * with defaults, so a present row always has concrete booleans).
 */
export async function getNotificationPreferences(
  userId: string,
): Promise<NotificationPreferences> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_profiles")
    .select(
      "notify_product_updates, notify_workflow_alerts, notify_team_activity",
    )
    .eq("id", userId)
    .maybeSingle<{
      notify_product_updates: boolean;
      notify_workflow_alerts: boolean;
      notify_team_activity: boolean;
    }>();
  if (error) {
    throw new Error(
      `user_profiles.getNotificationPreferences failed: ${error.message}`,
    );
  }
  if (!data) return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  return {
    productUpdates: data.notify_product_updates,
    workflowAlerts: data.notify_workflow_alerts,
    teamActivity: data.notify_team_activity,
  };
}

/**
 * Set the caller's OWN notification preferences (4.ACCOUNT-SETTINGS-4). Session
 * client — `user_profiles_update_own` gates on `auth.uid() = id`, so a caller
 * can only ever write their own row.
 */
export async function updateNotificationPreferences(
  userId: string,
  prefs: NotificationPreferences,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("user_profiles")
    .update({
      notify_product_updates: prefs.productUpdates,
      notify_workflow_alerts: prefs.workflowAlerts,
      notify_team_activity: prefs.teamActivity,
    })
    .eq("id", userId);
  if (error) {
    throw new Error(
      `user_profiles.updateNotificationPreferences failed: ${error.message}`,
    );
  }
}

/**
 * Read the caller's OWN default builder view (BUILDER-VIEW-DEFAULT-1). Session
 * client — `user_profiles_select_own` gates on `auth.uid() = id`. `null`
 * (column default, or absent row) means "no default chosen — ask on a newly
 * created workflow".
 */
export async function getDefaultBuilderView(
  userId: string,
): Promise<DefaultBuilderView> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_profiles")
    .select("default_builder_view")
    .eq("id", userId)
    .maybeSingle<{ default_builder_view: string | null }>();
  if (error) {
    throw new Error(`user_profiles.getDefaultBuilderView failed: ${error.message}`);
  }
  const parsed = DefaultBuilderViewSchema.safeParse(data?.default_builder_view ?? null);
  // Fail-safe: an unexpected stored value (shouldn't happen — CHECK-constrained)
  // reads as "no default" rather than crashing the builder route.
  return parsed.success ? parsed.data : null;
}

/**
 * Set (or clear, with null) the caller's OWN default builder view
 * (BUILDER-VIEW-DEFAULT-1). Session client — `user_profiles_update_own` gates
 * on `auth.uid() = id`, so a caller can only ever write their own row.
 */
export async function updateDefaultBuilderView(
  userId: string,
  view: DefaultBuilderView,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("user_profiles")
    .update({ default_builder_view: view })
    .eq("id", userId);
  if (error) {
    throw new Error(`user_profiles.updateDefaultBuilderView failed: ${error.message}`);
  }
}

export async function getActiveAccountId(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_profiles")
    .select("active_account_id")
    .eq("id", userId)
    .maybeSingle<{ active_account_id: string | null }>();
  if (error) {
    throw new Error(`user_profiles.getActiveAccountId failed: ${error.message}`);
  }
  return data?.active_account_id ?? null;
}

/**
 * Point the caller's active account at `accountId`. Membership of the target is
 * the caller's responsibility (verified in the service layer, e.g. 11d's
 * set-active endpoint) — this write does not check it. No set-active route ships
 * in 11b; this is the primitive that one will use.
 */
export async function setActiveAccountId(
  userId: string,
  accountId: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("user_profiles")
    .update({ active_account_id: accountId })
    .eq("id", userId);
  if (error) {
    throw new Error(`user_profiles.setActiveAccountId failed: ${error.message}`);
  }
}

/**
 * Null the caller's active-account pointer. Used by the resolver to self-heal a
 * stale / non-member / frozen stored pointer back to the personal fallback.
 */
export async function clearActiveAccountId(userId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("user_profiles")
    .update({ active_account_id: null })
    .eq("id", userId);
  if (error) {
    throw new Error(`user_profiles.clearActiveAccountId failed: ${error.message}`);
  }
}

/**
 * Service-role: null an ARBITRARY user's active-account pointer IFF it points at
 * `accountId` (4.ACCOUNT-MODEL-16). Used when removing that user from an account
 * so their active pointer doesn't dangle at an account they no longer belong to.
 * Atomic conditional UPDATE — a no-op when the pointer is something else. (The
 * 11b resolver self-heals a stale pointer anyway; this clears it proactively.)
 */
export async function clearActiveAccountIfMatchesServiceRole(
  userId: string,
  accountId: string,
): Promise<void> {
  const supabase = getServiceRoleClient(
    `user_profiles: clearActiveAccountIfMatches for user ${userId}`,
  );
  const { error } = await supabase
    .from("user_profiles")
    .update({ active_account_id: null })
    .eq("id", userId)
    .eq("active_account_id", accountId);
  if (error) {
    throw new Error(
      `user_profiles.clearActiveAccountIfMatchesServiceRole failed: ${error.message}`,
    );
  }
}
