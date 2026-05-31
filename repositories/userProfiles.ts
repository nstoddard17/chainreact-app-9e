import { createClient } from "@/utils/supabase/server";

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
