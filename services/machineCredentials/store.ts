import { encryptToken, decryptToken } from "@/core/encryption/tokens";
import {
  assertKeyMatchesCertificate,
  assertCertificateCurrentlyValid,
} from "@/services/http/mtls";
import {
  upsertActiveMachineCredential,
  getActiveMachineCredential,
  disconnectMachineCredential as repoDisconnect,
  updateCachedToken,
  recordMachineCredentialAudit,
  type MachineCredentialRecord,
} from "@/repositories/machineCredentials";

/**
 * Machine-credential STORE service — the encrypt/decrypt + certificate-validation
 * + no-leak boundary over `repositories/machineCredentials.ts`.
 *
 * Provider-neutral (first consumer: ADP). This is the ONLY module that turns
 * plaintext secret material (client_id / client_secret / cert PEM / key PEM) into
 * the encrypted columns and back. Everything above it — the connect handler, the
 * token service, the Apps UI — deals in either plaintext-at-the-edge (connect
 * form) or the secret-omitting DTO. Rules:
 *
 *   - Secrets are validated (key/cert pair + validity window) BEFORE storage, so a
 *     bad credential is rejected at connect time, not on first use.
 *   - `toSafeDto` NEVER includes an encrypted column or the cached token.
 *   - `loadSecrets` returns plaintext and is SERVER-ONLY (token service + engine).
 *   - Audit events carry only non-secret detail (fingerprint, cert expiry,
 *     redacted error code, environment).
 */

const CERT_EXPIRY_WARN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface MachineCredentialSecrets {
  clientId: string;
  clientSecret: string;
  certPem: string;
  keyPem: string;
}

export interface SaveMachineCredentialInput {
  accountId: string;
  actorUserId: string | null;
  provider: string;
  secrets: MachineCredentialSecrets;
  label?: string | null;
  /** Non-secret provider config (base url, token url, environment, edition). */
  metadata?: Record<string, unknown>;
  now?: Date;
}

/** Secret-omitting DTO safe for any client surface / AI / logs. */
export interface MachineCredentialDto {
  id: string;
  provider: string;
  label: string | null;
  connectedByUserId: string | null;
  certFingerprint256: string;
  certSubject: string | null;
  certNotAfter: string;
  certExpired: boolean;
  certExpiringSoon: boolean;
  metadata: Readonly<Record<string, unknown>>;
  rotatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Plaintext secrets + record metadata. SERVER-ONLY (never returned to a client). */
export interface LoadedMachineCredential {
  record: MachineCredentialRecord;
  secrets: MachineCredentialSecrets;
}

/**
 * Project a record to the secret-omitting DTO. Load-bearing no-leak boundary:
 * encrypted columns and the cached token are intentionally absent.
 */
export function toSafeDto(
  record: MachineCredentialRecord,
  now: Date = new Date(),
): MachineCredentialDto {
  const notAfterMs = new Date(record.certNotAfter).getTime();
  return {
    id: record.id,
    provider: record.provider,
    label: record.label,
    connectedByUserId: record.connectedByUserId,
    certFingerprint256: record.certFingerprint256,
    certSubject: record.certSubject,
    certNotAfter: record.certNotAfter,
    certExpired: now.getTime() > notAfterMs,
    certExpiringSoon: now.getTime() + CERT_EXPIRY_WARN_MS >= notAfterMs,
    metadata: record.metadata,
    rotatedAt: record.rotatedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function auditSafe(input: Parameters<typeof recordMachineCredentialAudit>[0]): Promise<void> {
  try {
    await recordMachineCredentialAudit(input);
  } catch {
    // Audit is advisory — never mask the primary operation.
  }
}

/**
 * Validate + encrypt + persist a machine credential (create or rotate). Throws
 * the REDACTED mTLS certificate errors (`MtlsCertificateError` /
 * `CertificateExpiredError` / `CertificateNotYetValidError`) when the material is
 * invalid — the caller maps them to a typed 400. On any validation failure an
 * audit `validation_failed` row is written (no secret in `detail`).
 *
 * Returns the safe DTO.
 */
export async function saveMachineCredential(
  input: SaveMachineCredentialInput,
): Promise<MachineCredentialDto> {
  const now = input.now ?? new Date();

  // 1. Validate the material BEFORE any storage. Redacted throws.
  let certInfo;
  try {
    assertKeyMatchesCertificate(input.secrets.certPem, input.secrets.keyPem);
    certInfo = assertCertificateCurrentlyValid(input.secrets.certPem, now);
  } catch (err) {
    await auditSafe({
      accountId: input.accountId,
      credentialId: null,
      provider: input.provider,
      actorUserId: input.actorUserId,
      event: "validation_failed",
      detail: { code: errorCode(err) },
    });
    throw err;
  }

  // 2. Distinguish create vs rotate for the audit event (before the upsert).
  const existing = await getActiveMachineCredential(input.accountId, input.provider);

  // 3. Encrypt every secret component and persist.
  const record = await upsertActiveMachineCredential({
    accountId: input.accountId,
    connectedByUserId: input.actorUserId,
    provider: input.provider,
    label: input.label ?? null,
    clientIdEncrypted: encryptToken(input.secrets.clientId),
    clientSecretEncrypted: encryptToken(input.secrets.clientSecret),
    certPemEncrypted: encryptToken(input.secrets.certPem),
    keyPemEncrypted: encryptToken(input.secrets.keyPem),
    certFingerprint256: certInfo.fingerprint256,
    certSubject: certInfo.subject,
    certNotAfter: certInfo.validTo,
    metadata: input.metadata ?? {},
  });

  await auditSafe({
    accountId: input.accountId,
    credentialId: record.id,
    provider: input.provider,
    actorUserId: input.actorUserId,
    event: existing ? "rotated" : "created",
    detail: {
      fingerprint256: certInfo.fingerprint256,
      certNotAfter: certInfo.validTo,
      environment: (input.metadata?.environment as string | undefined) ?? null,
    },
  });

  return toSafeDto(record, now);
}

/**
 * Load + decrypt a credential's plaintext secrets. SERVER-ONLY. Returns null when
 * no active credential exists for (accountId, provider).
 */
export async function loadSecrets(
  accountId: string,
  provider: string,
): Promise<LoadedMachineCredential | null> {
  const record = await getActiveMachineCredential(accountId, provider);
  if (!record) return null;
  return {
    record,
    secrets: {
      clientId: decryptToken(record.clientIdEncrypted),
      clientSecret: decryptToken(record.clientSecretEncrypted),
      certPem: decryptToken(record.certPemEncrypted),
      keyPem: decryptToken(record.keyPemEncrypted),
    },
  };
}

/** Decrypt the cached access token if present and not yet expired (with skew). */
export function readCachedToken(
  record: MachineCredentialRecord,
  now: Date = new Date(),
  skewMs = 60_000,
): { accessToken: string; expiresAt: string } | null {
  if (!record.cachedAccessTokenEncrypted || !record.cachedTokenExpiresAt) return null;
  const expMs = new Date(record.cachedTokenExpiresAt).getTime();
  if (Number.isNaN(expMs) || now.getTime() + skewMs >= expMs) return null;
  return {
    accessToken: decryptToken(record.cachedAccessTokenEncrypted),
    expiresAt: record.cachedTokenExpiresAt,
  };
}

/** Encrypt + persist a freshly-minted access token onto the credential row. */
export async function persistCachedToken(input: {
  record: MachineCredentialRecord;
  accessToken: string;
  expiresAt: string;
}): Promise<void> {
  await updateCachedToken({
    id: input.record.id,
    cachedAccessTokenEncrypted: encryptToken(input.accessToken),
    cachedTokenExpiresAt: input.expiresAt,
  });
}

/** Soft-disconnect + audit. */
export async function disconnectMachineCredential(input: {
  accountId: string;
  id: string;
  provider: string;
  actorUserId: string | null;
  now?: string;
}): Promise<{ disconnected: boolean }> {
  const result = await repoDisconnect({
    accountId: input.accountId,
    id: input.id,
    ...(input.now !== undefined ? { now: input.now } : {}),
  });
  if (result.disconnected) {
    await auditSafe({
      accountId: input.accountId,
      credentialId: input.id,
      provider: input.provider,
      actorUserId: input.actorUserId,
      event: "disconnected",
    });
  }
  return result;
}

/** True when the credential's certificate expires within the warning window. */
export function certificateNeedsAttention(
  record: MachineCredentialRecord,
  now: Date = new Date(),
): boolean {
  const notAfterMs = new Date(record.certNotAfter).getTime();
  return now.getTime() + CERT_EXPIRY_WARN_MS >= notAfterMs;
}

/** Extract a stable, non-secret error code from a thrown mTLS/store error. */
export function errorCode(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const c = (err as { code?: unknown }).code;
    if (typeof c === "string") return c;
  }
  return "unknown";
}

export { CERT_EXPIRY_WARN_MS };
