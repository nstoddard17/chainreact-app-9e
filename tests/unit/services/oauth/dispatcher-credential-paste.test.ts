/**
 * @jest-environment node
 *
 * Dispatcher credential-paste path (FLEETIO-1) — full path with the
 * registered Fleetio provider, mirroring dispatcher-token-ingest-trello.
 *
 * Business rules protected:
 *   - connect() for a credential_paste provider mints signed single-use state
 *     (account binding + replay protection) and redirects to the V2-hosted
 *     credential form — never a provider page, never a providerHint.
 *   - handleCredentialIngest validates the submitted field set against the
 *     manifest BEFORE consuming state or touching the provider.
 *   - State is consumed BEFORE the provider verify call (replay-impossible).
 *   - provider/user cross-checks, membership re-check, and the owner/admin
 *     completion re-check (fleetio is an ACCOUNT credential) all run BEFORE
 *     any credential reaches Fleetio.
 *   - Persistence goes through upsertActive with BOTH credentials encrypted;
 *     no plaintext credential in any output or persisted field.
 *   - Path separation: a credential_paste provider can NEVER be driven
 *     through handleTokenIngest, and handleCredentialIngest refuses
 *     non-credential_paste providers.
 *   - Reconnect identity guard: a mismatched account refuses to upsert.
 */
import { randomBytes } from "node:crypto";

const mockUpsertActive = jest.fn();
const mockGetByIdForAccount = jest.fn();
const mockOAuthStatesCreate = jest.fn();
const mockOAuthStatesConsume = jest.fn();
const mockIsMember = jest.fn();
const mockGetRole = jest.fn();

jest.mock("@/repositories/integrations", () => ({
  upsertActive: (...args: unknown[]) => mockUpsertActive(...args),
  getByIdForAccountServiceRole: (...args: unknown[]) => mockGetByIdForAccount(...args),
}));

jest.mock("@/repositories/oauthStates", () => ({
  create: (...args: unknown[]) => mockOAuthStatesCreate(...args),
  consumeByNonce: (...args: unknown[]) => mockOAuthStatesConsume(...args),
}));

jest.mock("@/services/accounts/accountFreeze", () => ({
  assertAccountOperational: jest.fn().mockResolvedValue(undefined),
  AccountFrozenError: class AccountFrozenError extends Error {},
}));

jest.mock("@/repositories/accountMemberships", () => ({
  isMemberServiceRole: (...args: unknown[]) => mockIsMember(...args),
  getRoleServiceRole: (...args: unknown[]) => mockGetRole(...args),
}));

import {
  connect,
  handleCredentialIngest,
  handleTokenIngest,
  ReconnectIdentityMismatchError,
  StateAccountAccessError,
} from "@/services/oauth/dispatcher";
import { createState, InvalidStateError } from "@/services/oauth/state";
import { CredentialVerificationError } from "@/contracts/integration";
import { decryptToken } from "@/core/encryption/tokens";

const ORIGINAL_FETCH = global.fetch;

const API_KEY = "fleetio-key-dispatcher-test";
const ACCOUNT_TOKEN = "acct-tok-dispatcher";

function accountsOk(): Response {
  return new Response(
    JSON.stringify({
      records: [{ id: 7211, name: "Acme Trucking", token: ACCOUNT_TOKEN, plan: "professional" }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

async function freshStateWithConsumeWired(input: {
  userId: string;
  provider: string;
  reconnect?: { integrationId: string };
}): Promise<string> {
  const { token, payload } = await createState({
    accountId: `acct-${input.userId}`,
    userId: input.userId,
    provider: input.provider,
    requestedScopes: [],
    ...(input.reconnect !== undefined ? { reconnect: input.reconnect } : {}),
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

beforeEach(() => {
  process.env.OAUTH_STATE_SIGNING_KEY = randomBytes(32).toString("base64");
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  mockUpsertActive.mockReset();
  mockGetByIdForAccount.mockReset();
  mockOAuthStatesCreate.mockReset();
  mockOAuthStatesCreate.mockResolvedValue(undefined);
  mockOAuthStatesConsume.mockReset();
  mockIsMember.mockReset();
  mockIsMember.mockResolvedValue(true);
  mockGetRole.mockReset();
  mockGetRole.mockResolvedValue("owner");
});

afterEach(() => {
  delete process.env.OAUTH_STATE_SIGNING_KEY;
  delete process.env.TOKEN_ENCRYPTION_KEY;
  delete process.env.NEXT_PUBLIC_APP_URL;
  global.fetch = ORIGINAL_FETCH;
});

describe("dispatcher.connect (fleetio — credential_paste)", () => {
  it("mints state and redirects to the V2 credential form (no provider page)", async () => {
    const { redirectUrl } = await connect({
      userId: "user-1",
      accountId: "acct-user-1",
      provider: "fleetio",
    });
    const u = new URL(redirectUrl);
    expect(u.origin + u.pathname).toBe(
      "https://app.example.test/integrations/credential-paste/fleetio",
    );
    expect(u.searchParams.get("state")).toBeTruthy();
    expect(mockOAuthStatesCreate).toHaveBeenCalledTimes(1);
  });

  it("rejects providerHint for a credential_paste provider without minting state", async () => {
    await expect(
      connect({
        userId: "user-1",
        accountId: "acct-user-1",
        provider: "fleetio",
        providerHint: { shop: "x" },
      }),
    ).rejects.toThrow(/does not accept providerHint/);
    expect(mockOAuthStatesCreate).not.toHaveBeenCalled();
  });
});

describe("dispatcher.handleCredentialIngest (fleetio — full happy path)", () => {
  it("consumes state, verifies both credentials, persists them encrypted to the state-bound account", async () => {
    const state = await freshStateWithConsumeWired({ userId: "user-1", provider: "fleetio" });
    global.fetch = jest.fn(async () => accountsOk()) as unknown as typeof fetch;
    mockUpsertActive.mockResolvedValueOnce({ id: "int-1", provider: "fleetio" });

    const result = await handleCredentialIngest({
      userId: "user-1",
      provider: "fleetio",
      state,
      credentials: { apiKey: API_KEY, accountToken: ACCOUNT_TOKEN },
    });

    expect(result.integration.id).toBe("int-1");
    expect(mockOAuthStatesConsume).toHaveBeenCalledTimes(1);
    expect(mockUpsertActive).toHaveBeenCalledTimes(1);

    const upsertInput = mockUpsertActive.mock.calls[0]![0] as {
      accountId: string;
      connectedByUserId: string;
      provider: string;
      providerAccountId: string;
      displayName: string | null;
      tokens: {
        accessTokenEncrypted: string;
        refreshTokenEncrypted: string | null;
        extraCredentialsEncrypted?: string | null;
      };
    };
    expect(upsertInput.accountId).toBe("acct-user-1");
    expect(upsertInput.connectedByUserId).toBe("user-1");
    expect(upsertInput.provider).toBe("fleetio");
    expect(upsertInput.providerAccountId).toBe("7211");
    expect(upsertInput.displayName).toBe("Acme Trucking");
    expect(upsertInput.tokens.refreshTokenEncrypted).toBeNull();
    expect(decryptToken(upsertInput.tokens.accessTokenEncrypted)).toBe(API_KEY);
    const extra = JSON.parse(
      decryptToken(upsertInput.tokens.extraCredentialsEncrypted!),
    ) as { accountToken: string };
    expect(extra.accountToken).toBe(ACCOUNT_TOKEN);

    // No plaintext credential in any persisted or returned field.
    expect(JSON.stringify(upsertInput)).not.toContain(API_KEY);
    expect(JSON.stringify(upsertInput)).not.toContain(ACCOUNT_TOKEN);
    expect(JSON.stringify(result)).not.toContain(API_KEY);
    expect(JSON.stringify(result)).not.toContain(ACCOUNT_TOKEN);
  });
});

describe("dispatcher.handleCredentialIngest — field-set validation (before state / provider)", () => {
  it("rejects an unknown field without consuming state or calling the provider", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(
      handleCredentialIngest({
        userId: "user-1",
        provider: "fleetio",
        state: "some-state",
        credentials: { apiKey: API_KEY, accountToken: ACCOUNT_TOKEN, evil: "x" },
      }),
    ).rejects.toMatchObject({
      name: "CredentialVerificationError",
      reason: "unexpected field 'evil'",
    });
    expect(mockOAuthStatesConsume).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a missing required field without consuming state", async () => {
    await expect(
      handleCredentialIngest({
        userId: "user-1",
        provider: "fleetio",
        state: "some-state",
        credentials: { apiKey: API_KEY },
      }),
    ).rejects.toMatchObject({
      name: "CredentialVerificationError",
      reason: "missing required field 'accountToken'",
    });
    expect(mockOAuthStatesConsume).not.toHaveBeenCalled();
  });
});

describe("dispatcher.handleCredentialIngest — state + authz guards", () => {
  it("consumes state BEFORE verify: a failed verify leaves no replayable state", async () => {
    const state = await freshStateWithConsumeWired({ userId: "user-1", provider: "fleetio" });
    global.fetch = jest.fn(async () =>
      new Response("bad", { status: 401 }),
    ) as unknown as typeof fetch;
    await expect(
      handleCredentialIngest({
        userId: "user-1",
        provider: "fleetio",
        state,
        credentials: { apiKey: "bad-key", accountToken: ACCOUNT_TOKEN },
      }),
    ).rejects.toBeInstanceOf(CredentialVerificationError);
    expect(mockOAuthStatesConsume).toHaveBeenCalledTimes(1); // consumed despite failure
    expect(mockUpsertActive).not.toHaveBeenCalled();
  });

  it("rejects a session/state user mismatch before any provider call", async () => {
    const state = await freshStateWithConsumeWired({ userId: "user-A", provider: "fleetio" });
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(
      handleCredentialIngest({
        userId: "user-B",
        provider: "fleetio",
        state,
        credentials: { apiKey: API_KEY, accountToken: ACCOUNT_TOKEN },
      }),
    ).rejects.toBeInstanceOf(InvalidStateError);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockUpsertActive).not.toHaveBeenCalled();
  });

  it("rejects a state minted for a DIFFERENT provider", async () => {
    const state = await freshStateWithConsumeWired({ userId: "user-1", provider: "trello" });
    await expect(
      handleCredentialIngest({
        userId: "user-1",
        provider: "fleetio",
        state,
        credentials: { apiKey: API_KEY, accountToken: ACCOUNT_TOKEN },
      }),
    ).rejects.toBeInstanceOf(InvalidStateError);
    expect(mockUpsertActive).not.toHaveBeenCalled();
  });

  it("fails safe when the initiator lost membership of the state-bound account", async () => {
    const state = await freshStateWithConsumeWired({ userId: "user-1", provider: "fleetio" });
    mockIsMember.mockResolvedValue(false);
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(
      handleCredentialIngest({
        userId: "user-1",
        provider: "fleetio",
        state,
        credentials: { apiKey: API_KEY, accountToken: ACCOUNT_TOKEN },
      }),
    ).rejects.toBeInstanceOf(StateAccountAccessError);
    expect(fetchMock).not.toHaveBeenCalled(); // credential never sent to provider
    expect(mockUpsertActive).not.toHaveBeenCalled();
  });

  it("fails safe when the initiator was downgraded below owner/admin (fleetio is an ACCOUNT credential)", async () => {
    const state = await freshStateWithConsumeWired({ userId: "user-1", provider: "fleetio" });
    mockGetRole.mockResolvedValue("member");
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(
      handleCredentialIngest({
        userId: "user-1",
        provider: "fleetio",
        state,
        credentials: { apiKey: API_KEY, accountToken: ACCOUNT_TOKEN },
      }),
    ).rejects.toBeInstanceOf(StateAccountAccessError);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockUpsertActive).not.toHaveBeenCalled();
  });

  it("refuses a reconnect that authorized a DIFFERENT Fleetio account than the intended row", async () => {
    const state = await freshStateWithConsumeWired({
      userId: "user-1",
      provider: "fleetio",
      reconnect: { integrationId: "int-77" },
    });
    global.fetch = jest.fn(async () => accountsOk()) as unknown as typeof fetch; // verifies as account 7211
    mockGetByIdForAccount.mockResolvedValueOnce({
      id: "int-77",
      providerAccountId: "9999", // intended row is a different Fleetio account
    });
    await expect(
      handleCredentialIngest({
        userId: "user-1",
        provider: "fleetio",
        state,
        credentials: { apiKey: API_KEY, accountToken: ACCOUNT_TOKEN },
      }),
    ).rejects.toBeInstanceOf(ReconnectIdentityMismatchError);
    expect(mockUpsertActive).not.toHaveBeenCalled();
  });
});

describe("path separation — credential_paste vs token flows", () => {
  it("handleTokenIngest refuses a credential_paste provider (fleetio)", async () => {
    await expect(
      handleTokenIngest({
        userId: "user-1",
        provider: "fleetio",
        state: "x",
        token: "y",
      }),
    ).rejects.toThrow(/does not use a direct-token/);
    expect(mockUpsertActive).not.toHaveBeenCalled();
  });

  it("handleCredentialIngest refuses a token_ingest provider (trello)", async () => {
    await expect(
      handleCredentialIngest({
        userId: "user-1",
        provider: "trello",
        state: "x",
        credentials: { token: "y" },
      }),
    ).rejects.toThrow(/does not use the credential_paste auth flow/);
    expect(mockUpsertActive).not.toHaveBeenCalled();
  });
});
