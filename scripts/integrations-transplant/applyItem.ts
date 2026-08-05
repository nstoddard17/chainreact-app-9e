/**
 * DEV-CONNECTION-TRANSPLANT-UTILITY-1 — the per-integration apply step
 * (Phase 12 steps 2–9). Split from orchestrator.ts for file-size hygiene;
 * see that module for the overall sequence.
 *
 * Plaintext credentials exist ONLY inside `applyOne`'s local scope. Every
 * sensitive value observed (plaintexts, both ciphertexts, probe identities)
 * is appended to the caller's `sensitive` scan-list so the final report can
 * be proven leak-free before serialization.
 */
import type {
  DestIntegrationRecord,
  DestRowSnapshot,
  OrchestratorDeps,
  TransplantConfig,
  TransplantItemReason,
  TransplantItemStatus,
} from "./types";
import { isExpired, type PlanItem } from "./plan";

export interface ApplyOutcome {
  status: TransplantItemStatus;
  reason: TransplantItemReason;
  destinationIntegrationId?: string;
  sourceUnchanged?: boolean;
  /** True aborts the run (fail-fast). */
  failed: boolean;
}

function snapshotOf(rec: DestIntegrationRecord): DestRowSnapshot {
  return {
    display_name: rec.displayName,
    access_token_encrypted: rec.accessTokenEncrypted,
    refresh_token_encrypted: rec.refreshTokenEncrypted,
    access_token_expires_at: rec.accessTokenExpiresAt,
    extra_credentials_encrypted: rec.extraCredentialsEncrypted ?? null,
    scopes: [...rec.scopes],
    account_metadata: { ...rec.accountMetadata },
    needs_reconnect_at: null,
  };
}

export async function applyOne(
  deps: OrchestratorDeps,
  config: TransplantConfig,
  item: PlanItem,
  sensitive: string[],
): Promise<ApplyOutcome> {
  const row = item.row;
  const classification = item.classification;
  if (!classification) {
    // Unreachable: plan refuses unknown providers before apply.
    return { status: "unsupported", reason: "unknown_provider", failed: true };
  }
  sensitive.push(row.access_token_encrypted);
  if (row.refresh_token_encrypted) sensitive.push(row.refresh_token_encrypted);
  if (row.extra_credentials_encrypted) sensitive.push(row.extra_credentials_encrypted);

  // 1. Decrypt with the SOURCE key — plaintext stays inside this function.
  let accessToken: string;
  let refreshToken: string | null = null;
  let extrasJson: string | null = null;
  try {
    accessToken = deps.crypto.decryptSource(row.access_token_encrypted);
    if (row.refresh_token_encrypted) {
      refreshToken = deps.crypto.decryptSource(row.refresh_token_encrypted);
    }
    if (row.extra_credentials_encrypted) {
      extrasJson = deps.crypto.decryptSource(row.extra_credentials_encrypted);
    }
  } catch {
    return { status: "verification_failed", reason: "credential_undecryptable", failed: true };
  }
  sensitive.push(accessToken);
  if (refreshToken) sensitive.push(refreshToken);
  if (extrasJson) sensitive.push(extrasJson);

  let extras: Record<string, string> | null = null;
  if (extrasJson) {
    try {
      extras = JSON.parse(extrasJson) as Record<string, string>;
      for (const v of Object.values(extras)) sensitive.push(v);
    } catch {
      return { status: "verification_failed", reason: "credential_undecryptable", failed: true };
    }
  }

  // 2. Read-only identity probe (skipped when the access token is knowably
  //    expired and a refresh token exists — probing would be a guaranteed 401
  //    and refreshing is out of scope by design).
  const probe = deps.getProbe(row.provider);
  const expired = isExpired(row.access_token_expires_at, deps.now());
  let probeRan = false;
  let identityConfirmed = false;
  if (probe && !(expired && refreshToken)) {
    const result = await probe({
      accessToken,
      extras,
      providerAccountId: row.provider_account_id,
      accountMetadata: row.account_metadata,
    });
    probeRan = true;
    if (result.identity) sensitive.push(result.identity);
    if (!result.ok) {
      if (config.verificationMode === "strict") {
        return {
          status: "verification_failed",
          reason: result.failure === "network" ? "probe_network_error" : "probe_unauthorized",
          failed: true,
        };
      }
    } else if (result.identitySupported) {
      if (
        result.identity === null ||
        result.identity.toLowerCase() !== row.provider_account_id.toLowerCase()
      ) {
        // The credential answers as a DIFFERENT provider account — never write.
        return { status: "verification_failed", reason: "provider_identity_mismatch", failed: true };
      }
      identityConfirmed = true;
    }
  }

  // 3. Re-encrypt under the DESTINATION key. Never reuse source ciphertext.
  const destAccessCt = deps.crypto.encryptDest(accessToken);
  const destRefreshCt = refreshToken ? deps.crypto.encryptDest(refreshToken) : null;
  const destExtrasCt = extrasJson ? deps.crypto.encryptDest(extrasJson) : null;
  sensitive.push(destAccessCt);
  if (destRefreshCt) sensitive.push(destRefreshCt);
  if (destExtrasCt) sensitive.push(destExtrasCt);

  const expiresAtEpoch = row.access_token_expires_at
    ? Math.floor(Date.parse(row.access_token_expires_at) / 1000)
    : null;

  const priorSnapshot = item.existingDest ? snapshotOf(item.existingDest) : null;
  const wasInsert = item.existingDest === null;

  // 4. Canonical destination write (insert or in-place update of the same
  //    tuple — the canonical reconnect behavior, so integration ids and any
  //    workflow references to them survive a replacement).
  let written: DestIntegrationRecord;
  try {
    written = await deps.dest.upsertActive({
      accountId: config.destAccountId,
      connectedByUserId: config.destConnectedByUserId,
      provider: row.provider,
      providerAccountId: row.provider_account_id,
      displayName: row.display_name,
      tokens: {
        accessTokenEncrypted: destAccessCt,
        refreshTokenEncrypted: destRefreshCt,
        accessTokenExpiresAt: expiresAtEpoch,
        scopes: [...row.scopes],
        extraCredentialsEncrypted: destExtrasCt,
      },
      accountMetadata: { ...row.account_metadata },
    });
  } catch {
    return { status: "verification_failed", reason: "destination_write_failed", failed: true };
  }

  // 5. Reread through the NORMAL execution path + runtime decrypt.
  let runtimeOk = false;
  try {
    const reread = await deps.dest.readForExecution(
      config.destAccountId,
      row.provider,
      row.provider_account_id,
    );
    runtimeOk =
      reread !== null &&
      reread.id === written.id &&
      deps.crypto.decryptDestRuntime(reread.accessTokenEncrypted) === accessToken;
  } catch {
    runtimeOk = false;
  }

  if (!runtimeOk) {
    // Rollback: never leave a partially written row marked connected.
    try {
      if (wasInsert) {
        await deps.dest.hardDeleteById(written.id);
      } else if (priorSnapshot) {
        await deps.dest.restoreRow(written.id, priorSnapshot);
      }
    } catch {
      deps.log(
        `ROLLBACK FAILED for ${row.provider} (${row.id}) — manual cleanup required in the DEV project.`,
      );
    }
    return {
      status: "verification_failed",
      reason: "runtime_decrypt_failed",
      failed: true,
    };
  }

  // 6. Source-unchanged proof (read-only reread + field comparison).
  let sourceUnchanged: boolean | undefined;
  try {
    const [after] = await deps.source.getIntegrationsByIds([row.id]);
    sourceUnchanged = after !== undefined && JSON.stringify(after) === JSON.stringify(row);
  } catch {
    sourceUnchanged = undefined;
  }

  // 7. Final status: `verified` requires a confirmed identity AND a refresh
  //    story that is actually durable in dev (non-refreshable standalone, or
  //    owner-attested shared OAuth client).
  const clientCompatAttested = (config.sharedOAuthClientProviders ?? []).includes(row.provider);
  const needsClientCompat =
    classification.oauthClientBound &&
    (classification.refreshable || classification.authType === "token_ingest");

  let status: TransplantItemStatus;
  let reason: TransplantItemReason;
  if (probeRan && identityConfirmed && (!needsClientCompat || clientCompatAttested)) {
    status = "verified";
    reason = "ok";
  } else if (probeRan && identityConfirmed) {
    status = "refresh_unverified";
    reason = "oauth_client_compat_unattested";
  } else if (!probeRan && expired && refreshToken) {
    status = "refresh_unverified";
    reason = "access_token_expired_refresh_untested";
  } else {
    // Probe absent (lenient) or acceptance-only probe.
    status = "refresh_unverified";
    reason = probeRan ? "ok" : "no_probe_for_provider";
  }

  return {
    status,
    reason,
    destinationIntegrationId: written.id,
    sourceUnchanged,
    failed: false,
  };
}
