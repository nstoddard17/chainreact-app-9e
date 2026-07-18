import { getServiceRoleClient } from "../supabase/serviceRoleClient";

/**
 * Repository for `account_machine_credentials` (the encrypted credential rows).
 *
 * Provider-neutral storage for the machine (client_credentials + mTLS) auth flow
 * (first consumer: ADP). Mirrors `repositories/integrations.ts` discipline:
 *
 *   - Server-side only (lint guard forbids client import).
 *   - Encrypted secret columns are encrypted by the CALLER (the store service,
 *     `services/machineCredentials/store.ts`) BEFORE reaching this layer, and are
 *     returned as-encrypted. This repository never encrypts or decrypts.
 *   - All access is service-role; there is no `authenticated` GRANT on the table
 *     (see the migration) so an encrypted secret can never transit the Data API.
 *   - Every read/write filters `account_id` exactly (cross-account isolation).
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
 * When an active row exists this is a rotation/replacement: secret columns + cert
 * metadata are overwritten, `rotated_at` is stamped, the cached token is cleared
 * (it was minted with the old material), and `connected_by_user_id` is updated to
 * the current actor (account credential — provenance = who last set it).
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

/**
 * Active credentials for an account (Apps listing). Secret columns are present on
 * the record but the caller MUST project to a secret-omitting DTO.
 */
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
 * Persist a freshly-minted short-lived access token (encrypted by the caller) +
 * its expiry. Guarded `disconnected_at IS NULL`. Returns whether a row updated.
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
