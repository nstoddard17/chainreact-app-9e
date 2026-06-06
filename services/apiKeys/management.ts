import { generateApiKey } from "@/core/apiKeys/keys";
import { validateApiKeyScopes } from "@/core/apiKeys/scopes";
import { isAccountFrozen } from "@/services/accounts/accountFreeze";
import * as apiKeysRepo from "@/repositories/accountApiKeys";
import type { ApiKeyMetadata } from "@/repositories/accountApiKeys";

/**
 * API-key management service (Slice 4.API-KEYS-FOUNDATION-3 / FK-2).
 *
 * The fine-grained business logic behind the owner/admin-gated management routes
 * (the route layer owns the coarse `requireAccountRole(["owner","admin"])` gate and
 * maps these results to HTTP). Reads + writes go through the FK-1 service-role repo
 * (`account_api_keys` grants `authenticated` nothing); the RAW key is generated
 * here, returned EXACTLY ONCE by `createApiKey`, and never stored or logged.
 *
 * No OAuth/integration token is ever read. Audit notifications are DEFERRED (they
 * need a `notification_type` enum migration — out of scope for FK-2); create/revoke
 * emit structured ops logs instead (no secrets), so there is an audit trail without
 * a migration. The routes never block on logging.
 */

/** Max length for a key's human label. Mirrors the display-name cap convention. */
export const MAX_API_KEY_NAME_LENGTH = 80;

export type ApiKeyStatus = "active" | "revoked" | "expired";

/** Client-facing key metadata + a derived status (never includes `key_hash`). */
export interface ApiKeyMetadataWithStatus extends ApiKeyMetadata {
  status: ApiKeyStatus;
}

function deriveStatus(key: ApiKeyMetadata, nowMs: number): ApiKeyStatus {
  if (key.revokedAt) return "revoked";
  if (key.expiresAt && new Date(key.expiresAt).getTime() <= nowMs) return "expired";
  return "active";
}

function withStatus(key: ApiKeyMetadata): ApiKeyMetadataWithStatus {
  return { ...key, status: deriveStatus(key, Date.now()) };
}

/** List an account's keys (metadata only, newest first), each with a derived status. */
export async function listApiKeys(input: {
  accountId: string;
}): Promise<ApiKeyMetadataWithStatus[]> {
  const rows = await apiKeysRepo.listApiKeyMetadataByAccountServiceRole(input.accountId);
  return rows.map(withStatus);
}

export type CreateApiKeyReason =
  | "invalid_name"
  | "invalid_scopes"
  | "scope_not_enabled"
  | "invalid_expiry"
  | "account_frozen";

export type CreateApiKeyResult =
  | { ok: true; key: ApiKeyMetadataWithStatus; rawKey: string }
  | { ok: false; reason: CreateApiKeyReason };

/**
 * Mint a new key. Validates name + scopes (launch-enabled only) + optional
 * future expiry, refuses on a frozen account, generates a high-entropy `live` key
 * via the FK-1 helper, stores ONLY its hash + prefix, and returns the raw key
 * ONCE. The caller (route) reveals `rawKey` to the owner/admin exactly once; it is
 * never persisted, returned again, or logged.
 */
export async function createApiKey(input: {
  accountId: string;
  createdByUserId: string;
  name: string;
  scopes: string[];
  expiresAt?: string | null;
}): Promise<CreateApiKeyResult> {
  const name = (input.name ?? "").trim();
  if (name.length === 0 || name.length > MAX_API_KEY_NAME_LENGTH) {
    return { ok: false, reason: "invalid_name" };
  }

  const scopeCheck = validateApiKeyScopes(input.scopes);
  if (!scopeCheck.ok) {
    return {
      ok: false,
      reason: scopeCheck.reason === "scope_not_enabled" ? "scope_not_enabled" : "invalid_scopes",
    };
  }

  let expiresAt: string | null = null;
  if (input.expiresAt != null) {
    const t = new Date(input.expiresAt).getTime();
    if (Number.isNaN(t) || t <= Date.now()) return { ok: false, reason: "invalid_expiry" };
    expiresAt = new Date(t).toISOString();
  }

  if (await isAccountFrozen(input.accountId)) return { ok: false, reason: "account_frozen" };

  // The caller never supplies prefix/hash/createdBy/revokedAt/lastUsedAt — they are
  // derived here / by the DB, so a client can't forge any of them.
  const generated = generateApiKey("live");
  const meta = await apiKeysRepo.createApiKeyMetadataServiceRole({
    accountId: input.accountId,
    createdByUserId: input.createdByUserId,
    name,
    prefix: generated.prefix,
    keyHash: generated.keyHash,
    scopes: scopeCheck.scopes,
    expiresAt,
  });

  // Structured ops log — prefix + ids only, NEVER the raw key or hash.
  console.info(
    JSON.stringify({
      event: "api_key.created",
      accountId: input.accountId,
      keyId: meta.id,
      prefix: meta.prefix,
      actorUserId: input.createdByUserId,
      scopes: meta.scopes,
    }),
  );

  return { ok: true, key: withStatus(meta), rawKey: generated.raw };
}

export type RevokeApiKeyReason = "not_found" | "account_frozen";

export type RevokeApiKeyResult =
  | { ok: true; alreadyRevoked: boolean }
  | { ok: false; reason: RevokeApiKeyReason };

/**
 * Soft-revoke a key, account-scoped + idempotent. A key id that does NOT belong to
 * the account resolves to `not_found` (a 404 the route returns identically whether
 * the key is cross-account or nonexistent — no existence leak). An already-revoked
 * key in the account returns `alreadyRevoked: true` (idempotent success). Refuses
 * on a frozen account.
 */
export async function revokeApiKey(input: {
  accountId: string;
  keyId: string;
}): Promise<RevokeApiKeyResult> {
  if (await isAccountFrozen(input.accountId)) return { ok: false, reason: "account_frozen" };

  const { revoked } = await apiKeysRepo.revokeApiKeyServiceRole({
    accountId: input.accountId,
    keyId: input.keyId,
  });
  if (revoked) {
    console.info(
      JSON.stringify({
        event: "api_key.revoked",
        accountId: input.accountId,
        keyId: input.keyId,
      }),
    );
    return { ok: true, alreadyRevoked: false };
  }

  // Not newly revoked → distinguish "already revoked in this account" (idempotent)
  // from "not in this account" (404, no cross-account existence leak).
  const existing = await apiKeysRepo.getApiKeyMetadataByIdServiceRole(
    input.accountId,
    input.keyId,
  );
  if (existing) return { ok: true, alreadyRevoked: true };
  return { ok: false, reason: "not_found" };
}
