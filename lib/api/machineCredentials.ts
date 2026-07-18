/**
 * Typed client API for machine-credential (client_credentials + mTLS) connections.
 *
 * Provider-neutral — the only client bridge to the machine-credential routes (per
 * project-structure-and-module-boundaries.md §5, components never `fetch()` these
 * directly). Secrets flow ONE WAY (client → server): responses carry only the
 * secret-omitting DTO or a safe cert-metadata / error code. Nothing here ever
 * receives or stores a client secret, private key, or token.
 */

/** Secret-omitting connected-credential DTO (mirrors the server `MachineCredentialDto`). */
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
  metadata: Record<string, unknown>;
  rotatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Safe certificate metadata returned by the pre-submit validate endpoint. */
export interface MachineCertValidation {
  ok: boolean;
  code?: string;
  cert?: {
    subject: string;
    fingerprint256: string;
    validFrom: string;
    validTo: string;
    expired: boolean;
    notYetValid: boolean;
    keyMatches: boolean;
    keyError: string | null;
  };
}

export interface MachineCredentialConnectInput {
  clientId: string;
  clientSecret: string;
  certPem: string;
  keyPem: string;
  environment: string;
  label?: string | null;
}

/** A safe, code-tagged failure the form maps to friendly copy. */
export class MachineCredentialApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number) {
    super(code);
    this.name = "MachineCredentialApiError";
    this.code = code;
    this.status = status;
  }
}

function basePath(provider: string): string {
  return `/api/integrations/machine-credentials/${encodeURIComponent(provider)}`;
}

async function readErrorCode(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (typeof body?.error === "string" && body.error.length > 0) return body.error;
  } catch {
    /* non-JSON */
  }
  return "request_failed";
}

/** Validate a cert/key pair pre-submit. Returns safe metadata; never stores. */
export async function validateMachineCertificate(
  provider: string,
  input: { certPem: string; keyPem: string },
): Promise<MachineCertValidation> {
  const res = await fetch(`${basePath(provider)}/validate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new MachineCredentialApiError(await readErrorCode(res), res.status);
  }
  return (await res.json()) as MachineCertValidation;
}

/** Connect (or rotate) a machine credential. Returns the secret-omitting DTO. */
export async function connectMachineCredential(
  provider: string,
  input: MachineCredentialConnectInput,
): Promise<MachineCredentialDto> {
  const res = await fetch(`${basePath(provider)}/connect`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new MachineCredentialApiError(await readErrorCode(res), res.status);
  }
  const body = (await res.json()) as { credential: MachineCredentialDto };
  return body.credential;
}

/** Disconnect the account's machine credential for a provider. */
export async function disconnectMachineCredential(
  provider: string,
): Promise<{ disconnected: boolean }> {
  const res = await fetch(`${basePath(provider)}/disconnect`, { method: "POST" });
  if (!res.ok) {
    throw new MachineCredentialApiError(await readErrorCode(res), res.status);
  }
  return (await res.json()) as { disconnected: boolean };
}
