import { getServiceRoleClient } from "./supabase/serviceRoleClient";

/**
 * Repository for `account_machine_credentials` + `machine_credential_audit`.
 *
 * Provider-neutral storage for the machine (client_credentials + mTLS) auth flow
 * (first consumer: ADP). Mirrors the discipline of `repositories/integrations.ts`
 * and `repositories/accountApiKeys.ts`:
 *
 *   - Server-side only (lint guard forbids client import).
 *   - Encrypted secret columns are encrypted by the CALLER (the machine-credential
 *     store service, `services/machineCredentials/store.ts`) BEFORE they reach this
 *     layer, and are returned as-encrypted. This repository never encrypts or
 *     decrypts.
 *   - All access is service-role. There is no `authenticated` GRANT on either
 *     table (see the migration) — an encrypted secret can never transit the Data
 *     API. Client-facing callers project to a secret-omitting DTO.
 *
 * Account scoping: every read/write filters `account_id` exactly, so a credential
 * belonging to a different account is never visible or mutable across accounts.
 */

export interface MachineCredentialRecord {
  id: string;
  accountId: string;
  connectedByUserId: string | null;
  provider: string;
  label: string | null;
  clientIdEncrypted: string;
  clientSecretEncrypted: string;
  certPemEncrypted: string;
  keyPemEncrypted: string;
  cachedAccessTokenEncrypted: string | null;
  cachedTokenExpiresAt: string | null;
  certFingerprint256: string;
  certSubject: string | null;
  certNotAfter: string;
  metadata: Readonly<Record<string, unknown>>;
  disconnectedAt: string | null;
  rotatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MachineCredentialsRow {
  id: string;
  account_id: string;
  connected_by_user_id: string | null;
  provider: string;
  label: string | null;
  client_id_encrypted: string;
  client_secret_encrypted: string;
  cert_pem_encrypted: string;
  key_pem_encrypted: string;
  cached_access_token_encrypted: string | null;
  cached_token_expires_at: string | null;
  cert_fingerprint256: string;
  cert_subject: string | null;
  cert_not_after: string;
  metadata: Record<string, unknown>;
  disconnected_at: string | null;
  rotated_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRecord(row: MachineCredentialsRow): MachineCredentialRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    connectedByUserId: row.connected_by_user_id,
    provider: row.provider,
    label: row.label,
    clientIdEncrypted: row.client_id_encrypted,
    clientSecretEncrypted: row.client_secret_encrypted,
    certPemEncrypted: row.cert_pem_encrypted,
    keyPemEncrypted: row.key_pem_encrypted,
    cachedAccessTokenEncrypted: row.cached_access_token_encrypted,
    cachedTokenExpiresAt: row.cached_token_expires_at,
    certFingerprint256: row.cert_fingerprint256,
    certSubject: row.cert_subject,
    certNotAfter: row.cert_not_after,
    metadata: row.metadata ?? {},
    disconnectedAt: row.disconnected_at,
    rotatedAt: row.rotated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface UpsertMachineCredentialInput {
  accountId: string;
  connectedByUserId: string | null;
  provider: string;
  label: string | null;
  /** Encrypted by the caller. */
  clientIdEncrypted: string;
  clientSecretEncrypted: string;
  certPemEncrypted: string;
  keyPemEncrypted: string;
  /** Non-secret cert metadata. */
  certFingerprint256: string;
  certSubject: string | null;
  certNotAfter: string;
  /** Non-secret provider config. Must never contain a secret. */
  metadata: Record<string, unknown>;
}

/**
 * Insert a new active credential, or ROTATE the existing active row for
 * (accountId, provider). The partial unique index
 * `account_machine_credentials_active_unique` enforces at-most-one active row.
 *
 * When an active row exists, this is a rotation/replacement: the secret columns +
 * cert metadata are overwritten, `rotated_at` is stamped, the cached token is
 * cleared (the old token was minted with the old credentials), and
 * `connected_by_user_id` is updated to the current actor (this is an account
 * credential — provenance = who last set it, unlike personal-token provenance).
 */
export async function upsertActiveMachineCredential(
  input: UpsertMachineCredentialInput,
  now: string = new Date().toISOString(),
): Promise<MachineCredentialRecord> {
  const supabase = getServiceRoleClient(
    `machine-credentials: upsertActive ${input.provider} for account ${input.accountId}`,
  );

  const { data: existing, error: existingErr } = await supabase
    .from("account_machine_credentials")
    .select("*")
    .eq("account_id", input.accountId)
    .eq("provider", input.provider)
    .is("disconnected_at", null)
    .maybeSingle<MachineCredentialsRow>();
  if (existingErr) {
    throw new Error(`machine credentials lookup failed: ${existingErr.message}`);
  }

  if (existing) {
    const { data, error } = await supabase
      .from("account_machine_credentials")
      .update({
        connected_by_user_id: input.connectedByUserId,
        label: input.label,
        client_id_encrypted: input.clientIdEncrypted,
        client_secret_encrypted: input.clientSecretEncrypted,
        cert_pem_encrypted: input.certPemEncrypted,
        key_pem_encrypted: input.keyPemEncrypted,
        cert_fingerprint256: input.certFingerprint256,
        cert_subject: input.certSubject,
        cert_not_after: input.certNotAfter,
        metadata: input.metadata,
        // Rotation invalidates the cached token minted with the old material.
        cached_access_token_encrypted: null,
        cached_token_expires_at: null,
        rotated_at: now,
      })
      .eq("id", existing.id)
      .select()
      .single<MachineCredentialsRow>();
    if (error || !data) {
      throw new Error(
        `machine credentials rotate failed: ${error?.message ?? "no row returned"}`,
      );
    }
    return rowToRecord(data);
  }

  const { data, error } = await supabase
    .from("account_machine_credentials")
    .insert({
      account_id: input.accountId,
      connected_by_user_id: input.connectedByUserId,
      provider: input.provider,
      label: input.label,
      client_id_encrypted: input.clientIdEncrypted,
      client_secret_encrypted: input.clientSecretEncrypted,
      cert_pem_encrypted: input.certPemEncrypted,
      key_pem_encrypted: input.keyPemEncrypted,
      cert_fingerprint256: input.certFingerprint256,
      cert_subject: input.certSubject,
      cert_not_after: input.certNotAfter,
      metadata: input.metadata,
    })
    .select()
    .single<MachineCredentialsRow>();
  if (error || !data) {
    throw new Error(
      `machine credentials insert failed: ${error?.message ?? "no row returned"}`,
    );
  }
  return rowToRecord(data);
}

/** The active credential for (accountId, provider), or null. */
export async function getActiveMachineCredential(
  accountId: string,
  provider: string,
): Promise<MachineCredentialRecord | null> {
  const supabase = getServiceRoleClient(
    `machine-credentials: getActive ${provider} for account ${accountId}`,
  );
  const { data, error } = await supabase
    .from("account_machine_credentials")
    .select("*")
    .eq("account_id", accountId)
    .eq("provider", provider)
    .is("disconnected_at", null)
    .maybeSingle<MachineCredentialsRow>();
  if (error) {
    throw new Error(`machine credentials getActive failed: ${error.message}`);
  }
  return data ? rowToRecord(data) : null;
}

/** Active credentials for an account (Apps listing). Secret columns are present
 * on the record but the caller MUST project to a secret-omitting DTO. */
export async function listActiveMachineCredentialsByAccount(
  accountId: string,
): Promise<readonly MachineCredentialRecord[]> {
  const supabase = getServiceRoleClient(
    `machine-credentials: listActive for account ${accountId}`,
  );
  const { data, error } = await supabase
    .from("account_machine_credentials")
    .select("*")
    .eq("account_id", accountId)
    .is("disconnected_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`machine credentials list failed: ${error.message}`);
  return (data ?? []).map((r) => rowToRecord(r as MachineCredentialsRow));
}

/**
 * Persist the freshly-minted short-lived access token (encrypted by the caller)
 * and its expiry. Guarded `disconnected_at IS NULL` so a disconnected credential
 * is never re-tokened. Returns whether a row was updated.
 */
export async function updateCachedToken(input: {
  id: string;
  cachedAccessTokenEncrypted: string;
  cachedTokenExpiresAt: string;
}): Promise<{ updated: boolean }> {
  const supabase = getServiceRoleClient(
    `machine-credentials: updateCachedToken ${input.id}`,
  );
  const { data, error } = await supabase
    .from("account_machine_credentials")
    .update({
      cached_access_token_encrypted: input.cachedAccessTokenEncrypted,
      cached_token_expires_at: input.cachedTokenExpiresAt,
    })
    .eq("id", input.id)
    .is("disconnected_at", null)
    .select("id");
  if (error) {
    throw new Error(`machine credentials updateCachedToken failed: ${error.message}`);
  }
  return { updated: (data ?? []).length > 0 };
}

/**
 * Soft-disconnect a credential (account-scoped). Clears the cached token as
 * defense-in-depth. Idempotent via the `disconnected_at IS NULL` guard.
 */
export async function disconnectMachineCredential(input: {
  accountId: string;
  id: string;
  now?: string;
}): Promise<{ disconnected: boolean }> {
  const supabase = getServiceRoleClient(
    `machine-credentials: disconnect ${input.id}`,
  );
  const { data, error } = await supabase
    .from("account_machine_credentials")
    .update({
      disconnected_at: input.now ?? new Date().toISOString(),
      cached_access_token_encrypted: null,
      cached_token_expires_at: null,
    })
    .eq("id", input.id)
    .eq("account_id", input.accountId)
    .is("disconnected_at", null)
    .select("id");
  if (error) {
    throw new Error(`machine credentials disconnect failed: ${error.message}`);
  }
  return { disconnected: (data ?? []).length > 0 };
}

// ── Audit ────────────────────────────────────────────────────────────────────

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
 * Best-effort by convention — callers wrap in try/catch so an audit-write failure
 * never masks the primary operation's result.
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
