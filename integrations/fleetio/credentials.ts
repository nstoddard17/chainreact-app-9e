import { decryptToken } from "@/core/encryption/tokens";
import type { IntegrationRecord } from "@/repositories/integrations";

/**
 * Fleetio credential retrieval (FLEETIO-1) — the single decode path from an
 * integration row to the two wire credentials `fleetioRequest` needs.
 *
 * Storage contract (see integrations/fleetio/auth.ts + migration
 * 20260727000000):
 *   - `access_token_encrypted`      → the API key (primary credential)
 *   - `extra_credentials_encrypted` → AES ciphertext of `{ accountToken }`
 *
 * Server-side only (decrypts secrets). Callers: connect-time health checks
 * today; Slice 2+ action handlers / option resolvers via `refreshAndRetry`'s
 * apiCall (which hands over the decrypted PRIMARY credential — wrappers then
 * call this for the Account-Token half).
 *
 * Throws on a malformed row (missing/undecodable extra credentials) — that is
 * a fatal integration error: the row's health flips to reconnect, never a
 * silent partial-credential call.
 */

export interface FleetioCredentials {
  apiKey: string;
  accountToken: string;
}

export class FleetioCredentialShapeError extends Error {
  constructor(reason: string) {
    // SAFE message — names the field, never a value.
    super(`Fleetio integration row is missing usable credentials: ${reason}`);
    this.name = "FleetioCredentialShapeError";
  }
}

/**
 * Decrypt both Fleetio credentials from an integration row. Never logs or
 * embeds either value in an error.
 */
export function decryptFleetioCredentials(
  record: Pick<IntegrationRecord, "accessTokenEncrypted" | "extraCredentialsEncrypted">,
): FleetioCredentials {
  const apiKey = decryptToken(record.accessTokenEncrypted);
  const extraEncrypted = record.extraCredentialsEncrypted;
  if (typeof extraEncrypted !== "string" || extraEncrypted.length === 0) {
    throw new FleetioCredentialShapeError("no extra_credentials_encrypted blob");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decryptToken(extraEncrypted));
  } catch {
    throw new FleetioCredentialShapeError("extra credentials blob is not valid JSON");
  }
  const accountToken =
    parsed !== null && typeof parsed === "object"
      ? (parsed as Record<string, unknown>).accountToken
      : undefined;
  if (typeof accountToken !== "string" || accountToken.length === 0) {
    throw new FleetioCredentialShapeError("accountToken missing from extra credentials");
  }
  return { apiKey, accountToken };
}
