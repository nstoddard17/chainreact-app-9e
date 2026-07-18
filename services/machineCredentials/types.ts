import type { ClientCredentialsTokenConfig } from "./tokenService";

/**
 * Per-provider machine-credential (client_credentials + mTLS) configuration.
 *
 * Analogue of `ProviderOAuth` / `ProviderTokenIngestAuth` for the machine auth
 * flow. A provider that uses `authFlow: 'machine_credentials'` exports one of
 * these and registers it in `services/machineCredentials/registry.ts`. It carries
 * ONLY non-secret, provider-shaped configuration — the secret material (client_id
 * / client_secret / cert / key) is supplied by the connecting user and never
 * lives in this object.
 *
 * First (still-disabled) consumer: ADP.
 */

export interface MachineCredentialEnvironment {
  /** Stored value, e.g. 'iat' | 'prod'. */
  value: string;
  /** Human label, e.g. 'Sandbox (IAT)' | 'Production'. */
  label: string;
}

export interface MachineCredentialConnectInput {
  clientId: string;
  clientSecret: string;
  certPem: string;
  keyPem: string;
  /** Which provider environment these credentials belong to. */
  environment?: string | null;
  /** Optional human label for the connection. */
  label?: string | null;
}

/** Thrown by `validateConnectInput` for provider-specific input problems. Message
 * is safe (never echoes a secret); `code` is stable for typed HTTP mapping. */
export class MachineConnectInputError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "MachineConnectInputError";
    this.code = code;
  }
}

export interface ProviderMachineAuth {
  /** Selectable environments; the FIRST is the default when none is supplied. */
  environments: readonly MachineCredentialEnvironment[];
  /**
   * Provider-specific validation of the connect input BEYOND the generic cert/key
   * checks the store performs (which validate the certificate itself). Throw a
   * `MachineConnectInputError` on invalid input. Must NOT echo secrets.
   */
  validateConnectInput(input: MachineCredentialConnectInput): void;
  /** The token-endpoint config for `env` (non-secret). */
  buildTokenConfig(env: string): ClientCredentialsTokenConfig;
  /** Non-secret metadata persisted on the credential row (base urls, env, edition). */
  buildMetadata(env: string): Record<string, unknown>;
  /** Base API URL for `env` (the provider API client reads it from metadata). */
  apiBaseUrl(env: string): string;
}
