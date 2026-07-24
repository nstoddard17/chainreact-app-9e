/**
 * @jest-environment node
 *
 * Fleetio credential retrieval contract (FLEETIO-1).
 *
 * Business rules protected:
 *   - The documented storage shape (API key in access_token_encrypted,
 *     Account-Token inside the extra-credentials blob) round-trips through
 *     the ONE decode path Slice 2+ handlers will use.
 *   - A malformed row (missing blob / bad JSON / missing accountToken) is a
 *     FATAL typed error — never a silent partial-credential API call — and
 *     the error message never contains a secret.
 */
import { randomBytes } from "node:crypto";
import { encryptToken } from "@/core/encryption/tokens";
import {
  decryptFleetioCredentials,
  FleetioCredentialShapeError,
} from "@/integrations/fleetio/credentials";

const API_KEY = "fleetio-key-round-trip-1";
const ACCOUNT_TOKEN = "acct-token-round-trip-2";

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

afterEach(() => {
  delete process.env.TOKEN_ENCRYPTION_KEY;
});

describe("decryptFleetioCredentials", () => {
  it("round-trips the connect-time storage shape back to both wire credentials", () => {
    const record = {
      accessTokenEncrypted: encryptToken(API_KEY),
      extraCredentialsEncrypted: encryptToken(JSON.stringify({ accountToken: ACCOUNT_TOKEN })),
    };
    const creds = decryptFleetioCredentials(record);
    expect(creds.apiKey).toBe(API_KEY);
    expect(creds.accountToken).toBe(ACCOUNT_TOKEN);
  });

  it("throws a typed, secret-free error when the extra-credentials blob is missing", () => {
    const record = {
      accessTokenEncrypted: encryptToken(API_KEY),
      extraCredentialsEncrypted: null,
    };
    let thrown: unknown;
    try {
      decryptFleetioCredentials(record);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(FleetioCredentialShapeError);
    expect(String((thrown as Error).message)).not.toContain(API_KEY);
  });

  it("throws when the blob decrypts to non-JSON", () => {
    const record = {
      accessTokenEncrypted: encryptToken(API_KEY),
      extraCredentialsEncrypted: encryptToken("not-json"),
    };
    expect(() => decryptFleetioCredentials(record)).toThrow(FleetioCredentialShapeError);
  });

  it("throws when accountToken is absent from the decrypted blob", () => {
    const record = {
      accessTokenEncrypted: encryptToken(API_KEY),
      extraCredentialsEncrypted: encryptToken(JSON.stringify({ other: "x" })),
    };
    expect(() => decryptFleetioCredentials(record)).toThrow(
      /accountToken missing/,
    );
  });
});
