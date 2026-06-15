/**
 * @jest-environment node
 *
 * Tests for dispatcher.refresh — the new operation in Slice 2b.
 *
 * Mocks: integrations repo (getActiveForExecution + updateTokens), token
 * encryption (encrypt/decrypt), and slackOAuth so we can drive
 * refreshToken outcomes without touching a real provider. The
 * single-flight refresh lock is exercised concretely (no mock of
 * refreshLock itself).
 */
import {
  RefreshNotSupportedError,
  RefreshAuthRequiredError,
} from "@/contracts/integration";

const mockGetActiveForExecution = jest.fn();
const mockUpdateTokens = jest.fn();
const mockClearNeedsReconnect = jest.fn();
const mockMarkNeedsReconnect = jest.fn();
const mockNotifyReconnectNeeded = jest.fn();
const mockSlackRefreshToken = jest.fn();

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: mockGetActiveForExecution,
  updateTokens: mockUpdateTokens,
  clearNeedsReconnect: mockClearNeedsReconnect,
  markNeedsReconnect: mockMarkNeedsReconnect,
  // upsertActive isn't used by refresh, but the dispatcher imports it
  // statically. Provide a stub so the import resolves.
  upsertActive: jest.fn(),
}));

jest.mock("@/services/integrations/reconnectNotification", () => ({
  notifyReconnectNeeded: (...args: unknown[]) => mockNotifyReconnectNeeded(...args),
}));

// 4.ACCOUNT-MODEL-10b — refresh calls the account freeze guard. Mock it as
// operational so this unit test doesn't construct the real service-role client.
// Freeze behavior is covered in accountFreeze.test.ts.
jest.mock("@/services/accounts/accountFreeze", () => ({
  assertAccountOperational: jest.fn().mockResolvedValue(undefined),
  AccountFrozenError: class AccountFrozenError extends Error {},
}));

jest.mock("@/integrations/slack/oauth", () => ({
  slackOAuth: {
    buildAuthUrl: jest.fn(),
    handleCallback: jest.fn(),
    refreshToken: mockSlackRefreshToken,
    revoke: jest.fn(),
  },
}));

jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: jest.fn((enc: string) => enc.replace(/^ENC-/, "")),
  encryptToken: jest.fn((p: string) => `ENC-${p}`),
}));

import { __resetRefreshLockForTests } from "@/services/oauth/refreshLock";
import { refresh } from "@/services/oauth/dispatcher";

beforeEach(() => {
  __resetRefreshLockForTests();
  mockGetActiveForExecution.mockReset();
  mockUpdateTokens.mockReset();
  mockClearNeedsReconnect.mockReset();
  mockClearNeedsReconnect.mockResolvedValue(undefined);
  mockMarkNeedsReconnect.mockReset();
  mockMarkNeedsReconnect.mockResolvedValue(true);
  mockNotifyReconnectNeeded.mockReset();
  mockNotifyReconnectNeeded.mockResolvedValue(undefined);
  mockSlackRefreshToken.mockReset();
});

function makeRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "int-1",
    accountId: "acct-user-1",
    connectedByUserId: "user-1",
    provider: "slack",
    providerAccountId: "T123",
    displayName: "Acme",
    accessTokenEncrypted: "ENC-old-access",
    refreshTokenEncrypted: "ENC-old-refresh",
    accessTokenExpiresAt: null,
    scopes: ["chat:write"],
    accountMetadata: {},
    disconnectedAt: null,
    createdAt: "2026-05-07T00:00:00Z",
    updatedAt: "2026-05-07T00:00:00Z",
    ...overrides,
  };
}

describe("dispatcher.refresh — happy path", () => {
  it("decrypts refresh token, calls provider.refreshToken, persists via updateTokens", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeRow());
    mockSlackRefreshToken.mockResolvedValueOnce({
      accessTokenEncrypted: "ENC-new-access",
      refreshTokenEncrypted: "ENC-new-refresh",
      accessTokenExpiresAt: 1_780_000_000,
      scopes: ["chat:write"],
    });
    mockUpdateTokens.mockResolvedValueOnce(
      makeRow({ accessTokenEncrypted: "ENC-new-access", refreshTokenEncrypted: "ENC-new-refresh" }),
    );

    const result = await refresh({ accountId: "user-1", provider: "slack" });

    // Provider received the decrypted refresh token (mock decrypts ENC- prefix).
    expect(mockSlackRefreshToken).toHaveBeenCalledWith("old-refresh");
    expect(mockUpdateTokens).toHaveBeenCalledWith({
      id: "int-1",
      tokens: {
        accessTokenEncrypted: "ENC-new-access",
        refreshTokenEncrypted: "ENC-new-refresh",
        accessTokenExpiresAt: 1_780_000_000,
        scopes: ["chat:write"],
      },
    });
    expect(result.integration.accessTokenEncrypted).toBe("ENC-new-access");
  });

  it("propagates accountId through the lookup", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeRow());
    mockSlackRefreshToken.mockResolvedValueOnce({
      accessTokenEncrypted: "ENC-x",
      refreshTokenEncrypted: "ENC-y",
      accessTokenExpiresAt: null,
      scopes: [],
    });
    mockUpdateTokens.mockResolvedValueOnce(makeRow());

    await refresh({ accountId: "user-1", provider: "slack", providerAccountId: "T999" });

    expect(mockGetActiveForExecution).toHaveBeenCalledWith("user-1", "slack", "T999", undefined);
  });

  it("treats omitted accountId as null", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeRow());
    mockSlackRefreshToken.mockResolvedValueOnce({
      accessTokenEncrypted: "ENC-x",
      refreshTokenEncrypted: "ENC-y",
      accessTokenExpiresAt: null,
      scopes: [],
    });
    mockUpdateTokens.mockResolvedValueOnce(makeRow());

    await refresh({ accountId: "user-1", provider: "slack" });

    expect(mockGetActiveForExecution).toHaveBeenCalledWith("user-1", "slack", null, undefined);
  });
});

describe("dispatcher.refresh — V2-READY-31 reconnect-signal clear on success", () => {
  function mockSuccessfulRefresh() {
    mockSlackRefreshToken.mockResolvedValueOnce({
      accessTokenEncrypted: "ENC-new-access",
      refreshTokenEncrypted: "ENC-new-refresh",
      accessTokenExpiresAt: 1_780_000_000,
      scopes: ["chat:write"],
    });
    mockUpdateTokens.mockResolvedValueOnce(
      makeRow({ accessTokenEncrypted: "ENC-new-access" }),
    );
  }

  it("clears needs_reconnect_at when the refreshed row carried a prior signal", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(
      makeRow({ needsReconnectAt: "2026-06-10T00:00:00.000Z" }),
    );
    mockSuccessfulRefresh();

    await refresh({ accountId: "user-1", provider: "slack" });

    expect(mockClearNeedsReconnect).toHaveBeenCalledWith("int-1");
  });

  it("does NOT clear when the row had no reconnect signal (no needless write)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeRow({ needsReconnectAt: null }));
    mockSuccessfulRefresh();

    await refresh({ accountId: "user-1", provider: "slack" });

    expect(mockClearNeedsReconnect).not.toHaveBeenCalled();
  });

  it("a clear failure does NOT fail the refresh (best-effort)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(
      makeRow({ needsReconnectAt: "2026-06-10T00:00:00.000Z" }),
    );
    mockSuccessfulRefresh();
    mockClearNeedsReconnect.mockRejectedValueOnce(new Error("db down"));

    const result = await refresh({ accountId: "user-1", provider: "slack" });

    expect(result.integration.accessTokenEncrypted).toBe("ENC-new-access");
  });

  it("does NOT clear when refresh itself fails (no false 'healthy' signal)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(
      makeRow({ needsReconnectAt: "2026-06-10T00:00:00.000Z" }),
    );
    mockSlackRefreshToken.mockRejectedValueOnce(new Error("Google token refresh failed: invalid_grant"));

    await expect(refresh({ accountId: "user-1", provider: "slack" })).rejects.toThrow(
      /invalid_grant/i,
    );
    expect(mockClearNeedsReconnect).not.toHaveBeenCalled();
  });
});

describe("dispatcher.refresh — V2-READY-32 typed refresh-auth-required", () => {
  it("marks needs_reconnect_at + notifies once, then re-throws the typed error", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeRow());
    mockSlackRefreshToken.mockRejectedValueOnce(
      new RefreshAuthRequiredError("slack", "invalid_grant"),
    );
    mockMarkNeedsReconnect.mockResolvedValueOnce(true); // first-mark transition

    await expect(refresh({ accountId: "user-1", provider: "slack" })).rejects.toBeInstanceOf(
      RefreshAuthRequiredError,
    );

    expect(mockMarkNeedsReconnect).toHaveBeenCalledWith("int-1");
    expect(mockNotifyReconnectNeeded).toHaveBeenCalledTimes(1);
    // Refresh did NOT succeed → tokens are not persisted.
    expect(mockUpdateTokens).not.toHaveBeenCalled();
  });

  it("does NOT re-notify when the row was already marked (mark returns false)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeRow());
    mockSlackRefreshToken.mockRejectedValueOnce(
      new RefreshAuthRequiredError("slack", "invalid_grant"),
    );
    mockMarkNeedsReconnect.mockResolvedValueOnce(false); // already marked

    await expect(refresh({ accountId: "user-1", provider: "slack" })).rejects.toBeInstanceOf(
      RefreshAuthRequiredError,
    );

    expect(mockMarkNeedsReconnect).toHaveBeenCalledWith("int-1");
    expect(mockNotifyReconnectNeeded).not.toHaveBeenCalled();
  });

  it("does NOT mark/notify on a generic (transient) refresh error — re-throws it", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeRow());
    mockSlackRefreshToken.mockRejectedValueOnce(
      new Error("Slack token refresh failed: HTTP 503"),
    );

    await expect(refresh({ accountId: "user-1", provider: "slack" })).rejects.toThrow(
      /HTTP 503/,
    );

    expect(mockMarkNeedsReconnect).not.toHaveBeenCalled();
    expect(mockNotifyReconnectNeeded).not.toHaveBeenCalled();
  });

  it("a mark/notify failure does NOT mask the original refresh-auth error", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeRow());
    mockSlackRefreshToken.mockRejectedValueOnce(
      new RefreshAuthRequiredError("slack", "invalid_grant"),
    );
    mockMarkNeedsReconnect.mockRejectedValueOnce(new Error("db down"));

    await expect(refresh({ accountId: "user-1", provider: "slack" })).rejects.toBeInstanceOf(
      RefreshAuthRequiredError,
    );
  });
});

describe("dispatcher.refresh — error paths", () => {
  it("propagates RefreshNotSupportedError from provider untouched (caller translates)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeRow());
    mockSlackRefreshToken.mockRejectedValueOnce(new RefreshNotSupportedError("slack"));

    await expect(refresh({ accountId: "user-1", provider: "slack" })).rejects.toBeInstanceOf(
      RefreshNotSupportedError,
    );
    expect(mockUpdateTokens).not.toHaveBeenCalled();
  });

  it("throws clear error when no active integration exists", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    await expect(refresh({ accountId: "user-1", provider: "slack" })).rejects.toThrow(
      /no active integration/i,
    );
    expect(mockSlackRefreshToken).not.toHaveBeenCalled();
  });

  it("throws clear error when row exists but refresh_token_encrypted is null", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(
      makeRow({ refreshTokenEncrypted: null }),
    );
    await expect(refresh({ accountId: "user-1", provider: "slack" })).rejects.toThrow(
      /no refresh token/i,
    );
    expect(mockSlackRefreshToken).not.toHaveBeenCalled();
  });

  it("throws when manifest is unknown for the provider", async () => {
    await expect(refresh({ accountId: "u", provider: "nope" })).rejects.toThrow(
      /unknown provider/i,
    );
  });

  it("rejects empty accountId", async () => {
    await expect(refresh({ accountId: "", provider: "slack" })).rejects.toThrow(
      /accountId is required/i,
    );
  });
});

describe("dispatcher.refresh — concurrent calls coalesce via the lock", () => {
  it("two concurrent refreshes for same (user, provider, account) trigger ONE provider call", async () => {
    mockGetActiveForExecution.mockResolvedValue(makeRow());
    let providerInvocations = 0;
    mockSlackRefreshToken.mockImplementation(async () => {
      providerInvocations += 1;
      await new Promise((r) => setImmediate(r));
      return {
        accessTokenEncrypted: "ENC-new",
        refreshTokenEncrypted: "ENC-new-refresh",
        accessTokenExpiresAt: null,
        scopes: [],
      };
    });
    mockUpdateTokens.mockResolvedValue(makeRow({ accessTokenEncrypted: "ENC-new" }));

    const [a, b] = await Promise.all([
      refresh({ accountId: "user-1", provider: "slack" }),
      refresh({ accountId: "user-1", provider: "slack" }),
    ]);

    expect(providerInvocations).toBe(1);
    expect(a.integration.accessTokenEncrypted).toBe("ENC-new");
    expect(b.integration.accessTokenEncrypted).toBe("ENC-new");
    // Lookup happens once (inside the locked section).
    expect(mockGetActiveForExecution).toHaveBeenCalledTimes(1);
    expect(mockUpdateTokens).toHaveBeenCalledTimes(1);
  });

  it("different accountIds run independently (no collapsing)", async () => {
    mockGetActiveForExecution
      .mockResolvedValueOnce(makeRow({ providerAccountId: "T-A" }))
      .mockResolvedValueOnce(makeRow({ providerAccountId: "T-B" }));
    mockSlackRefreshToken.mockResolvedValue({
      accessTokenEncrypted: "ENC-x",
      refreshTokenEncrypted: "ENC-y",
      accessTokenExpiresAt: null,
      scopes: [],
    });
    mockUpdateTokens.mockResolvedValue(makeRow());

    await Promise.all([
      refresh({ accountId: "user-1", provider: "slack", providerAccountId: "T-A" }),
      refresh({ accountId: "user-1", provider: "slack", providerAccountId: "T-B" }),
    ]);

    expect(mockSlackRefreshToken).toHaveBeenCalledTimes(2);
    expect(mockGetActiveForExecution).toHaveBeenCalledTimes(2);
  });
});
