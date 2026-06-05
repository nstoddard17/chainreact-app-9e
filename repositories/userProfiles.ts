import { createClient } from "@/utils/supabase/server";
import { getServiceRoleClient } from "./supabase/serviceRoleClient";

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
