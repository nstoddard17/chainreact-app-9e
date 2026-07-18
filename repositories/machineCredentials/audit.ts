import { getServiceRoleClient } from "../supabase/serviceRoleClient";

/**
 * Repository for `machine_credential_audit` — the append-only lifecycle /
 * token-mint audit trail for machine (client_credentials + mTLS) credentials.
 * Service-role only; rows carry NO secret material (the caller guarantees
 * `detail` is non-secret).
 */

export type MachineCredentialAuditEvent =
  | "created"
  | "rotated"
  | "disconnected"
  | "mint_succeeded"
  | "mint_failed"
  | "validation_failed";

export interface MachineCredentialAuditRecord {
  id: string;
  accountId: string;
  credentialId: string | null;
  provider: string;
  actorUserId: string | null;
  event: MachineCredentialAuditEvent;
  detail: Readonly<Record<string, unknown>>;
  createdAt: string;
}

interface MachineCredentialAuditRow {
  id: string;
  account_id: string;
  credential_id: string | null;
  provider: string;
  actor_user_id: string | null;
  event: MachineCredentialAuditEvent;
  detail: Record<string, unknown>;
  created_at: string;
}

/**
 * Append an audit event. The CALLER guarantees `detail` carries NO secret
 * material (only fingerprints, cert expiry, redacted error codes, environment).
 * Callers wrap in try/catch so an audit-write failure never masks the primary op.
 */
export async function recordMachineCredentialAudit(input: {
  accountId: string;
  credentialId: string | null;
  provider: string;
  actorUserId: string | null;
  event: MachineCredentialAuditEvent;
  detail?: Record<string, unknown>;
}): Promise<void> {
  const supabase = getServiceRoleClient(
    `machine-credentials: audit ${input.event} ${input.provider}`,
  );
  const { error } = await supabase.from("machine_credential_audit").insert({
    account_id: input.accountId,
    credential_id: input.credentialId,
    provider: input.provider,
    actor_user_id: input.actorUserId,
    event: input.event,
    detail: input.detail ?? {},
  });
  if (error) {
    throw new Error(`machine credentials audit insert failed: ${error.message}`);
  }
}

/** List recent audit rows for an account (+ optional provider filter). */
export async function listMachineCredentialAudit(
  accountId: string,
  opts?: { provider?: string; limit?: number },
): Promise<readonly MachineCredentialAuditRecord[]> {
  const supabase = getServiceRoleClient(
    `machine-credentials: listAudit for account ${accountId}`,
  );
  let query = supabase
    .from("machine_credential_audit")
    .select("*")
    .eq("account_id", accountId);
  if (opts?.provider) query = query.eq("provider", opts.provider);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 50);
  if (error) {
    throw new Error(`machine credentials listAudit failed: ${error.message}`);
  }
  return (data ?? []).map((r) => {
    const row = r as MachineCredentialAuditRow;
    return {
      id: row.id,
      accountId: row.account_id,
      credentialId: row.credential_id,
      provider: row.provider,
      actorUserId: row.actor_user_id,
      event: row.event,
      detail: row.detail ?? {},
      createdAt: row.created_at,
    };
  });
}
