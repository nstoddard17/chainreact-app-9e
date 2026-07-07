/**
 * @jest-environment node
 *
 * Tests for services/oauth/refreshAndRetry — the reactive refresh-and-
 * retry wrapper handlers wrap their principal outbound calls in. Mocks the
 * cross-instance claim wrapper (refreshWithClaim — Phase 8, which delegates
 * to the dispatcher) and the integrations repo so we can drive every
 * branch (200, 401-then-200, 401-then-401, refresh-not-supported,
 * non-401-error, concurrent-401-coalesce).
 */
import { RefreshNotSupportedError } from "@/contracts/integration";

const mockGetActiveForExecution = jest.fn();
const mockRefreshWithClaim = jest.fn();
const mockMarkNeedsReconnect = jest.fn();
const mockNotifyReconnectNeeded = jest.fn();

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: mockGetActiveForExecution,
  markNeedsReconnect: mockMarkNeedsReconnect,
  updateTokens: jest.fn(),
  upsertActive: jest.fn(),
}));

// Phase 8 / OAUTH-REFRESH-RELIABILITY-1: refreshAndRetry now routes refresh
// through the cross-instance claim wrapper (which itself delegates to the
// dispatcher). This suite mocks the wrapper seam; the wrapper's own claim /
// peer-wait behavior is covered in refreshWithClaim.test.ts.
jest.mock("@/services/oauth/refreshWithClaim", () => ({
  refreshWithClaim: mockRefreshWithClaim,
}));

jest.mock("@/services/integrations/reconnectNotification", () => ({
  notifyReconnectNeeded: mockNotifyReconnectNeeded,
}));

jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: jest.fn((enc: string) => enc.replace(/^ENC-/, "")),
  encryptToken: jest.fn((p: string) => `ENC-${p}`),
}));

import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
  refreshAndRetry,
} from "@/services/oauth/refreshAndRetry";

beforeEach(() => {
  mockGetActiveForExecution.mockReset();
  mockRefreshWithClaim.mockReset();
  mockMarkNeedsReconnect.mockReset();
  mockNotifyReconnectNeeded.mockReset();
  // Default: a first-mark transition (NULL → now) so the one-shot notify fires.
  mockMarkNeedsReconnect.mockResolvedValue(true);
  mockNotifyReconnectNeeded.mockResolvedValue(undefined);
});

function makeRow(accessEnc: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "int-1",
    userId: "user-1",
    provider: "gmail",
    providerAccountId: "alice@example.com",
    displayName: "Alice",
    accessTokenEncrypted: accessEnc,
    refreshTokenEncrypted: "ENC-refresh-token",
    accessTokenExpiresAt: null,
    scopes: ["gmail.send"],
    accountMetadata: {},
    disconnectedAt: null,
    createdAt: "2026-05-07T00:00:00Z",
    updatedAt: "2026-05-07T00:00:00Z",
    ...overrides,
  };
}

describe("refreshAndRetry — happy path (no 401)", () => {
  it("runs apiCall once with the decrypted access token and returns the result", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeRow("ENC-fresh"));
    const apiCall = jest.fn().mockResolvedValue({ messageId: "m-1" });

    const result = await refreshAndRetry({
      accountId: "user-1",
      provider: "gmail",
      apiCall,
    });

    expect(apiCall).toHaveBeenCalledTimes(1);
    expect(apiCall).toHaveBeenCalledWith("fresh"); // ENC- prefix stripped by mock decrypt
    expect(mockRefreshWithClaim).not.toHaveBeenCalled();
    expect(result).toEqual({ messageId: "m-1" });
  });

  it("non-401 errors propagate untouched (no refresh)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeRow("ENC-tok"));
    const apiCall = jest.fn().mockRejectedValue(new Error("HTTP 500 service unavailable"));

    await expect(
      refreshAndRetry({ accountId: "user-1", provider: "gmail", apiCall }),
    ).rejects.toThrow(/HTTP 500/);
    expect(mockRefreshWithClaim).not.toHaveBeenCalled();
    expect(apiCall).toHaveBeenCalledTimes(1);
  });
});

describe("refreshAndRetry — 401 → refresh + retry", () => {
  it("401 → refresh succeeds → retry with new token returns 200", async () => {
    mockGetActiveForExecution
      .mockResolvedValueOnce(makeRow("ENC-stale"))   // initial lookup
      .mockResolvedValueOnce(makeRow("ENC-fresh"));  // post-refresh refetch
    mockRefreshWithClaim.mockResolvedValueOnce({
      integration: makeRow("ENC-fresh"),
    });
    const apiCall = jest
      .fn()
      .mockRejectedValueOnce(new Unauthorized401Error())
      .mockResolvedValueOnce({ ok: true });

    const result = await refreshAndRetry({
      accountId: "user-1",
      provider: "gmail",
      apiCall,
    });

    expect(result).toEqual({ ok: true });
    expect(apiCall).toHaveBeenCalledTimes(2);
    expect(apiCall).toHaveBeenNthCalledWith(1, "stale");
    expect(apiCall).toHaveBeenNthCalledWith(2, "fresh");
    expect(mockRefreshWithClaim).toHaveBeenCalledTimes(1);
    expect(mockRefreshWithClaim).toHaveBeenCalledWith({
      accountId: "user-1",
      provider: "gmail",
      providerAccountId: null,
      // 22B: no engine context here → no provenance pin (null).
      connectedByUserId: null,
    });
  });

  it("401 → refresh succeeds → retry STILL 401 → throws IntegrationActionRequiredError(refresh_failed)", async () => {
    mockGetActiveForExecution
      .mockResolvedValueOnce(makeRow("ENC-stale"))
      .mockResolvedValueOnce(makeRow("ENC-fresh"));
    mockRefreshWithClaim.mockResolvedValueOnce({ integration: makeRow("ENC-fresh") });
    const apiCall = jest
      .fn()
      .mockRejectedValueOnce(new Unauthorized401Error())
      .mockRejectedValueOnce(new Unauthorized401Error("still 401"));

    await expect(
      refreshAndRetry({ accountId: "user-1", provider: "gmail", apiCall }),
    ).rejects.toMatchObject({
      name: "IntegrationActionRequiredError",
      reason: "refresh_failed",
      provider: "gmail",
      accountId: "user-1",
    });
    expect(apiCall).toHaveBeenCalledTimes(2);
  });

  it("threads accountId through both the lookup AND the refresh call", async () => {
    mockGetActiveForExecution
      .mockResolvedValueOnce(makeRow("ENC-stale"))
      .mockResolvedValueOnce(makeRow("ENC-fresh"));
    mockRefreshWithClaim.mockResolvedValueOnce({ integration: makeRow("ENC-fresh") });
    const apiCall = jest
      .fn()
      .mockRejectedValueOnce(new Unauthorized401Error())
      .mockResolvedValueOnce("ok");

    await refreshAndRetry({
      accountId: "user-1",
      provider: "gmail",
      providerAccountId: "alice@example.com",
      apiCall,
    });

    // 22B: 4th opts arg is undefined here (no engine context → no pin).
    expect(mockGetActiveForExecution).toHaveBeenNthCalledWith(
      1,
      "user-1",
      "gmail",
      "alice@example.com",
      undefined,
    );
    expect(mockGetActiveForExecution).toHaveBeenNthCalledWith(
      2,
      "user-1",
      "gmail",
      "alice@example.com",
      undefined,
    );
    expect(mockRefreshWithClaim).toHaveBeenCalledWith({
      accountId: "user-1",
      provider: "gmail",
      providerAccountId: "alice@example.com",
      connectedByUserId: null,
    });
  });
});

describe("refreshAndRetry — refresh-not-supported provider (Slack-shaped path)", () => {
  it("translates RefreshNotSupportedError into IntegrationActionRequiredError(refresh_not_supported)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeRow("ENC-tok", { provider: "slack" }));
    mockRefreshWithClaim.mockRejectedValueOnce(new RefreshNotSupportedError("slack"));
    const apiCall = jest.fn().mockRejectedValue(new Unauthorized401Error());

    await expect(
      refreshAndRetry({ accountId: "user-1", provider: "slack", apiCall }),
    ).rejects.toMatchObject({
      name: "IntegrationActionRequiredError",
      reason: "refresh_not_supported",
      provider: "slack",
      accountId: "user-1",
    });
    expect(apiCall).toHaveBeenCalledTimes(1); // no retry attempted
  });

  it("translates other refresh errors into IntegrationActionRequiredError(refresh_failed)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeRow("ENC-tok"));
    mockRefreshWithClaim.mockRejectedValueOnce(new Error("provider 503"));
    const apiCall = jest.fn().mockRejectedValue(new Unauthorized401Error());

    await expect(
      refreshAndRetry({ accountId: "user-1", provider: "gmail", apiCall }),
    ).rejects.toMatchObject({
      name: "IntegrationActionRequiredError",
      reason: "refresh_failed",
    });
    // CS-APPS-RECOVERY-1 req 3: a generic (possibly transient) refresh failure
    // does NOT flip the row to reconnect-needed (the durable dead-grant subcase is
    // marked by the dispatcher, not here).
    expect(mockMarkNeedsReconnect).not.toHaveBeenCalled();
    expect(mockNotifyReconnectNeeded).not.toHaveBeenCalled();
  });
});

// ─── CS-APPS-RECOVERY-1 — execution-seam reconnect-needed signal ─────────────

describe("refreshAndRetry — reconnect-needed signal (CS-APPS-RECOVERY-1)", () => {
  it("marks + notifies on the non-refreshable action-required path (refresh_not_supported)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(
      makeRow("ENC-tok", { provider: "slack", id: "int-slack" }),
    );
    mockRefreshWithClaim.mockRejectedValueOnce(new RefreshNotSupportedError("slack"));
    const apiCall = jest.fn().mockRejectedValue(new Unauthorized401Error());

    await expect(
      refreshAndRetry({ accountId: "user-1", provider: "slack", apiCall }),
    ).rejects.toMatchObject({ name: "IntegrationActionRequiredError", reason: "refresh_not_supported" });

    expect(mockMarkNeedsReconnect).toHaveBeenCalledTimes(1);
    expect(mockMarkNeedsReconnect).toHaveBeenCalledWith("int-slack"); // the SAME row, by id
    expect(mockNotifyReconnectNeeded).toHaveBeenCalledTimes(1);
    expect(mockNotifyReconnectNeeded.mock.calls[0]![0]).toMatchObject({ id: "int-slack" });
  });

  it("marks + notifies when refresh succeeds but the retry STILL returns 401 (refresh_failed)", async () => {
    mockGetActiveForExecution
      .mockResolvedValueOnce(makeRow("ENC-stale", { id: "int-9" })) // initial
      .mockResolvedValueOnce(makeRow("ENC-fresh", { id: "int-9" })); // post-refresh refetch
    mockRefreshWithClaim.mockResolvedValueOnce({ integration: makeRow("ENC-fresh", { id: "int-9" }) });
    const apiCall = jest
      .fn()
      .mockRejectedValueOnce(new Unauthorized401Error())
      .mockRejectedValueOnce(new Unauthorized401Error("still 401"));

    await expect(
      refreshAndRetry({ accountId: "user-1", provider: "gmail", apiCall }),
    ).rejects.toMatchObject({ name: "IntegrationActionRequiredError", reason: "refresh_failed" });

    expect(mockMarkNeedsReconnect).toHaveBeenCalledTimes(1);
    expect(mockMarkNeedsReconnect).toHaveBeenCalledWith("int-9"); // the refetched same-pin row
    expect(mockNotifyReconnectNeeded).toHaveBeenCalledTimes(1);
  });

  it("does NOT mark on a transient (non-401) apiCall error", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeRow("ENC-tok"));
    const apiCall = jest.fn().mockRejectedValue(new Error("HTTP 503 service unavailable"));

    await expect(
      refreshAndRetry({ accountId: "user-1", provider: "gmail", apiCall }),
    ).rejects.toThrow(/HTTP 503/);

    expect(mockRefreshWithClaim).not.toHaveBeenCalled();
    expect(mockMarkNeedsReconnect).not.toHaveBeenCalled();
    expect(mockNotifyReconnectNeeded).not.toHaveBeenCalled();
  });

  it("does NOT notify twice when the row is already marked (no first-mark transition)", async () => {
    mockMarkNeedsReconnect.mockResolvedValue(false); // already reconnect-needed
    mockGetActiveForExecution.mockResolvedValueOnce(makeRow("ENC-tok", { provider: "slack" }));
    mockRefreshWithClaim.mockRejectedValueOnce(new RefreshNotSupportedError("slack"));
    const apiCall = jest.fn().mockRejectedValue(new Unauthorized401Error());

    await expect(
      refreshAndRetry({ accountId: "user-1", provider: "slack", apiCall }),
    ).rejects.toMatchObject({ reason: "refresh_not_supported" });

    expect(mockMarkNeedsReconnect).toHaveBeenCalledTimes(1); // mark attempted (idempotent)
    expect(mockNotifyReconnectNeeded).not.toHaveBeenCalled(); // but no re-notify
  });

  it("a markNeedsReconnect failure NEVER masks the original IntegrationActionRequiredError", async () => {
    mockMarkNeedsReconnect.mockRejectedValue(new Error("db write boom"));
    mockGetActiveForExecution.mockResolvedValueOnce(makeRow("ENC-tok", { provider: "slack" }));
    mockRefreshWithClaim.mockRejectedValueOnce(new RefreshNotSupportedError("slack"));
    const apiCall = jest.fn().mockRejectedValue(new Unauthorized401Error());

    await expect(
      refreshAndRetry({ accountId: "user-1", provider: "slack", apiCall }),
    ).rejects.toMatchObject({ name: "IntegrationActionRequiredError", reason: "refresh_not_supported" });
  });

  it("a notifyReconnectNeeded failure NEVER masks the original IntegrationActionRequiredError", async () => {
    mockNotifyReconnectNeeded.mockRejectedValue(new Error("notify boom"));
    mockGetActiveForExecution.mockResolvedValueOnce(makeRow("ENC-tok", { provider: "slack" }));
    mockRefreshWithClaim.mockRejectedValueOnce(new RefreshNotSupportedError("slack"));
    const apiCall = jest.fn().mockRejectedValue(new Unauthorized401Error());

    await expect(
      refreshAndRetry({ accountId: "user-1", provider: "slack", apiCall }),
    ).rejects.toMatchObject({ name: "IntegrationActionRequiredError", reason: "refresh_not_supported" });
  });

  it("targets exactly the integration row from the execution context (per-row, not provider-wide)", async () => {
    // A distinct row id proves the mark is keyed on the resolved execution row.
    mockGetActiveForExecution.mockResolvedValueOnce(
      makeRow("ENC-tok", { provider: "discord", id: "int-discord-42" }),
    );
    mockRefreshWithClaim.mockRejectedValueOnce(new RefreshNotSupportedError("discord"));
    const apiCall = jest.fn().mockRejectedValue(new Unauthorized401Error());

    await expect(
      refreshAndRetry({ accountId: "acct-1", provider: "discord", apiCall }),
    ).rejects.toMatchObject({ reason: "refresh_not_supported" });

    expect(mockMarkNeedsReconnect).toHaveBeenCalledTimes(1);
    expect(mockMarkNeedsReconnect).toHaveBeenCalledWith("int-discord-42");
  });
});

describe("refreshAndRetry — error class shape", () => {
  it("IntegrationActionRequiredError carries cause through Error.cause", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeRow("ENC-tok"));
    const upstream = new Error("network down");
    mockRefreshWithClaim.mockRejectedValueOnce(upstream);
    const apiCall = jest.fn().mockRejectedValue(new Unauthorized401Error());

    try {
      await refreshAndRetry({ accountId: "user-1", provider: "gmail", apiCall });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(IntegrationActionRequiredError);
      expect((err as IntegrationActionRequiredError).cause).toBe(upstream);
    }
  });
});

describe("refreshAndRetry — missing integration", () => {
  it("throws clear error when no active integration exists at lookup", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    const apiCall = jest.fn();
    await expect(
      refreshAndRetry({ accountId: "user-1", provider: "gmail", apiCall }),
    ).rejects.toThrow(/no active integration/i);
    expect(apiCall).not.toHaveBeenCalled();
    expect(mockRefreshWithClaim).not.toHaveBeenCalled();
  });

  it("throws when integration disappears between refresh and retry", async () => {
    mockGetActiveForExecution
      .mockResolvedValueOnce(makeRow("ENC-stale"))
      .mockResolvedValueOnce(null); // disappeared post-refresh
    mockRefreshWithClaim.mockResolvedValueOnce({ integration: makeRow("ENC-fresh") });
    const apiCall = jest.fn().mockRejectedValueOnce(new Unauthorized401Error());

    await expect(
      refreshAndRetry({ accountId: "user-1", provider: "gmail", apiCall }),
    ).rejects.toThrow(/disappeared between refresh and retry/i);
  });
});

// ─── Slice 3.SEC-14 — preflight hook ────────────────────────────────────────

describe("refreshAndRetry — preflight hook (Slice 3.SEC-14)", () => {
  it("invokes the preflight ONCE with the initial integration row before apiCall", async () => {
    const row = makeRow("ENC-tok", { accountMetadata: { livemode: true } });
    mockGetActiveForExecution.mockResolvedValueOnce(row);
    const apiCall = jest.fn().mockResolvedValue("ok");
    const preflight = jest.fn();

    const result = await refreshAndRetry({
      accountId: "user-1",
      provider: "stripe",
      apiCall,
      preflight,
    });

    expect(result).toBe("ok");
    expect(preflight).toHaveBeenCalledTimes(1);
    expect(preflight).toHaveBeenCalledWith(row);
    expect(apiCall).toHaveBeenCalledTimes(1);
    // Ordering check: preflight runs before the first apiCall.
    expect(preflight.mock.invocationCallOrder[0]).toBeLessThan(
      apiCall.mock.invocationCallOrder[0]!,
    );
  });

  it("propagates preflight throw verbatim and never invokes apiCall", async () => {
    const row = makeRow("ENC-tok");
    mockGetActiveForExecution.mockResolvedValueOnce(row);
    const apiCall = jest.fn();
    const policyError = new Error("STRIPE_LIVEMODE_UNKNOWN");
    const preflight = jest.fn(() => {
      throw policyError;
    });

    await expect(
      refreshAndRetry({
        accountId: "user-1",
        provider: "stripe",
        apiCall,
        preflight,
      }),
    ).rejects.toBe(policyError);

    expect(apiCall).not.toHaveBeenCalled();
    expect(mockRefreshWithClaim).not.toHaveBeenCalled();
  });

  it("does NOT re-invoke preflight on the 401 → refresh → retry path", async () => {
    // The post-refresh refetch returns the same row shape (refresh
    // rotates only the access token, not account_metadata). The
    // preflight is invoked exactly once with the initial row, BEFORE
    // any apiCall. If a future change moves preflight into the retry
    // path, this test surfaces the regression — concurrent retries
    // shouldn't pay the policy cost twice.
    const initialRow = makeRow("ENC-stale", {
      accountMetadata: { livemode: true },
    });
    const refreshedRow = makeRow("ENC-fresh", {
      accountMetadata: { livemode: true },
    });
    mockGetActiveForExecution
      .mockResolvedValueOnce(initialRow)
      .mockResolvedValueOnce(refreshedRow);
    mockRefreshWithClaim.mockResolvedValueOnce({ integration: refreshedRow });
    const apiCall = jest
      .fn()
      .mockRejectedValueOnce(new Unauthorized401Error())
      .mockResolvedValueOnce({ ok: true });
    const preflight = jest.fn();

    const result = await refreshAndRetry({
      accountId: "user-1",
      provider: "stripe",
      apiCall,
      preflight,
    });

    expect(result).toEqual({ ok: true });
    expect(preflight).toHaveBeenCalledTimes(1);
    expect(preflight).toHaveBeenCalledWith(initialRow);
    expect(apiCall).toHaveBeenCalledTimes(2);
  });

  it("is a no-op when no preflight is provided (backward compat)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(makeRow("ENC-tok"));
    const apiCall = jest.fn().mockResolvedValue("ok");
    const result = await refreshAndRetry({
      accountId: "user-1",
      provider: "gmail",
      apiCall,
    });
    expect(result).toBe("ok");
    expect(apiCall).toHaveBeenCalledTimes(1);
  });

  it("preflight runs after the missing-integration check (preflight never sees null)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    const apiCall = jest.fn();
    const preflight = jest.fn();
    await expect(
      refreshAndRetry({
        accountId: "user-1",
        provider: "stripe",
        apiCall,
        preflight,
      }),
    ).rejects.toThrow(/no active integration/i);
    expect(preflight).not.toHaveBeenCalled();
    expect(apiCall).not.toHaveBeenCalled();
  });
});
