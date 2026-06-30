import { createClient } from "@/utils/supabase/server";

/**
 * internal_admins repository (INTERNAL-FEEDBACK-1).
 *
 * Data-access for the ChainReact COMPANY-internal admin allowlist. This is the
 * ONLY place that answers "is this user a ChainReact internal admin?". It is
 * deliberately unrelated to the customer account model — account owner / team
 * admin / org admin roles are NOT consulted here and never satisfy this check.
 *
 * Reads go through the SSR-cookie client, so RLS scopes them to the caller's OWN
 * row (`internal_admins_select_own`). The explicit `eq("user_id", userId)` is
 * belt-and-suspenders on top of that policy. There is no service-role read here:
 * membership is checked for the current caller, not enumerated.
 *
 * SWAP SEAM: if internal-admin identity later moves to roles/capabilities, this
 * function's signature ("is user X an internal admin?") stays the same — only its
 * body changes. The auth gate and every route/page that depend on it are
 * unaffected.
 */
export async function isInternalAdmin(userId: string): Promise<boolean> {
  if (!userId) return false;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("internal_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  // Fail CLOSED: any read error denies access rather than risking a false grant.
  if (error) return false;
  return data !== null;
}
