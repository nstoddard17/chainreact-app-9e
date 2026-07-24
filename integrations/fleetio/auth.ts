import {
  CredentialVerificationError,
  type ProviderCredentialPasteAuth,
} from "@/contracts/integration";
import { encryptToken } from "@/core/encryption/tokens";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { FleetioForbiddenError } from "./api/_request";
import { fleetioListAccounts } from "./api/accounts";

/**
 * Fleetio credential-paste auth (FLEETIO-1). Inaugural consumer of
 * `ProviderCredentialPasteAuth` — the user enters TWO named credentials
 * (declared in the manifest's `credentialFields`) into the shared V2
 * credential form:
 *
 *   - `apiKey`       → `Authorization: Token <apiKey>` (the PRIMARY credential;
 *                      stored in `access_token_encrypted`)
 *   - `accountToken` → `Account-Token` header (stored inside
 *                      `extra_credentials_encrypted` as `{ accountToken }`)
 *
 * Verification (one lightweight read, proves BOTH halves):
 *   1. `GET /accounts` with the API key alone. 401/403 → typed
 *      `CredentialVerificationError` (route → 400; nothing persisted).
 *   2. Match the entered Account-Token against `records[].token`. No match →
 *      typed error "account token does not match this API key".
 *   3. On success: durable `providerAccountId` = `String(account.id)` (the
 *      numeric id — NOT the mutable name, NOT the Account-Token), label =
 *      `account.name`, metadata carries ONLY non-secret fields (plan).
 *
 * `revoke` — Fleetio exposes no API-key revocation endpoint; keys are revoked
 * in Fleetio → Settings → Manage API Keys. Best-effort no-op (never throws).
 *
 * NO-LEAK: neither credential ever appears in an error message, log, or
 * metadata field. Transient failures throw a generic Error whose message
 * matches the ingest route's `/verify failed/` transient heuristic → 502.
 */

function getCredentialFormUrl(state: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/integrations/credential-paste/fleetio?state=${encodeURIComponent(state)}`;
}

export const fleetioCredentialAuth: ProviderCredentialPasteAuth = {
  buildAuthUrl(state) {
    // No provider authorize page — send the browser to the V2 credential form.
    return getCredentialFormUrl(state);
  },

  async verifyAndIngestCredentials({ credentials }) {
    const apiKey = credentials.apiKey?.trim() ?? "";
    const accountToken = credentials.accountToken?.trim() ?? "";
    // Defense-in-depth — the dispatcher already validated required fields
    // against the manifest before calling us.
    if (!apiKey) throw new CredentialVerificationError("fleetio", "missing required field 'apiKey'");
    if (!accountToken) {
      throw new CredentialVerificationError("fleetio", "missing required field 'accountToken'");
    }

    let accounts;
    try {
      accounts = await fleetioListAccounts({ apiKey });
    } catch (err) {
      if (err instanceof Unauthorized401Error) {
        throw new CredentialVerificationError("fleetio", "invalid API key");
      }
      if (err instanceof FleetioForbiddenError) {
        throw new CredentialVerificationError(
          "fleetio",
          "this API key's Fleetio user role does not allow API access",
        );
      }
      // Rate limit / 5xx / timeout / network → transient. The message keeps
      // the "verify failed" marker the ingest route classifies as 502.
      throw new Error("Fleetio verify failed: could not reach the Fleetio API");
    }

    const account = accounts.find((a) => a.token === accountToken);
    if (!account) {
      throw new CredentialVerificationError(
        "fleetio",
        "account token does not match this API key",
      );
    }

    return {
      tokens: {
        // PRIMARY credential — the API key IS the Authorization token.
        accessTokenEncrypted: encryptToken(apiKey),
        refreshTokenEncrypted: null,
        accessTokenExpiresAt: null,
        // Fleetio has no scope negotiation — access is the key's user's role.
        scopes: [],
        // The second named credential, encrypted as one JSON blob.
        extraCredentialsEncrypted: encryptToken(JSON.stringify({ accountToken })),
      },
      account: {
        // Durable numeric account id. The Account-Token is NOT used here (it
        // is secret-adjacent and its rotation behavior is undocumented).
        providerAccountId: String(account.id),
        displayName: account.name,
        metadata: {
          // Non-secret only. NEVER the Account-Token, NEVER the API key.
          plan: account.plan ?? null,
        },
      },
    };
  },

  async revoke(_token) {
    // Fleetio has no API-key revocation endpoint — the user revokes the key in
    // Fleetio → Settings → Manage API Keys. Best-effort no-op (never throws).
  },
};
