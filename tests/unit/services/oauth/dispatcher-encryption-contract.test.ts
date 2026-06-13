/**
 * @jest-environment node
 *
 * Slice 4.SECURITY-OAUTH-ENCRYPTION-CONTRACT — end-to-end proof that the OAuth
 * write path hands the integrations repository ENCRYPTED token values, never
 * plaintext.
 *
 * The dispatcher itself never encrypts: `handleCallback` forwards the
 * `EncryptedTokens` returned by the provider's `handleCallback` straight into
 * `upsertActive`, and `refresh` forwards the provider's `refreshToken` result
 * into `updateTokens`. The repository writes WHATEVER it is handed (proven
 * separately in repositories/integrations + the gated RLS suite). So the load-
 * bearing guarantee is: *the real provider+dispatcher pipeline produces
 * ciphertext by the time it reaches the repo boundary.*
 *
 * The existing dispatcher-callback.test.ts proves the dispatcher's PLUMBING but
 * mocks the provider's `handleCallback` with a literal `"ENC"` placeholder — so
 * it never exercises real encryption. The per-provider oauth tests prove each
 * provider encrypts in isolation (e.g. gmail/slack/github assert decrypt round-
 * trips). THIS test closes the gap between them: it runs the REAL provider
 * (`hubspotOAuth`, a representative refreshable provider) through the REAL
 * dispatcher with a mocked token-exchange `fetch`, and captures exactly what the
 * repository write receives — asserting it is opaque ciphertext that decrypts
 * back to the provider's plaintext fixtures.
 *
 * Only the repo boundary, the state repo, the account-freeze guard, and the
 * network are mocked. Encryption (`@/core/encryption/tokens`) and the provider
 * are REAL. One representative provider is exercised through the generic
 * dispatcher path per the no-duplicate-across-providers rule.
 *
 * NO real tokens — fixtures are obvious fakes; only their ABSENCE from the
 * captured ciphertext (plus a decrypt round-trip) is asserted.
 */
import { randomBytes } from "node:crypto";

const mockUpsertActive = jest.fn();
const mockUpdateTokens = jest.fn();
const mockGetActiveForExecution = jest.fn();
const mockOAuthStatesCreate = jest.fn();
const mockOAuthStatesConsume = jest.fn();

jest.mock("@/repositories/integrations", () => ({
  upsertActive: (...args: unknown[]) => mockUpsertActive(...args),
  updateTokens: (...args: unknown[]) => mockUpdateTokens(...args),
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));

jest.mock("@/services/accounts/accountFreeze", () => ({
  assertAccountOperational: jest.fn().mockResolvedValue(undefined),
  AccountFrozenError: class AccountFrozenError extends Error {},
}));

// OAUTH-ACCT-BIND — handleCallback re-verifies state-bound-account membership.
jest.mock("@/repositories/accountMemberships", () => ({
  isMemberServiceRole: jest.fn().mockResolvedValue(true),
}));

jest.mock("@/repositories/oauthStates", () => ({
  create: (...args: unknown[]) => mockOAuthStatesCreate(...args),
  consumeByNonce: (...args: unknown[]) => mockOAuthStatesConsume(...args),
}));

import { handleCallback, refresh } from "@/services/oauth/dispatcher";
import { createState, InvalidStateError } from "@/services/oauth/state";
import { encryptToken, decryptToken } from "@/core/encryption/tokens";

const TOKEN_KEY = randomBytes(32).toString("base64");

// Obvious-fake provider token plaintext. The assertions prove these never
// reach the repository boundary in cleartext.
const FAKE_ACCESS = "ha_FAKE_access_DoNotStorePlaintext";
const FAKE_REFRESH = "hr_FAKE_refresh_DoNotStorePlaintext";
const FAKE_NEW_ACCESS = "ha_FAKE_rotated_access_DoNotStore";
const FAKE_NEW_REFRESH = "hr_FAKE_rotated_refresh_DoNotStore";
// A previously-stored (already-encrypted) refresh token for the refresh path.
const FAKE_OLD_REFRESH = "hr_FAKE_stored_refresh_DoNotStore";

beforeEach(() => {
  process.env.OAUTH_STATE_SIGNING_KEY = randomBytes(32).toString("base64");
  process.env.TOKEN_ENCRYPTION_KEY = TOKEN_KEY;
  process.env.HUBSPOT_CLIENT_ID = "test-hubspot-client-id";
  process.env.HUBSPOT_CLIENT_SECRET = "test-hubspot-client-secret";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  mockUpsertActive.mockReset();
  mockUpdateTokens.mockReset();
  mockGetActiveForExecution.mockReset();
  mockOAuthStatesCreate.mockReset();
  mockOAuthStatesCreate.mockResolvedValue(undefined);
  mockOAuthStatesConsume.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.OAUTH_STATE_SIGNING_KEY;
  delete process.env.TOKEN_ENCRYPTION_KEY;
  delete process.env.HUBSPOT_CLIENT_ID;
  delete process.env.HUBSPOT_CLIENT_SECRET;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.HUBSPOT_TOKEN_BASE;
});

/** Queue ordered Response objects on global fetch (token exchange + lookups). */
function mockFetchSequence(
  responses: Array<{ ok?: boolean; status?: number; json?: unknown; text?: string }>,
) {
  const spy = jest.spyOn(globalThis, "fetch");
  for (const r of responses) {
    const body = r.text !== undefined ? r.text : JSON.stringify(r.json ?? {});
    spy.mockResolvedValueOnce(new Response(body, { status: r.status ?? (r.ok === false ? 500 : 200) }));
  }
  return spy;
}

/** Build a real state token AND wire consumeByNonce to return its row. */
async function freshStateWithConsumeWired(input: {
  userId: string;
  accountId: string;
  provider: string;
  scopes?: readonly string[];
}): Promise<string> {
  const { token, payload } = await createState({
    accountId: input.accountId,
    userId: input.userId,
    provider: input.provider,
    requestedScopes: input.scopes ?? [],
  });
  mockOAuthStatesConsume.mockResolvedValueOnce({
    nonce: payload.nonce,
    userId: payload.userId,
    provider: payload.provider,
    expiresAt: new Date(payload.expiresAt * 1000).toISOString(),
    pkceCodeVerifier: null,
    pkceCodeChallengeMethod: null,
    createdAt: new Date().toISOString(),
  });
  return token;
}

/** The successful HubSpot token-exchange + account-resolution fetch pair. */
function hubspotConnectFetch() {
  return mockFetchSequence([
    {
      ok: true,
      json: {
        access_token: FAKE_ACCESS,
        refresh_token: FAKE_REFRESH,
        expires_in: 21600,
        scope: "crm.objects.contacts.read oauth",
        token_type: "bearer",
      },
    },
    {
      ok: true,
      json: { user: "alice@example.com", user_id: 4567, hub_id: 123456, hub_domain: "alice-portal" },
    },
  ]);
}

const ACCESS_MARKERS = ["ha_FAKE", "ha_", FAKE_ACCESS];
const REFRESH_MARKERS = ["hr_FAKE", "hr_", FAKE_REFRESH];

describe("OAuth write path — repository receives ENCRYPTED tokens (create)", () => {
  it("dispatcher.handleCallback hands upsertActive opaque ciphertext that decrypts to the provider fixtures", async () => {
    const state = await freshStateWithConsumeWired({
      userId: "user-hub-1",
      accountId: "acct-hub-1",
      provider: "hubspot",
    });
    hubspotConnectFetch();
    mockUpsertActive.mockResolvedValueOnce({ id: "int-hub-1" });

    await handleCallback({ provider: "hubspot", code: "auth-code-1", state });

    expect(mockUpsertActive).toHaveBeenCalledTimes(1);
    const arg = mockUpsertActive.mock.calls[0]![0] as {
      tokens: { accessTokenEncrypted: string; refreshTokenEncrypted: string | null };
    };
    const { accessTokenEncrypted, refreshTokenEncrypted } = arg.tokens;

    // Access token reaches the repo encrypted.
    for (const m of ACCESS_MARKERS) expect(accessTokenEncrypted).not.toContain(m);
    expect(decryptToken(accessTokenEncrypted)).toBe(FAKE_ACCESS);

    // Refresh token too (HubSpot is refreshable → non-null).
    expect(refreshTokenEncrypted).not.toBeNull();
    for (const m of REFRESH_MARKERS) expect(refreshTokenEncrypted!).not.toContain(m);
    expect(decryptToken(refreshTokenEncrypted!)).toBe(FAKE_REFRESH);
  });

  it("non-sensitive metadata reaches the repo intact (account/provider/scopes/expiry/provenance)", async () => {
    const state = await freshStateWithConsumeWired({
      userId: "user-hub-1",
      accountId: "acct-hub-1",
      provider: "hubspot",
    });
    hubspotConnectFetch();
    mockUpsertActive.mockResolvedValueOnce({ id: "int-hub-1" });

    await handleCallback({ provider: "hubspot", code: "auth-code-1", state });

    const arg = mockUpsertActive.mock.calls[0]![0] as {
      accountId: string;
      connectedByUserId: string;
      provider: string;
      providerAccountId: string;
      tokens: { scopes: readonly string[]; accessTokenExpiresAt: number | null };
    };
    expect(arg.accountId).toBe("acct-hub-1");
    expect(arg.connectedByUserId).toBe("user-hub-1");
    expect(arg.provider).toBe("hubspot");
    expect(arg.providerAccountId).toBe("123456"); // stringified hub_id
    expect(arg.tokens.scopes).toEqual(["crm.objects.contacts.read", "oauth"]);
    expect(typeof arg.tokens.accessTokenExpiresAt).toBe("number");
  });
});

describe("OAuth write path — repository receives ENCRYPTED tokens (update/refresh)", () => {
  it("dispatcher.refresh hands updateTokens opaque ciphertext that decrypts to the rotated fixtures", async () => {
    // The stored row carries an ALREADY-encrypted refresh token; the dispatcher
    // decrypts it, calls the real provider refresh (mocked network), and the
    // fresh tokens must reach updateTokens encrypted.
    mockGetActiveForExecution.mockResolvedValueOnce({
      id: "int-hub-1",
      refreshTokenEncrypted: encryptToken(FAKE_OLD_REFRESH),
    });
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: FAKE_NEW_ACCESS,
          refresh_token: FAKE_NEW_REFRESH,
          expires_in: 21600,
          scope: "crm.objects.contacts.read oauth",
          token_type: "bearer",
        },
      },
    ]);
    mockUpdateTokens.mockResolvedValueOnce({ id: "int-hub-1" });

    await refresh({ accountId: "acct-hub-1", provider: "hubspot" });

    expect(mockUpdateTokens).toHaveBeenCalledTimes(1);
    const arg = mockUpdateTokens.mock.calls[0]![0] as {
      id: string;
      tokens: { accessTokenEncrypted: string; refreshTokenEncrypted: string | null };
    };
    expect(arg.id).toBe("int-hub-1");
    const { accessTokenEncrypted, refreshTokenEncrypted } = arg.tokens;

    expect(accessTokenEncrypted).not.toContain(FAKE_NEW_ACCESS);
    expect(accessTokenEncrypted).not.toContain("ha_");
    expect(decryptToken(accessTokenEncrypted)).toBe(FAKE_NEW_ACCESS);

    expect(refreshTokenEncrypted).not.toBeNull();
    expect(refreshTokenEncrypted!).not.toContain(FAKE_NEW_REFRESH);
    expect(refreshTokenEncrypted!).not.toContain("hr_");
    expect(decryptToken(refreshTokenEncrypted!)).toBe(FAKE_NEW_REFRESH);
  });
});

describe("OAuth write path — error paths never persist", () => {
  it("token-exchange failure → provider throws → upsertActive is NEVER called", async () => {
    const state = await freshStateWithConsumeWired({
      userId: "user-hub-1",
      accountId: "acct-hub-1",
      provider: "hubspot",
    });
    // Token endpoint returns a non-2xx → hubspotOAuth.handleCallback throws.
    mockFetchSequence([{ ok: false, status: 400, json: { message: "bad_code" } }]);

    await expect(
      handleCallback({ provider: "hubspot", code: "bad-code", state }),
    ).rejects.toThrow(/HubSpot token exchange failed/);
    expect(mockUpsertActive).not.toHaveBeenCalled();
  });

  it("tampered state → provider network is never hit and upsertActive is NEVER called", async () => {
    const state = await freshStateWithConsumeWired({
      userId: "user-hub-1",
      accountId: "acct-hub-1",
      provider: "hubspot",
    });
    const tampered = state.slice(0, -4) + "AAAA";
    const fetchSpy = jest.spyOn(globalThis, "fetch");

    await expect(
      handleCallback({ provider: "hubspot", code: "c", state: tampered }),
    ).rejects.toThrow(InvalidStateError);

    expect(fetchSpy).not.toHaveBeenCalled(); // no token exchange attempted
    expect(mockUpsertActive).not.toHaveBeenCalled();
  });
});
