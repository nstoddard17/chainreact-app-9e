import { getServiceRoleClient } from "./supabase/serviceRoleClient";

/**
 * Repository for `account_api_keys` (Slice 4.API-KEYS-FOUNDATION-2 / FK-1).
 *
 * Service-role only. There is NO `authenticated` GRANT on the table (the verify
 * material `key_hash` must never be client-readable), so ALL reads flow through
 * here and return one of two shapes:
 *
 *   - `ApiKeyMetadata` — the CLIENT-FACING DTO. Structurally OMITS `key_hash`; this
 *     is what management routes (FK-2) and the UI (FK-3) ever see.
 *   - `ApiKeyVerificationRecord` — SERVICE-SIDE ONLY. Includes `keyHash` for the
 *     future bearer-auth guard (FK-4). Never returned to a client.
 *
 * FK-1 ships only the data layer + these helpers; no caller is wired yet, so this
 * repository changes no runtime behavior. The raw key is NEVER stored here — callers
 * (FK-2) generate it via core/apiKeys and pass `prefix` + `keyHash`.
 */

export type ApiKeyStatus = "active" | "revoked" | "expired";

/** Client-facing metadata — NEVER includes `key_hash` or the raw key. */
export interface ApiKeyMetadata {
  id: string;
  accountId: string;
  createdByUserId: string | null;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** Service-side verification record — includes `keyHash`. NEVER sent to a client. */
export interface ApiKeyVerificationRecord {
  id: string;
  accountId: string;
  /** Non-secret display prefix — safe to snapshot onto run history (RH-2). */
  prefix: string;
  keyHash: string;
  scopes: string[];
  expiresAt: string | null;
  revokedAt: string | null;
}

interface AccountApiKeysRow {
  id: string;
  account_id: string;
  created_by_user_id: string | null;
  name: string;
  prefix: string;
  key_hash: string;
  scopes: string[] | null;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Client-facing projection — drops `key_hash` (and `updated_at`). */
function rowToMetadata(row: AccountApiKeysRow): ApiKeyMetadata {
  return {
    id: row.id,
    accountId: row.account_id,
    createdByUserId: row.created_by_user_id,
    name: row.name,
    prefix: row.prefix,
    scopes: row.scopes ?? [],
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}

/** Service-side projection — keeps `key_hash` for verification (FK-4). */
function rowToVerification(row: AccountApiKeysRow): ApiKeyVerificationRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    prefix: row.prefix,
    keyHash: row.key_hash,
    scopes: row.scopes ?? [],
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

/** Columns selected for the client-facing DTO — `key_hash` is deliberately absent. */
const METADATA_COLUMNS =
  "id, account_id, created_by_user_id, name, prefix, scopes, last_used_at, expires_at, revoked_at, created_at";

export interface CreateApiKeyInput {
  accountId: string;
  createdByUserId: string | null;
  name: string;
  prefix: string;
  keyHash: string;
  scopes: string[];
  expiresAt?: string | null;
}

/**
 * Insert a new key row from a caller-generated `prefix` + `keyHash` (the raw key is
 * never passed here). Returns the client-facing metadata DTO — NOT the hash. The
 * caller (FK-2) is responsible for revealing the raw key it generated, exactly once.
 */
export async function createApiKeyMetadataServiceRole(
  input: CreateApiKeyInput,
): Promise<ApiKeyMetadata> {
  const supabase = getServiceRoleClient(
    `account_api_keys: create ${input.accountId}/${input.prefix}`,
  );
  const { data, error } = await supabase
    .from("account_api_keys")
    .insert({
      account_id: input.accountId,
      created_by_user_id: input.createdByUserId,
      name: input.name,
      prefix: input.prefix,
      key_hash: input.keyHash,
      scopes: input.scopes,
      expires_at: input.expiresAt ?? null,
    })
    .select(METADATA_COLUMNS)
    .single<AccountApiKeysRow>();
  if (error || !data) {
    throw new Error(
      `account_api_keys.createApiKeyMetadataServiceRole failed: ${error?.message ?? "no row"}`,
    );
  }
  return rowToMetadata(data);
}

/** All keys for an account (any status), newest first — metadata only (no hash). */
export async function listApiKeyMetadataByAccountServiceRole(
  accountId: string,
): Promise<readonly ApiKeyMetadata[]> {
  const supabase = getServiceRoleClient(`account_api_keys: listByAccount ${accountId}`);
  const { data, error } = await supabase
    .from("account_api_keys")
    .select(METADATA_COLUMNS)
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(
      `account_api_keys.listApiKeyMetadataByAccountServiceRole failed: ${error.message}`,
    );
  }
  return (data ?? []).map((r) => rowToMetadata(r as AccountApiKeysRow));
}

/**
 * Fetch a single key's metadata scoped to its account (FK-2 revoke existence
 * check). Account-scoped so a key id from another account resolves to null — the
 * caller maps that to a 404 with no cross-account existence leak. Metadata only
 * (no `key_hash`).
 */
export async function getApiKeyMetadataByIdServiceRole(
  accountId: string,
  keyId: string,
): Promise<ApiKeyMetadata | null> {
  const supabase = getServiceRoleClient(`account_api_keys: getById ${accountId}/${keyId}`);
  const { data, error } = await supabase
    .from("account_api_keys")
    .select(METADATA_COLUMNS)
    .eq("id", keyId)
    .eq("account_id", accountId)
    .maybeSingle<AccountApiKeysRow>();
  if (error) {
    throw new Error(`account_api_keys.getApiKeyMetadataByIdServiceRole failed: ${error.message}`);
  }
  return data ? rowToMetadata(data) : null;
}

/**
 * Primary verification lookup (FK-4): exact match on the UNIQUE `key_hash`, O(1).
 * Returns the service-side record (incl. status fields) regardless of
 * revoked/expired state, so the caller can DISTINGUISH and reject precisely.
 */
export async function findApiKeyByHashServiceRole(
  keyHash: string,
): Promise<ApiKeyVerificationRecord | null> {
  const supabase = getServiceRoleClient("account_api_keys: findByHash");
  const { data, error } = await supabase
    .from("account_api_keys")
    .select("id, account_id, prefix, key_hash, scopes, expires_at, revoked_at")
    .eq("key_hash", keyHash)
    .maybeSingle<AccountApiKeysRow>();
  if (error) {
    throw new Error(`account_api_keys.findApiKeyByHashServiceRole failed: ${error.message}`);
  }
  return data ? rowToVerification(data) : null;
}

/**
 * Secondary verification lookup by the non-secret `prefix` (FK-4 alternative path).
 * Returns NON-revoked candidates incl. hash; the caller confirms with a constant-
 * time hash compare. Prefer `findApiKeyByHashServiceRole` (exact + unique).
 */
export async function getApiKeyForVerificationByPrefixServiceRole(
  prefix: string,
): Promise<readonly ApiKeyVerificationRecord[]> {
  const supabase = getServiceRoleClient("account_api_keys: getByPrefix");
  const { data, error } = await supabase
    .from("account_api_keys")
    .select("id, account_id, prefix, key_hash, scopes, expires_at, revoked_at")
    .eq("prefix", prefix)
    .is("revoked_at", null);
  if (error) {
    throw new Error(
      `account_api_keys.getApiKeyForVerificationByPrefixServiceRole failed: ${error.message}`,
    );
  }
  return (data ?? []).map((r) => rowToVerification(r as AccountApiKeysRow));
}

/**
 * Soft revoke (FK-2): set `revoked_at = now()` if not already revoked. Scoped to
 * the account so a key id from another account can never be revoked. Idempotent —
 * returns true if a row was newly revoked, false if it was already revoked / absent.
 */
export async function revokeApiKeyServiceRole(input: {
  accountId: string;
  keyId: string;
  now?: string;
}): Promise<{ revoked: boolean }> {
  const supabase = getServiceRoleClient(
    `account_api_keys: revoke ${input.accountId}/${input.keyId}`,
  );
  const { data, error } = await supabase
    .from("account_api_keys")
    .update({ revoked_at: input.now ?? new Date().toISOString() })
    .eq("id", input.keyId)
    .eq("account_id", input.accountId)
    .is("revoked_at", null)
    .select("id");
  if (error) {
    throw new Error(`account_api_keys.revokeApiKeyServiceRole failed: ${error.message}`);
  }
  return { revoked: (data ?? []).length > 0 };
}

/**
 * Best-effort `last_used_at` bump (FK-4). Throttled: only writes when the stored
 * value is null or older than 60s, so a hot key does not write per request. Callers
 * must NOT await this in the request path and should swallow errors — it can never
 * delay or fail a trigger.
 */
export async function touchLastUsedServiceRole(input: {
  keyId: string;
  now?: string;
}): Promise<void> {
  const supabase = getServiceRoleClient(`account_api_keys: touchLastUsed ${input.keyId}`);
  const now = input.now ?? new Date().toISOString();
  const cutoff = new Date(new Date(now).getTime() - 60_000).toISOString();
  const { error } = await supabase
    .from("account_api_keys")
    .update({ last_used_at: now })
    .eq("id", input.keyId)
    .or(`last_used_at.is.null,last_used_at.lt.${cutoff}`);
  if (error) {
    throw new Error(`account_api_keys.touchLastUsedServiceRole failed: ${error.message}`);
  }
}
