import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import type { RpcArgs } from "@/types/rpc";

/**
 * Repository for auth-user lookups that the app can't do through normal tables
 * (4.ACCOUNT-MODEL-15).
 *
 * `auth.users` is not PostgREST-exposed, so email→id resolution goes through the
 * `find_user_id_by_email` SECURITY DEFINER RPC (EXECUTE granted to service_role
 * only — never a client-reachable email-enumeration oracle). Used best-effort to
 * notify an already-registered invitee; the accept flow does NOT need this (it
 * reads the email from the authenticated session).
 */
export async function findUserIdByEmailServiceRole(
  email: string,
): Promise<string | null> {
  const supabase = getServiceRoleClient(`users: findUserIdByEmail`);
  const { data, error } = await supabase.rpc("find_user_id_by_email", {
    p_email: email,
  } satisfies RpcArgs<"find_user_id_by_email">);
  if (error) {
    throw new Error(`users.findUserIdByEmailServiceRole failed: ${error.message}`);
  }
  // The RPC returns the uuid scalar (or null).
  return (data as string | null) ?? null;
}
