import {
  MachineConnectInputError,
  type MachineCredentialConnectInput,
  type ProviderMachineAuth,
} from "@/services/machineCredentials/types";
import type { ClientCredentialsTokenConfig } from "@/services/machineCredentials/tokenService";

/**
 * ADP machine (client_credentials + mTLS) auth config.
 *
 * Confirmed against ADP's public developer docs (docs/providers/adp/research.md):
 *   - Token endpoint: https://accounts.adp.com/auth/oauth/v2/token (prod),
 *     grant_type=client_credentials, HTTP Basic client auth.
 *   - API base: https://api.adp.com (prod). IAT (integration/sandbox) hosts are
 *     the accepted ADP convention (iat-accounts / iat-api) — marked unverified in
 *     research.md and confirmed at owner-setup/live-cert time.
 *   - Every call presents the WS client certificate at the TLS layer (mTLS);
 *     that is handled by the transport, not here.
 *
 * Carries only NON-SECRET config; the secret material is supplied by the
 * connecting owner/admin and lives only in the encrypted store.
 */

const ENV_PROD = "prod";
const ENV_IAT = "iat";

const HOSTS: Record<string, { tokenUrl: string; apiBaseUrl: string }> = {
  // Production — confirmed token host; api.adp.com is the documented API host.
  [ENV_PROD]: {
    tokenUrl: "https://accounts.adp.com/auth/oauth/v2/token",
    apiBaseUrl: "https://api.adp.com",
  },
  // Integration / sandbox (IAT) — ADP's integration environment. Hosts marked
  // [ASSUMPTION] in research.md; verify at owner-setup / live-certification.
  [ENV_IAT]: {
    tokenUrl: "https://iat-accounts.adp.com/auth/oauth/v2/token",
    apiBaseUrl: "https://iat-api.adp.com",
  },
};

export const adpMachineAuth: ProviderMachineAuth = {
  environments: [
    { value: ENV_IAT, label: "Sandbox (IAT)" },
    { value: ENV_PROD, label: "Production" },
  ],

  validateConnectInput(input: MachineCredentialConnectInput): void {
    // ADP client ids/secrets are opaque; we can only sanity-check shape without
    // knowing ADP-internal formats. The cert/key are validated by the store
    // (pairing + validity). Keep this permissive but non-empty. NEVER echo values.
    if (input.clientId.includes(" ")) {
      throw new MachineConnectInputError(
        "invalid_client_id",
        "The ADP client id must not contain spaces.",
      );
    }
    // PEM sanity (defense-in-depth; the store does the authoritative X.509 checks).
    if (!input.certPem.includes("BEGIN CERTIFICATE")) {
      throw new MachineConnectInputError(
        "invalid_certificate",
        "The certificate must be a PEM-encoded X.509 certificate.",
      );
    }
    if (!/BEGIN (?:EC |RSA )?PRIVATE KEY/.test(input.keyPem)) {
      throw new MachineConnectInputError(
        "invalid_private_key",
        "The private key must be a PEM-encoded private key.",
      );
    }
  },

  buildTokenConfig(env: string): ClientCredentialsTokenConfig {
    const host = HOSTS[env] ?? HOSTS[ENV_PROD]!;
    return {
      tokenUrl: host.tokenUrl,
      clientAuth: "basic", // confirmed: HTTP Basic client_id:client_secret
      // ADP does not require a `scope` param on the client_credentials mint.
      defaultTtlSeconds: 3600, // ADP access tokens are ~1h (fallback if omitted)
    };
  },

  buildMetadata(env: string): Record<string, unknown> {
    const host = HOSTS[env] ?? HOSTS[ENV_PROD]!;
    return {
      environment: env,
      apiBaseUrl: host.apiBaseUrl,
      tokenUrl: host.tokenUrl,
    };
  },

  apiBaseUrl(env: string): string {
    return (HOSTS[env] ?? HOSTS[ENV_PROD]!).apiBaseUrl;
  },
};
