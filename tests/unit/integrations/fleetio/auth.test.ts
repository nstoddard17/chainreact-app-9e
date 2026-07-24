/**
 * @jest-environment node
 *
 * Fleetio credential verification (FLEETIO-1).
 *
 * Business rules protected:
 *   - Valid credentials verify via GET /accounts (API key alone) and the
 *     entered Account-Token must MATCH a returned account's `token` — this
 *     proves BOTH credential halves before anything is persisted.
 *   - providerAccountId is the DURABLE numeric account id (never the mutable
 *     name, never the Account-Token whose rotation is undocumented).
 *   - Both secrets come back ENCRYPTED (API key as the primary credential,
 *     Account-Token inside the extra-credentials blob) — round-trip proven.
 *   - Invalid API key (401) / role gap (403) / token mismatch → typed
 *     CredentialVerificationError whose message NEVER contains a credential.
 *   - Transient provider failure → generic "verify failed" error (route → 502).
 *   - No secret ever lands in account metadata or any output field.
 */
import { randomBytes } from "node:crypto";
import { fleetioCredentialAuth } from "@/integrations/fleetio/auth";
import { CredentialVerificationError } from "@/contracts/integration";
import { decryptToken } from "@/core/encryption/tokens";

const ORIGINAL_FETCH = global.fetch;

const API_KEY = "fleetio-key-abcdef-9999";
const ACCOUNT_TOKEN = "b70a23";

function accountsResponse(records: unknown[]): Response {
  return new Response(JSON.stringify({ records }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  delete process.env.TOKEN_ENCRYPTION_KEY;
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe("fleetioCredentialAuth.buildAuthUrl", () => {
  it("returns the V2-hosted credential form URL carrying the state", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
    const url = new URL(fleetioCredentialAuth.buildAuthUrl("state-123"));
    expect(url.origin + url.pathname).toBe(
      "https://app.example.test/integrations/credential-paste/fleetio",
    );
    expect(url.searchParams.get("state")).toBe("state-123");
  });
});

describe("fleetioCredentialAuth.verifyAndIngestCredentials — happy path", () => {
  it("verifies both halves, encrypts both secrets, uses the numeric id as providerAccountId", async () => {
    global.fetch = jest.fn(async () =>
      accountsResponse([
        { id: 7211, name: "Acme Trucking", token: ACCOUNT_TOKEN, plan: "professional" },
        { id: 9000, name: "Other Fleet", token: "zzz999" },
      ]),
    ) as unknown as typeof fetch;

    const { tokens, account } = await fleetioCredentialAuth.verifyAndIngestCredentials({
      credentials: { apiKey: API_KEY, accountToken: ACCOUNT_TOKEN },
      state: "s",
    });

    // Durable discriminator: numeric account id, label: account name.
    expect(account.providerAccountId).toBe("7211");
    expect(account.displayName).toBe("Acme Trucking");

    // Encryption round-trips; nothing stored in the clear.
    expect(tokens.accessTokenEncrypted).not.toBe(API_KEY);
    expect(decryptToken(tokens.accessTokenEncrypted)).toBe(API_KEY);
    expect(tokens.refreshTokenEncrypted).toBeNull();
    expect(tokens.accessTokenExpiresAt).toBeNull();
    const extra = JSON.parse(decryptToken(tokens.extraCredentialsEncrypted!)) as {
      accountToken: string;
    };
    expect(extra.accountToken).toBe(ACCOUNT_TOKEN);

    // No plaintext secret in ANY output field (metadata included).
    const serialized = JSON.stringify({ tokens, account });
    expect(serialized).not.toContain(API_KEY);
    expect(serialized).not.toContain(ACCOUNT_TOKEN);
  });
});

describe("fleetioCredentialAuth.verifyAndIngestCredentials — failure paths", () => {
  it("rejects an invalid API key (401) with a typed, credential-free error", async () => {
    global.fetch = jest.fn(async () =>
      new Response("bad", { status: 401 }),
    ) as unknown as typeof fetch;
    let thrown: unknown;
    try {
      await fleetioCredentialAuth.verifyAndIngestCredentials({
        credentials: { apiKey: API_KEY, accountToken: ACCOUNT_TOKEN },
        state: "s",
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(CredentialVerificationError);
    expect((thrown as CredentialVerificationError).reason).toBe("invalid API key");
    expect(String((thrown as Error).message)).not.toContain(API_KEY);
    expect(String((thrown as Error).message)).not.toContain(ACCOUNT_TOKEN);
  });

  it("rejects a role-restricted key (403) with a typed role message", async () => {
    global.fetch = jest.fn(async () =>
      new Response("forbidden", { status: 403 }),
    ) as unknown as typeof fetch;
    await expect(
      fleetioCredentialAuth.verifyAndIngestCredentials({
        credentials: { apiKey: API_KEY, accountToken: ACCOUNT_TOKEN },
        state: "s",
      }),
    ).rejects.toMatchObject({
      name: "CredentialVerificationError",
      reason: expect.stringMatching(/role does not allow API access/),
    });
  });

  it("rejects an Account-Token that matches no account on this API key", async () => {
    global.fetch = jest.fn(async () =>
      accountsResponse([{ id: 7211, name: "Acme Trucking", token: "different-token" }]),
    ) as unknown as typeof fetch;
    let thrown: unknown;
    try {
      await fleetioCredentialAuth.verifyAndIngestCredentials({
        credentials: { apiKey: API_KEY, accountToken: ACCOUNT_TOKEN },
        state: "s",
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(CredentialVerificationError);
    expect((thrown as CredentialVerificationError).reason).toBe(
      "account token does not match this API key",
    );
    expect(String((thrown as Error).message)).not.toContain(ACCOUNT_TOKEN);
  });

  it("maps a transient provider failure to a generic 'verify failed' error (route → 502)", async () => {
    global.fetch = jest.fn(async () =>
      new Response("oops", { status: 503 }),
    ) as unknown as typeof fetch;
    await expect(
      fleetioCredentialAuth.verifyAndIngestCredentials({
        credentials: { apiKey: API_KEY, accountToken: ACCOUNT_TOKEN },
        state: "s",
      }),
    ).rejects.toThrow(/Fleetio verify failed/);
  });

  it("rejects missing fields defensively before any network call", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(
      fleetioCredentialAuth.verifyAndIngestCredentials({
        credentials: { apiKey: "", accountToken: ACCOUNT_TOKEN },
        state: "s",
      }),
    ).rejects.toBeInstanceOf(CredentialVerificationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("fleetioCredentialAuth.revoke", () => {
  it("is a best-effort no-op (Fleetio has no key-revocation API) and never throws", async () => {
    await expect(fleetioCredentialAuth.revoke("anything")).resolves.toBeUndefined();
  });
});
