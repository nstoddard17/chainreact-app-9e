/**
 * @jest-environment node
 *
 * Full happy-path tests for dispatcher.handleTokenIngest using the
 * registered Trello provider (Slice 17 Commit 3). Covers the
 * persistence end of the contract — valid token creates integration row
 * with encrypted token, token never logged or returned, consume+verify+
 * upsert order.
 *
 * Mocks the network boundary (Trello API) and the persistence boundary
 * (integrations + oauthStates repos). The state primitives run for real
 * — createState/consumeState exercise the JWT signature + DB nonce
 * round-trip.
 */
import { randomBytes } from "node:crypto";

const mockUpsertActive = jest.fn();
const mockOAuthStatesCreate = jest.fn();
const mockOAuthStatesConsume = jest.fn();
const mockEnsurePersonalAccount = jest.fn(async (userId: string) => ({
  id: `acct-${userId}`,
  type: "personal" as const,
  ownerUserId: userId,
  createdAt: "2026-05-30T00:00:00Z",
  updatedAt: "2026-05-30T00:00:00Z",
}));

jest.mock("@/repositories/integrations", () => ({
  upsertActive: (...args: unknown[]) => mockUpsertActive(...args),
}));

jest.mock("@/repositories/oauthStates", () => ({
  create: (...args: unknown[]) => mockOAuthStatesCreate(...args),
  consumeByNonce: (...args: unknown[]) => mockOAuthStatesConsume(...args),
}));

jest.mock("@/services/accounts/ensurePersonalAccount", () => ({
  ensurePersonalAccount: (userId: string) => mockEnsurePersonalAccount(userId),
}));

// OAUTH-ACCT-BIND — handleTokenIngest now enforces freeze + state-bound-account
// membership before persisting. Mock both operational/member-true by default.
jest.mock("@/services/accounts/accountFreeze", () => ({
  assertAccountOperational: jest.fn().mockResolvedValue(undefined),
  AccountFrozenError: class AccountFrozenError extends Error {},
}));
jest.mock("@/repositories/accountMemberships", () => ({
  isMemberServiceRole: jest.fn().mockResolvedValue(true),
}));

import { connect, handleTokenIngest } from "@/services/oauth/dispatcher";
import { createState, InvalidStateError } from "@/services/oauth/state";
import { decryptToken } from "@/core/encryption/tokens";

const ORIGINAL_FETCH = global.fetch;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function freshStateWithConsumeWired(input: {
  userId: string;
  provider: string;
  scopes?: readonly string[];
}): Promise<string> {
  const { token, payload } = await createState({
    accountId: `acct-${input.userId}`,
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

beforeEach(() => {
  process.env.OAUTH_STATE_SIGNING_KEY = randomBytes(32).toString("base64");
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.TRELLO_CLIENT_ID = "test-app-key";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  mockUpsertActive.mockReset();
  mockOAuthStatesCreate.mockReset();
  mockOAuthStatesCreate.mockResolvedValue(undefined);
  mockOAuthStatesConsume.mockReset();
});

afterEach(() => {
  delete process.env.OAUTH_STATE_SIGNING_KEY;
  delete process.env.TOKEN_ENCRYPTION_KEY;
  delete process.env.TRELLO_CLIENT_ID;
  delete process.env.NEXT_PUBLIC_APP_URL;
  global.fetch = ORIGINAL_FETCH;
});

describe("dispatcher.connect (trello — token_ingest happy path)", () => {
  it("returns a Trello authorize URL with verifiable state in return_url", async () => {
    const { redirectUrl } = await connect({ userId: "user-1", accountId: "acct-user-1", provider: "trello" });
    const u = new URL(redirectUrl);
    expect(u.origin + u.pathname).toBe("https://trello.com/1/authorize");
    expect(u.searchParams.get("key")).toBe("test-app-key");
    expect(u.searchParams.get("callback_method")).toBe("fragment");
    const returnUrl = u.searchParams.get("return_url");
    expect(returnUrl).toBeTruthy();
    const ru = new URL(returnUrl!);
    expect(ru.searchParams.get("state")).toBeTruthy();
    expect(mockOAuthStatesCreate).toHaveBeenCalledTimes(1);
  });
});

describe("dispatcher.handleTokenIngest (trello — full happy path)", () => {
  it("consumes state, verifies token via Trello API, persists encrypted token", async () => {
    const state = await freshStateWithConsumeWired({
      userId: "user-1",
      provider: "trello",
    });
    global.fetch = jest.fn(async () =>
      jsonResponse(200, {
        id: "trello-member-id-1",
        username: "octocat",
        fullName: "Octo Cat",
      }),
    ) as unknown as typeof fetch;
    mockUpsertActive.mockResolvedValueOnce({
      id: "int-1",
      provider: "trello",
      providerAccountId: "trello-member-id-1",
    });

    const sensitiveToken = "trello-user-secret-token-9999";
    const result = await handleTokenIngest({
      userId: "user-1",
      provider: "trello",
      state,
      token: sensitiveToken,
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
      tokens: { accessTokenEncrypted: string; refreshTokenEncrypted: string | null };
    };
    expect(upsertInput.accountId).toBe("acct-user-1");
    expect(upsertInput.connectedByUserId).toBe("user-1");
    expect(upsertInput.provider).toBe("trello");
    expect(upsertInput.providerAccountId).toBe("trello-member-id-1");
    expect(upsertInput.displayName).toBe("Octo Cat");
    expect(upsertInput.tokens.refreshTokenEncrypted).toBeNull();
    expect(upsertInput.tokens.accessTokenEncrypted).not.toBe(sensitiveToken);
    expect(decryptToken(upsertInput.tokens.accessTokenEncrypted)).toBe(
      sensitiveToken,
    );
  });

  it("rejects with InvalidStateError when state JWT user does not match session user", async () => {
    const state = await freshStateWithConsumeWired({
      userId: "user-A",
      provider: "trello",
    });
    await expect(
      handleTokenIngest({
        userId: "user-B",
        provider: "trello",
        state,
        token: "some-token",
      }),
    ).rejects.toBeInstanceOf(InvalidStateError);
    expect(mockUpsertActive).not.toHaveBeenCalled();
  });

  it("fails closed when Trello verify returns 401 (token rejected; no persistence)", async () => {
    const state = await freshStateWithConsumeWired({
      userId: "user-1",
      provider: "trello",
    });
    global.fetch = jest.fn(async () =>
      new Response("invalid token", { status: 401 }),
    ) as unknown as typeof fetch;
    await expect(
      handleTokenIngest({
        userId: "user-1",
        provider: "trello",
        state,
        token: "bad",
      }),
    ).rejects.toThrow(/invalid token/);
    expect(mockUpsertActive).not.toHaveBeenCalled();
    expect(mockOAuthStatesConsume).toHaveBeenCalledTimes(1);
  });

  it("never returns or stores the plaintext token in any output field", async () => {
    const state = await freshStateWithConsumeWired({
      userId: "user-1",
      provider: "trello",
    });
    global.fetch = jest.fn(async () =>
      jsonResponse(200, { id: "member-x", username: "x" }),
    ) as unknown as typeof fetch;
    mockUpsertActive.mockResolvedValueOnce({ id: "int-2" });
    const sensitiveToken = "secret-xyz-token-7777";
    const result = await handleTokenIngest({
      userId: "user-1",
      provider: "trello",
      state,
      token: sensitiveToken,
    });
    expect(JSON.stringify(result)).not.toContain(sensitiveToken);
    const upsertInputJson = JSON.stringify(mockUpsertActive.mock.calls[0]![0]);
    expect(upsertInputJson).not.toContain(sensitiveToken);
  });
});
