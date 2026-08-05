/**
 * DEV-CONNECTION-TRANSPLANT-UTILITY-1 — Phase 4 environment & identity
 * preflight. Every check fails closed with a typed refusal.
 *
 * The environment-target logic is NOT reimplemented here: the CLI injects
 * `resolveDbTarget` / `parseRefFromSupabaseUrl` / the production denylist from
 * the canonical guard (`scripts/lib/env-target.mjs`) via `EnvGuardDeps`, so
 * there is exactly ONE production-detection system in the repo. This module
 * adds only the transplant-specific composition: "destination must resolve to
 * the guarded development target, source must resolve to the explicitly
 * approved production project, and the two must differ".
 */
import { parseTokenEncryptionKey } from "@/core/encryption/tokens";
import {
  TransplantRefusalError,
  type TransplantConfig,
  type TransplantDestinationStore,
  type TransplantSourceReader,
} from "./types";

export interface EnvGuardDeps {
  resolveDbTarget(
    env: Record<string, string | undefined>,
    opts: { expectedTarget: string },
  ): { ok: boolean; target: string | null; ref: string | null; reason: string };
  parseRefFromSupabaseUrl(url: string | undefined): string | null;
  /** The canonical hardcoded production ref (env-target.mjs PRODUCTION_PROJECT_REF). */
  productionRef: string;
  /** The canonical denylist (env-target.mjs PROTECTED_REFS). */
  protectedRefs: Record<string, string>;
}

export interface EnvPreflightResult {
  devRef: string;
  devUrl: string;
  devServiceRoleKey: string;
  sourceRef: string;
  sourceUrl: string;
  sourceServiceRoleKey: string;
  /** Parsed 32-byte keys — held in memory only, never logged or re-serialized. */
  sourceEncryptionKey: Buffer;
  destEncryptionKey: Buffer;
}

/** Best-effort `ref` claim from a legacy JWT-shaped Supabase key. */
export function decodeJwtRefClaim(key: string): string | null {
  const parts = key.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    ) as { ref?: unknown };
    return typeof payload.ref === "string" ? payload.ref : null;
  } catch {
    return null;
  }
}

/**
 * Stage 1 — pure environment identity. No network, no client construction,
 * no decryption. Must pass before ANY database client exists.
 */
export function runEnvPreflight(
  guard: EnvGuardDeps,
  config: TransplantConfig,
  env: Record<string, string | undefined>,
): EnvPreflightResult {
  // 1. Destination resolves through the canonical development guard
  //    (requires CHAINREACT_DB_TARGET=development + SUPABASE_DEV_PROJECT_REF,
  //    denies every protected/production ref, cross-checks SUPABASE_DEV_URL).
  const dest = guard.resolveDbTarget(env, { expectedTarget: "development" });
  if (!dest.ok || !dest.ref) {
    throw new TransplantRefusalError("destination_target_guard_failed", dest.reason);
  }
  const devRef = dest.ref;

  if (devRef !== config.destProjectRef) {
    throw new TransplantRefusalError(
      "destination_target_guard_failed",
      `resolved development ref does not match config.destProjectRef — the two declarations must agree.`,
    );
  }
  // Belt-and-braces on top of resolveDbTarget's own denylist.
  if (devRef === guard.productionRef || guard.protectedRefs[devRef]) {
    throw new TransplantRefusalError(
      "destination_resolves_to_production",
      `destination ref is a protected/production project; refusing.`,
    );
  }

  const devUrl = env.SUPABASE_DEV_URL;
  const devServiceRoleKey = env.SUPABASE_DEV_SERVICE_ROLE_KEY;
  if (!devUrl || !devServiceRoleKey) {
    throw new TransplantRefusalError(
      "destination_key_probe_failed",
      "SUPABASE_DEV_URL and SUPABASE_DEV_SERVICE_ROLE_KEY must both be set.",
    );
  }
  const devKeyRef = decodeJwtRefClaim(devServiceRoleKey);
  if (devKeyRef !== null && devKeyRef !== devRef) {
    throw new TransplantRefusalError(
      "destination_key_probe_failed",
      "destination service-role key belongs to a different project than the development ref.",
    );
  }

  // 2. Source identity: explicitly approved production project ONLY.
  const sourceUrl = env.TRANSPLANT_SOURCE_SUPABASE_URL;
  const sourceRef = guard.parseRefFromSupabaseUrl(sourceUrl);
  if (!sourceUrl || !sourceRef) {
    throw new TransplantRefusalError(
      "source_url_unparseable",
      "TRANSPLANT_SOURCE_SUPABASE_URL is missing or not a https://<ref>.supabase.co URL.",
    );
  }
  if (sourceRef === devRef) {
    throw new TransplantRefusalError(
      "source_and_destination_refs_equal",
      "source and destination resolve to the SAME project; refusing.",
    );
  }
  if (sourceRef !== config.sourceProjectRef || sourceRef !== guard.productionRef) {
    throw new TransplantRefusalError(
      "source_ref_not_approved_production",
      "source must be BOTH config.sourceProjectRef AND the canonical production ref (env-target.mjs); anything else is refused.",
    );
  }

  const sourceServiceRoleKey = env.TRANSPLANT_SOURCE_SERVICE_ROLE_KEY;
  if (!sourceServiceRoleKey) {
    throw new TransplantRefusalError(
      "source_key_probe_failed",
      "TRANSPLANT_SOURCE_SERVICE_ROLE_KEY is not set.",
    );
  }
  const srcKeyRef = decodeJwtRefClaim(sourceServiceRoleKey);
  if (srcKeyRef !== null && srcKeyRef !== sourceRef) {
    throw new TransplantRefusalError(
      "source_key_probe_failed",
      "source service-role key belongs to a different project than the approved source ref.",
    );
  }

  // 3. Encryption keys: both present, both valid, and DIFFERENT (the dev
  //    project is documented to have its own fresh TOKEN_ENCRYPTION_KEY —
  //    identical keys almost certainly mean both vars point at production).
  const rawSourceKey = env.TRANSPLANT_SOURCE_TOKEN_ENCRYPTION_KEY;
  if (!rawSourceKey) {
    throw new TransplantRefusalError(
      "source_encryption_key_missing",
      "TRANSPLANT_SOURCE_TOKEN_ENCRYPTION_KEY is not set.",
    );
  }
  const rawDestKey = env.TRANSPLANT_DEST_TOKEN_ENCRYPTION_KEY;
  if (!rawDestKey) {
    throw new TransplantRefusalError(
      "destination_encryption_key_missing",
      "TRANSPLANT_DEST_TOKEN_ENCRYPTION_KEY is not set.",
    );
  }
  let sourceEncryptionKey: Buffer;
  let destEncryptionKey: Buffer;
  try {
    sourceEncryptionKey = parseTokenEncryptionKey(
      rawSourceKey,
      "TRANSPLANT_SOURCE_TOKEN_ENCRYPTION_KEY",
    );
  } catch (err) {
    throw new TransplantRefusalError("source_encryption_key_missing", (err as Error).message);
  }
  try {
    destEncryptionKey = parseTokenEncryptionKey(
      rawDestKey,
      "TRANSPLANT_DEST_TOKEN_ENCRYPTION_KEY",
    );
  } catch (err) {
    throw new TransplantRefusalError(
      "destination_encryption_key_missing",
      (err as Error).message,
    );
  }
  if (sourceEncryptionKey.equals(destEncryptionKey)) {
    throw new TransplantRefusalError(
      "encryption_keys_identical",
      "source and destination TOKEN_ENCRYPTION_KEYs are identical — refusing (misconfiguration: dev must have its own key).",
    );
  }

  return {
    devRef,
    devUrl,
    devServiceRoleKey,
    sourceRef,
    sourceUrl,
    sourceServiceRoleKey,
    sourceEncryptionKey,
    destEncryptionKey,
  };
}

/**
 * Stage 3 — identity checks that need database reads. The successful reads
 * double as the "service-role key corresponds to its project" probes (the URL
 * ref was verified in stage 1; a key for a different project cannot
 * authenticate a read there).
 */
export async function runDataPreflight(
  stores: { source: TransplantSourceReader; dest: TransplantDestinationStore },
  config: TransplantConfig,
): Promise<void> {
  let sourceAccount: { id: string } | null;
  try {
    sourceAccount = await stores.source.getAccountById(config.sourceAccountId);
  } catch (err) {
    throw new TransplantRefusalError(
      "source_key_probe_failed",
      `source read probe failed: ${(err as Error).message}`,
    );
  }
  if (!sourceAccount) {
    throw new TransplantRefusalError(
      "source_account_not_found",
      "source account does not exist in the source project.",
    );
  }

  let destAccount: { id: string; deletionStatus: string } | null;
  try {
    destAccount = await stores.dest.getAccountById(config.destAccountId);
  } catch (err) {
    throw new TransplantRefusalError(
      "destination_key_probe_failed",
      `destination read probe failed: ${(err as Error).message}`,
    );
  }
  if (!destAccount) {
    throw new TransplantRefusalError(
      "destination_account_not_found",
      "destination account does not exist in the development project.",
    );
  }
  if (destAccount.deletionStatus !== "active") {
    throw new TransplantRefusalError(
      "destination_account_not_active",
      `destination account deletion_status is '${destAccount.deletionStatus}'.`,
    );
  }

  const role = await stores.dest.getMembershipRole(
    config.destAccountId,
    config.destConnectedByUserId,
  );
  if (role === null) {
    throw new TransplantRefusalError(
      "destination_user_not_member",
      "destination user has no membership in the destination account.",
    );
  }
  if (role !== "owner" && role !== "admin") {
    throw new TransplantRefusalError(
      "destination_user_role_insufficient",
      `destination user role '${role}' is not owner/admin.`,
    );
  }
}
