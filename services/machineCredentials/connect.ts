import {
  saveMachineCredential,
  disconnectMachineCredential as storeDisconnect,
  type MachineCredentialDto,
} from "./store";
import { getActiveMachineCredential } from "@/repositories/machineCredentials";
import { getMachineAuth } from "./registry";
import {
  MachineConnectInputError,
  type MachineCredentialConnectInput,
} from "./types";

/**
 * Connect / disconnect a machine (client_credentials + mTLS) credential.
 *
 * The credential-flow analogue of the OAuth dispatcher's `connect` — but there is
 * NO redirect: the user submits {client_id, client_secret, cert, key, environment}
 * to a form, and this service validates + persists through the encrypted store.
 * Authorization (owner/admin + membership + not-frozen account) is enforced by the
 * ROUTE (mirroring the OAuth connect route), so this service is session-free and
 * unit-testable. It returns ONLY the secret-omitting DTO.
 *
 * First (still-disabled) consumer: ADP.
 */

/** Thrown when the provider does not use the machine auth flow / is not registered. */
export class UnsupportedMachineProviderError extends Error {
  readonly provider: string;
  constructor(provider: string) {
    super(`Provider '${provider}' does not support machine-credential connect.`);
    this.name = "UnsupportedMachineProviderError";
    this.provider = provider;
  }
}

// Defensive caps so a malformed/oversized paste can't be used as a DoS vector.
const MAX_ID_LEN = 4096;
const MAX_SECRET_LEN = 8192;
const MAX_PEM_LEN = 100_000;

function requireField(value: unknown, name: string, maxLen: number): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new MachineConnectInputError("missing_field", `${name} is required.`);
  }
  if (value.length > maxLen) {
    throw new MachineConnectInputError("field_too_long", `${name} is too long.`);
  }
  return value;
}

export interface ConnectMachineCredentialInput {
  accountId: string;
  actorUserId: string;
  provider: string;
  input: MachineCredentialConnectInput;
  now?: Date;
}

/**
 * Validate + persist a machine credential. Throws:
 *   - `UnsupportedMachineProviderError` when the provider isn't machine-auth.
 *   - `MachineConnectInputError` for missing/oversized/invalid input (typed 400).
 *   - the redacted mTLS certificate errors when the cert/key is invalid or expired.
 * Returns the secret-omitting DTO.
 */
export async function connectMachineCredential(
  args: ConnectMachineCredentialInput,
): Promise<MachineCredentialDto> {
  const auth = getMachineAuth(args.provider);
  if (!auth) throw new UnsupportedMachineProviderError(args.provider);

  // Generic presence/size validation (never echoes values).
  const clientId = requireField(args.input.clientId, "Client ID", MAX_ID_LEN);
  const clientSecret = requireField(args.input.clientSecret, "Client secret", MAX_SECRET_LEN);
  const certPem = requireField(args.input.certPem, "Certificate", MAX_PEM_LEN);
  const keyPem = requireField(args.input.keyPem, "Private key", MAX_PEM_LEN);

  // Resolve environment (default = first declared).
  const defaultEnv = auth.environments[0]?.value;
  const environment = args.input.environment?.trim() || defaultEnv;
  if (!environment || !auth.environments.some((e) => e.value === environment)) {
    throw new MachineConnectInputError(
      "invalid_environment",
      "Unknown or missing environment.",
    );
  }

  const normalizedInput: MachineCredentialConnectInput = {
    clientId,
    clientSecret,
    certPem,
    keyPem,
    environment,
    label: args.input.label ?? null,
  };

  // Provider-specific validation (throws MachineConnectInputError on failure).
  auth.validateConnectInput(normalizedInput);

  // Persist (the store validates the cert/key pair + validity, encrypts, audits).
  return saveMachineCredential({
    accountId: args.accountId,
    actorUserId: args.actorUserId,
    provider: args.provider,
    secrets: { clientId, clientSecret, certPem, keyPem },
    label: args.input.label ?? null,
    metadata: auth.buildMetadata(environment),
    ...(args.now !== undefined ? { now: args.now } : {}),
  });
}

/** Soft-disconnect an account's machine credential for a provider. */
export async function disconnectMachineProvider(args: {
  accountId: string;
  actorUserId: string;
  provider: string;
}): Promise<{ disconnected: boolean }> {
  const existing = await getActiveMachineCredential(args.accountId, args.provider);
  if (!existing) return { disconnected: false };
  return storeDisconnect({
    accountId: args.accountId,
    id: existing.id,
    provider: args.provider,
    actorUserId: args.actorUserId,
  });
}
