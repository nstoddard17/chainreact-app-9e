import { getServiceRoleClient } from "./supabase/serviceRoleClient";

/**
 * Repository for `account_invitations` (4.ACCOUNT-MODEL-15).
 *
 * Token-based team invites. The raw token is NEVER persisted — only its SHA-256
 * hash (`token_hash`); the service hashes before calling here. All writes are
 * service-role (the invitation flow runs server-side). Reads here are also
 * service-role; owners/admins read the pending list through RLS
 * (`account_invitations_select_owner_admin`) from the route layer.
 */

export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked";
export type InvitationRole = "admin" | "member";

export interface AccountInvitationRecord {
  id: string;
  accountId: string;
  email: string;
  role: InvitationRole;
  status: InvitationStatus;
  invitedByUserId: string | null;
  expiresAt: string;
  acceptedByUserId: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface AccountInvitationsRow {
  id: string;
  account_id: string;
  email: string;
  role: InvitationRole;
  status: InvitationStatus;
  invited_by_user_id: string | null;
  expires_at: string;
  accepted_by_user_id: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

function rowToRecord(row: AccountInvitationsRow): AccountInvitationRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    email: row.email,
    role: row.role,
    status: row.status,
    invitedByUserId: row.invited_by_user_id,
    expiresAt: row.expires_at,
    acceptedByUserId: row.accepted_by_user_id,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}

/** A duplicate-pending insert maps to this stable error code (unique index). */
export const DUPLICATE_PENDING_INVITE = "DUPLICATE_PENDING_INVITE" as const;

/** Insert a pending invite. Throws `DUPLICATE_PENDING_INVITE` on the partial-unique clash. */
export async function insertPending(input: {
  accountId: string;
  email: string;
  role: InvitationRole;
  tokenHash: string;
  invitedByUserId: string | null;
  expiresAt: string;
}): Promise<AccountInvitationRecord> {
  const supabase = getServiceRoleClient(
    `account_invitations: insertPending for account ${input.accountId}`,
  );
  const { data, error } = await supabase
    .from("account_invitations")
    .insert({
      account_id: input.accountId,
      email: input.email,
      role: input.role,
      token_hash: input.tokenHash,
      invited_by_user_id: input.invitedByUserId,
      expires_at: input.expiresAt,
    })
    .select()
    .single<AccountInvitationsRow>();
  if (error || !data) {
    // 23505 = unique_violation → an existing pending invite for this email.
    if (error?.code === "23505") {
      throw new Error(DUPLICATE_PENDING_INVITE);
    }
    throw new Error(
      `account_invitations.insertPending failed: ${error?.message ?? "no row"}`,
    );
  }
  return rowToRecord(data);
}

export async function getByTokenHashServiceRole(
  tokenHash: string,
): Promise<AccountInvitationRecord | null> {
  const supabase = getServiceRoleClient(
    `account_invitations: getByTokenHash`,
  );
  const { data, error } = await supabase
    .from("account_invitations")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle<AccountInvitationsRow>();
  if (error) {
    throw new Error(`account_invitations.getByTokenHashServiceRole failed: ${error.message}`);
  }
  return data ? rowToRecord(data) : null;
}

export async function getByIdServiceRole(
  invitationId: string,
): Promise<AccountInvitationRecord | null> {
  const supabase = getServiceRoleClient(
    `account_invitations: getById ${invitationId}`,
  );
  const { data, error } = await supabase
    .from("account_invitations")
    .select("*")
    .eq("id", invitationId)
    .maybeSingle<AccountInvitationsRow>();
  if (error) {
    throw new Error(`account_invitations.getByIdServiceRole failed: ${error.message}`);
  }
  return data ? rowToRecord(data) : null;
}

export async function listPendingForAccountServiceRole(
  accountId: string,
): Promise<readonly AccountInvitationRecord[]> {
  const supabase = getServiceRoleClient(
    `account_invitations: listPending for account ${accountId}`,
  );
  const { data, error } = await supabase
    .from("account_invitations")
    .select("*")
    .eq("account_id", accountId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(`account_invitations.listPendingForAccountServiceRole failed: ${error.message}`);
  }
  return (data ?? []).map((r) => rowToRecord(r as AccountInvitationsRow));
}

/**
 * Service-role count of an account's PENDING invites (4.ACCOUNT-MODEL-20). Cheap
 * head/exact count for the Team member-limit guard (pending invites count toward
 * the cap; accepted/expired/revoked do not).
 */
export async function countPendingForAccountServiceRole(
  accountId: string,
): Promise<number> {
  const supabase = getServiceRoleClient(
    `account_invitations: countPending for account ${accountId}`,
  );
  const { count, error } = await supabase
    .from("account_invitations")
    .select("*", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("status", "pending");
  if (error) {
    throw new Error(`account_invitations.countPendingForAccountServiceRole failed: ${error.message}`);
  }
  return count ?? 0;
}

/**
 * Count invitations CREATED for the account since `sinceIso`, ANY status
 * (TEAM-INVITATION-EMAIL-1). Input to the durable invitation-send throttle:
 * every create attempts an outbound email, so revoked/expired/accepted rows
 * inside the window still represent a consumed send. Durable across serverless
 * instances because the invitation rows themselves are the counter.
 */
export async function countCreatedSinceForAccountServiceRole(
  accountId: string,
  sinceIso: string,
): Promise<number> {
  const supabase = getServiceRoleClient(
    `account_invitations: countCreatedSince for account ${accountId}`,
  );
  const { count, error } = await supabase
    .from("account_invitations")
    .select("*", { count: "exact", head: true })
    .eq("account_id", accountId)
    .gte("created_at", sinceIso);
  if (error) {
    throw new Error(
      `account_invitations.countCreatedSinceForAccountServiceRole failed: ${error.message}`,
    );
  }
  return count ?? 0;
}

/** Per-inviter companion to `countCreatedSinceForAccountServiceRole` (spans accounts). */
export async function countCreatedSinceByInviterServiceRole(
  inviterUserId: string,
  sinceIso: string,
): Promise<number> {
  const supabase = getServiceRoleClient(
    `account_invitations: countCreatedSince by inviter`,
  );
  const { count, error } = await supabase
    .from("account_invitations")
    .select("*", { count: "exact", head: true })
    .eq("invited_by_user_id", inviterUserId)
    .gte("created_at", sinceIso);
  if (error) {
    throw new Error(
      `account_invitations.countCreatedSinceByInviterServiceRole failed: ${error.message}`,
    );
  }
  return count ?? 0;
}

export async function markAcceptedServiceRole(
  invitationId: string,
  acceptedByUserId: string,
  acceptedAt: string,
): Promise<void> {
  const supabase = getServiceRoleClient(
    `account_invitations: markAccepted ${invitationId}`,
  );
  const { error } = await supabase
    .from("account_invitations")
    .update({ status: "accepted", accepted_by_user_id: acceptedByUserId, accepted_at: acceptedAt })
    .eq("id", invitationId)
    .eq("status", "pending");
  if (error) {
    throw new Error(`account_invitations.markAcceptedServiceRole failed: ${error.message}`);
  }
}

export async function markRevokedServiceRole(
  invitationId: string,
  revokedAt: string,
): Promise<void> {
  const supabase = getServiceRoleClient(
    `account_invitations: markRevoked ${invitationId}`,
  );
  const { error } = await supabase
    .from("account_invitations")
    .update({ status: "revoked", revoked_at: revokedAt })
    .eq("id", invitationId)
    .eq("status", "pending");
  if (error) {
    throw new Error(`account_invitations.markRevokedServiceRole failed: ${error.message}`);
  }
}

export async function markExpiredServiceRole(invitationId: string): Promise<void> {
  const supabase = getServiceRoleClient(
    `account_invitations: markExpired ${invitationId}`,
  );
  const { error } = await supabase
    .from("account_invitations")
    .update({ status: "expired" })
    .eq("id", invitationId)
    .eq("status", "pending");
  if (error) {
    throw new Error(`account_invitations.markExpiredServiceRole failed: ${error.message}`);
  }
}
