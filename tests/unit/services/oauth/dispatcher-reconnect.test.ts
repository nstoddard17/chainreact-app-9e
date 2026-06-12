/**
 * @jest-environment node
 *
 * Tests for the per-account reconnect path through the dispatcher
 * (Slice 4.APPS-RECONNECT):
 *   - connect() in reconnect mode binds the row into the signed state, writes to
 *     the ROW's account (not the personal floor), and steers Google sign-in.
 *   - handleCallback() refuses to upsert unless the provider-returned identity
 *     matches the intended row — for a steering provider AND a non-steering one.
 */
import { randomBytes } from "node:crypto";

const mockOAuthStatesCreate = jest.fn();
const mockOAuthStatesConsume = jest.fn();
const mockEnsurePersonalAccount = jest.fn();
const mockUpsertActive = jest.fn();
const mockGetByIdForAccount = jest.fn();
const mockSlackHandleCallback = jest.fn();

jest.mock("@/repositories/oauthStates", () => ({
  create: (...a: unknown[]) => mockOAuthStatesCreate(...a),
  consumeByNonce: (...a: unknown[]) => mockOAuthStatesConsume(...a),
}));
jest.mock("@/services/accounts/ensurePersonalAccount", () => ({
  ensurePersonalAccount: (...a: unknown[]) => mockEnsurePersonalAccount(...a),
}));
jest.mock("@/services/accounts/accountFreeze", () => ({
  assertAccountOperational: jest.fn().mockResolvedValue(undefined),
  AccountFrozenError: class AccountFrozenError extends Error {},
}));
jest.mock("@/repositories/integrations", () => ({
  upsertActive: (...a: unknown[]) => mockUpsertActive(...a),
  getByIdForAccountServiceRole: (...a: unknown[]) => mockGetByIdForAccount(...a),
}));
jest.mock("@/integrations/slack/oauth", () => ({
  slackOAuth: {
    buildAuthUrl: jest.fn(() => "https://slack.com/oauth/v2/authorize?test=1"),
    handleCallback: (...a: unknown[]) => mockSlackHandleCallback(...a),
    refreshToken: jest.fn(),
    revoke: jest.fn(),
  },
}));

import {
  connect,
  handleCallback,
  ReconnectHintUnavailableError,
  ReconnectIdentityMismatchError,
} from "@/services/oauth/dispatcher";
import { createState, verifyState } from "@/services/oauth/state";

beforeEach(() => {
  process.env.OAUTH_STATE_SIGNING_KEY = randomBytes(32).toString("base64");
  process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
  process.env.SHOPIFY_CLIENT_ID = "test-shopify-client-id";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  mockOAuthStatesCreate.mockReset().mockResolvedValue(undefined);
  mockOAuthStatesConsume.mockReset();
  mockEnsurePersonalAccount.mockReset();
  mockUpsertActive.mockReset().mockResolvedValue({ id: "int-1", provider: "slack" });
  mockGetByIdForAccount.mockReset();
  mockSlackHandleCallback.mockReset();
});

afterEach(() => {
  delete process.env.OAUTH_STATE_SIGNING_KEY;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.SHOPIFY_CLIENT_ID;
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe("connect() — reconnect mode", () => {
  const reconnect = {
    integrationId: "int-77",
    accountId: "team-acct",
    expectedProviderAccountId: "marcus@example.com",
  };

  it("binds the row + the ROW's account into state and steers Google sign-in; does NOT touch the personal floor", async () => {
    const { redirectUrl } = await connect({ userId: "user-1", provider: "gmail", reconnect });
    const u = new URL(redirectUrl);

    // Steering (Google): pre-selects the row's email + forces the chooser.
    expect(u.searchParams.get("login_hint")).toBe("marcus@example.com");
    expect(u.searchParams.get("prompt")).toBe("select_account consent");

    // State binds the opaque row id and writes to the ROW's account, not personal.
    const payload = verifyState(u.searchParams.get("state")!);
    expect(payload.accountId).toBe("team-acct");
    expect(payload.reconnect).toEqual({ integrationId: "int-77" });

    // Reconnect mode never resolves/creates the personal account.
    expect(mockEnsurePersonalAccount).not.toHaveBeenCalled();
  });

  it("a normal connect (no reconnect) still resolves the personal floor and adds no steering", async () => {
    mockEnsurePersonalAccount.mockResolvedValue({
      id: "acct-user-1",
      type: "personal",
      ownerUserId: "user-1",
      deletionStatus: "active",
      createdAt: "x",
      updatedAt: "x",
    });
    const { redirectUrl } = await connect({ userId: "user-1", provider: "gmail" });
    const u = new URL(redirectUrl);
    expect(u.searchParams.get("login_hint")).toBeNull();
    expect(u.searchParams.get("prompt")).toBe("consent");
    expect(verifyState(u.searchParams.get("state")!).reconnect).toBeUndefined();
    expect(mockEnsurePersonalAccount).toHaveBeenCalledWith("user-1");
  });
});

describe("connect() — Shopify per-tenant reconnect (4.APPS-RECONNECT)", () => {
  it("derives the shop hint SERVER-SIDE from the row and builds the per-shop authorize URL", async () => {
    // The reconnect bundle's expectedProviderAccountId IS the shop domain.
    const { redirectUrl } = await connect({
      userId: "user-1",
      provider: "shopify",
      reconnect: {
        integrationId: "int-shop",
        accountId: "team-acct",
        expectedProviderAccountId: "mystore.myshopify.com",
      },
    });
    const u = new URL(redirectUrl);
    // Per-shop authorize endpoint — proves the derived shop hint reached buildAuthUrl.
    expect(u.origin + u.pathname).toBe(
      "https://mystore.myshopify.com/admin/oauth/authorize",
    );
    // State binds BOTH the derived shop hint and the reconnect row id.
    const payload = verifyState(u.searchParams.get("state")!);
    expect(payload.providerHint).toEqual({ shop: "mystore.myshopify.com" });
    expect(payload.reconnect).toEqual({ integrationId: "int-shop" });
    expect(payload.accountId).toBe("team-acct");
    expect(mockEnsurePersonalAccount).not.toHaveBeenCalled();
  });

  it("a corrupt row whose shop can't be derived → safe typed error, no state written", async () => {
    // A value with a dot but the WRONG TLD can't normalize to *.myshopify.com.
    await expect(
      connect({
        userId: "user-1",
        provider: "shopify",
        reconnect: {
          integrationId: "int-shop",
          accountId: "team-acct",
          expectedProviderAccountId: "bad-store.example.com",
        },
      }),
    ).rejects.toBeInstanceOf(ReconnectHintUnavailableError);
    // The safe message never echoes the stored shop value.
    await expect(
      connect({
        userId: "user-1",
        provider: "shopify",
        reconnect: {
          integrationId: "int-shop",
          accountId: "team-acct",
          expectedProviderAccountId: "secret-store.example.com",
        },
      }),
    ).rejects.toThrow(/can.t be reconnected automatically/i);
    expect(mockOAuthStatesCreate).not.toHaveBeenCalled();
  });

  it("a NORMAL Shopify connect (client shop hint, no reconnect) is unchanged", async () => {
    mockEnsurePersonalAccount.mockResolvedValue({
      id: "acct-user-1",
      type: "personal",
      ownerUserId: "user-1",
      deletionStatus: "active",
      createdAt: "x",
      updatedAt: "x",
    });
    const { redirectUrl } = await connect({
      userId: "user-1",
      provider: "shopify",
      providerHint: { shop: "client-store.myshopify.com" },
    });
    const u = new URL(redirectUrl);
    expect(u.origin + u.pathname).toBe(
      "https://client-store.myshopify.com/admin/oauth/authorize",
    );
    const payload = verifyState(u.searchParams.get("state")!);
    expect(payload.providerHint).toEqual({ shop: "client-store.myshopify.com" });
    expect(payload.reconnect).toBeUndefined();
  });
});

describe("handleCallback() — reconnect identity match", () => {
  async function reconnectState(integrationId: string): Promise<string> {
    const { token, payload } = await createState({
      userId: "user-1",
      accountId: "team-acct",
      provider: "slack",
      requestedScopes: [],
      reconnect: { integrationId },
    });
    mockOAuthStatesConsume.mockResolvedValue({
      nonce: payload.nonce,
      userId: "user-1",
      provider: "slack",
      pkceCodeVerifier: null,
      pkceCodeChallengeMethod: null,
    });
    return token;
  }

  it("matching provider_account_id → refreshes the intended row (upsert called)", async () => {
    const state = await reconnectState("int-77");
    mockSlackHandleCallback.mockResolvedValue({
      tokens: { accessTokenEncrypted: "e", refreshTokenEncrypted: null, accessTokenExpiresAt: null, scopes: [] },
      account: { providerAccountId: "T-WORKSPACE", displayName: "Acme", metadata: {} },
    });
    // Intended row carries the SAME identity → match.
    mockGetByIdForAccount.mockResolvedValue({ id: "int-77", providerAccountId: "T-WORKSPACE", provider: "slack" });

    await handleCallback({ provider: "slack", code: "c", state });

    expect(mockGetByIdForAccount).toHaveBeenCalledWith("team-acct", "int-77");
    expect(mockUpsertActive).toHaveBeenCalledTimes(1);
    expect(mockUpsertActive.mock.calls[0]![0]).toMatchObject({
      accountId: "team-acct",
      providerAccountId: "T-WORKSPACE",
    });
  });

  it("DIFFERENT provider_account_id → throws + does NOT upsert (no wrong-row write)", async () => {
    const state = await reconnectState("int-77");
    mockSlackHandleCallback.mockResolvedValue({
      tokens: { accessTokenEncrypted: "e", refreshTokenEncrypted: null, accessTokenExpiresAt: null, scopes: [] },
      account: { providerAccountId: "T-OTHER", displayName: "Other", metadata: {} },
    });
    // Intended row is a DIFFERENT workspace → mismatch.
    mockGetByIdForAccount.mockResolvedValue({ id: "int-77", providerAccountId: "T-WORKSPACE", provider: "slack" });

    await expect(handleCallback({ provider: "slack", code: "c", state })).rejects.toBeInstanceOf(
      ReconnectIdentityMismatchError,
    );
    expect(mockUpsertActive).not.toHaveBeenCalled();
  });

  it("intended row vanished (disconnected/deleted mid-flow) → throws, no upsert", async () => {
    const state = await reconnectState("int-gone");
    mockSlackHandleCallback.mockResolvedValue({
      tokens: { accessTokenEncrypted: "e", refreshTokenEncrypted: null, accessTokenExpiresAt: null, scopes: [] },
      account: { providerAccountId: "T-WORKSPACE", displayName: "Acme", metadata: {} },
    });
    mockGetByIdForAccount.mockResolvedValue(null);

    await expect(handleCallback({ provider: "slack", code: "c", state })).rejects.toBeInstanceOf(
      ReconnectIdentityMismatchError,
    );
    expect(mockUpsertActive).not.toHaveBeenCalled();
  });
});
