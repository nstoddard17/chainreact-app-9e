/**
 * @jest-environment node
 *
 * Tests for services/integrations/tokenRefreshSweep — the proactive OAuth
 * token refresh cron's service (Phase 8 / OAUTH-REFRESH-RELIABILITY-1).
 *
 * Mocks the repositories, the claim wrapper, and the reconnect notification;
 * uses the REAL provider registry so refreshable/non-refreshable
 * classification is the actual manifest truth (gmail refreshable, slack not) —
 * business behavior, not a mocked flag.
 */

const mockListRefreshDue = jest.fn();
const mockMarkNeedsReconnect = jest.fn();
const mockGetByIdForAccountServiceRole = jest.fn();
const mockRefreshWithClaim = jest.fn();
const mockNotifyReconnectNeeded = jest.fn();

jest.mock("@/repositories/integrationsRefresh", () => ({
  listRefreshDueServiceRole: mockListRefreshDue,
}));

jest.mock("@/repositories/integrations", () => ({
  markNeedsReconnect: mockMarkNeedsReconnect,
  getByIdForAccountServiceRole: mockGetByIdForAccountServiceRole,
}));

jest.mock("@/services/oauth/refreshWithClaim", () => ({
  refreshWithClaim: mockRefreshWithClaim,
}));

jest.mock("@/services/integrations/reconnectNotification", () => ({
  notifyReconnectNeeded: mockNotifyReconnectNeeded,
}));

import {
  RefreshAuthRequiredError,
  RefreshNotSupportedError,
} from "@/contracts/integration";
import { AccountFrozenError } from "@/services/accounts/accountFreeze";
import { runTokenRefreshSweep } from "@/services/integrations/tokenRefreshSweep";

beforeEach(() => {
  mockListRefreshDue.mockReset();
  mockMarkNeedsReconnect.mockReset();
  mockMarkNeedsReconnect.mockResolvedValue(true);
  mockGetByIdForAccountServiceRole.mockReset();
  mockGetByIdForAccountServiceRole.mockResolvedValue({
    id: "int-1",
    accountId: "acct-1",
    connectedByUserId: "user-1",
    provider: "gmail",
    providerAccountId: "alice@example.com",
  });
  mockRefreshWithClaim.mockReset();
  mockNotifyReconnectNeeded.mockReset();
  mockNotifyReconnectNeeded.mockResolvedValue(undefined);
});

function dueRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "int-1",
    accountId: "acct-1",
    provider: "gmail",
    providerAccountId: "alice@example.com",
    connectedByUserId: "user-1",
    hasRefreshToken: true,
    // Expires 10 minutes from now — inside the window, not yet expired.
    accessTokenExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    ...overrides,
  };
}

describe("tokenRefreshSweep — proactive refresh", () => {
  it("refreshes a refreshable row expiring soon through the claim wrapper", async () => {
    mockListRefreshDue.mockResolvedValue([dueRow()]);
    mockRefreshWithClaim.mockResolvedValue({ integration: {} });

    const result = await runTokenRefreshSweep({ limit: 100 });

    expect(result).toMatchObject({ due: 1, scanned: 1, refreshed: 1, failed: 0 });
    expect(mockRefreshWithClaim).toHaveBeenCalledTimes(1);
    expect(mockRefreshWithClaim).toHaveBeenCalledWith({
      accountId: "acct-1",
      provider: "gmail",
      providerAccountId: "alice@example.com",
      // gmail is a PERSONAL-credential provider → pinned to its connector so
      // the claim/lock key matches the reactive path's key.
      connectedByUserId: "user-1",
    });
    expect(mockMarkNeedsReconnect).not.toHaveBeenCalled();
  });

  it("refreshes an ALREADY-EXPIRED refreshable row too (idle-recovery)", async () => {
    mockListRefreshDue.mockResolvedValue([
      dueRow({ accessTokenExpiresAt: new Date(Date.now() - 3 * 86_400_000).toISOString() }),
    ]);
    mockRefreshWithClaim.mockResolvedValue({ integration: {} });

    const result = await runTokenRefreshSweep({ limit: 100 });

    expect(result.refreshed).toBe(1);
    expect(mockMarkNeedsReconnect).not.toHaveBeenCalled();
  });

  it("does NOT pin account-shared providers to a connector (slack-shaped key parity)", async () => {
    // hubspot is refreshable AND account-shared → connectedByUserId must be null.
    mockListRefreshDue.mockResolvedValue([
      dueRow({ provider: "hubspot", connectedByUserId: "user-9" }),
    ]);
    mockRefreshWithClaim.mockResolvedValue({ integration: {} });

    await runTokenRefreshSweep({ limit: 100 });

    expect(mockRefreshWithClaim).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "hubspot", connectedByUserId: null }),
    );
  });
});

describe("tokenRefreshSweep — non-refreshable providers", () => {
  it("skips manifest-non-refreshable rows without refreshing or marking them broken", async () => {
    // Real registry truth: slack is refreshable:false.
    mockListRefreshDue.mockResolvedValue([dueRow({ provider: "slack" })]);

    const result = await runTokenRefreshSweep({ limit: 100 });

    expect(result).toMatchObject({ skippedNonRefreshable: 1, refreshed: 0, actionRequired: 0 });
    expect(mockRefreshWithClaim).not.toHaveBeenCalled();
    expect(mockMarkNeedsReconnect).not.toHaveBeenCalled();
    expect(mockNotifyReconnectNeeded).not.toHaveBeenCalled();
  });

  it("counts a manifest/module mismatch (RefreshNotSupported despite refreshable manifest) honestly, without marking", async () => {
    mockListRefreshDue.mockResolvedValue([dueRow()]);
    mockRefreshWithClaim.mockRejectedValue(new RefreshNotSupportedError("gmail"));

    const result = await runTokenRefreshSweep({ limit: 100 });

    expect(result).toMatchObject({ skippedNonRefreshable: 1, failed: 0, actionRequired: 0 });
    expect(mockMarkNeedsReconnect).not.toHaveBeenCalled();
  });
});

describe("tokenRefreshSweep — refreshable rows without a refresh token", () => {
  it("expiring-soon (not yet expired): counted only, never marked", async () => {
    mockListRefreshDue.mockResolvedValue([dueRow({ hasRefreshToken: false })]);

    const result = await runTokenRefreshSweep({ limit: 100 });

    expect(result).toMatchObject({ skippedNoRefreshToken: 1, actionRequired: 0 });
    expect(mockRefreshWithClaim).not.toHaveBeenCalled();
    expect(mockMarkNeedsReconnect).not.toHaveBeenCalled();
  });

  it("ALREADY expired: durable dead end → one-shot mark + notify the connector once", async () => {
    mockListRefreshDue.mockResolvedValue([
      dueRow({
        hasRefreshToken: false,
        accessTokenExpiresAt: new Date(Date.now() - 60_000).toISOString(),
      }),
    ]);

    const result = await runTokenRefreshSweep({ limit: 100 });

    expect(result).toMatchObject({ actionRequired: 1, markedNeedsReconnect: 1 });
    expect(mockMarkNeedsReconnect).toHaveBeenCalledWith("int-1");
    expect(mockNotifyReconnectNeeded).toHaveBeenCalledTimes(1);
    expect(mockRefreshWithClaim).not.toHaveBeenCalled();
  });

  it("already-marked rows do not re-notify (no first-mark transition)", async () => {
    mockMarkNeedsReconnect.mockResolvedValue(false);
    mockListRefreshDue.mockResolvedValue([
      dueRow({
        hasRefreshToken: false,
        accessTokenExpiresAt: new Date(Date.now() - 60_000).toISOString(),
      }),
    ]);

    const result = await runTokenRefreshSweep({ limit: 100 });

    expect(result).toMatchObject({ actionRequired: 1, markedNeedsReconnect: 0 });
    expect(mockNotifyReconnectNeeded).not.toHaveBeenCalled();
  });
});

describe("tokenRefreshSweep — provider refresh failures", () => {
  it("invalid_grant (RefreshAuthRequiredError) → actionRequired; the sweep itself never re-marks (dispatcher owns it) and never wipes tokens", async () => {
    mockListRefreshDue.mockResolvedValue([dueRow()]);
    mockRefreshWithClaim.mockRejectedValue(new RefreshAuthRequiredError("gmail", "invalid_grant"));

    const result = await runTokenRefreshSweep({ limit: 100 });

    expect(result).toMatchObject({ actionRequired: 1, markedNeedsReconnect: 0, failed: 0 });
    // The dispatcher already marked + notified inside the refresh path — the
    // sweep must not double-mark or double-notify.
    expect(mockMarkNeedsReconnect).not.toHaveBeenCalled();
    expect(mockNotifyReconnectNeeded).not.toHaveBeenCalled();
  });

  it("provider 500/timeout → transient failure: no mark, no notify, row retried next tick", async () => {
    mockListRefreshDue.mockResolvedValue([dueRow()]);
    mockRefreshWithClaim.mockRejectedValue(new Error("Google token refresh failed: HTTP 500"));

    const result = await runTokenRefreshSweep({ limit: 100 });

    expect(result).toMatchObject({ failed: 1, actionRequired: 0 });
    expect(mockMarkNeedsReconnect).not.toHaveBeenCalled();
    expect(mockNotifyReconnectNeeded).not.toHaveBeenCalled();
  });

  it("frozen account (pending deletion) → skippedFrozen, not a failure", async () => {
    mockListRefreshDue.mockResolvedValue([dueRow()]);
    mockRefreshWithClaim.mockRejectedValue(new AccountFrozenError("acct-1"));

    const result = await runTokenRefreshSweep({ limit: 100 });

    expect(result).toMatchObject({ skippedFrozen: 1, failed: 0 });
    expect(mockMarkNeedsReconnect).not.toHaveBeenCalled();
  });

  it("one row's failure never aborts the batch (mixed outcomes tally independently)", async () => {
    mockListRefreshDue.mockResolvedValue([
      dueRow({ id: "int-a" }),
      dueRow({ id: "int-b", provider: "slack" }),
      dueRow({ id: "int-c" }),
    ]);
    mockRefreshWithClaim
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ integration: {} });

    const result = await runTokenRefreshSweep({ limit: 100 });

    expect(result).toMatchObject({
      due: 3,
      scanned: 3,
      refreshed: 1,
      failed: 1,
      skippedNonRefreshable: 1,
    });
  });
});

describe("tokenRefreshSweep — no-leak", () => {
  it("never logs or returns token material; result is numeric counts only", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      // Drive every logging branch: no-token-expired, invalid_grant, mismatch,
      // transient. (The DTO itself is token-free by construction — this guards
      // against future fields leaking through logs.)
      mockListRefreshDue.mockResolvedValue([
        dueRow({
          id: "int-a",
          hasRefreshToken: false,
          accessTokenExpiresAt: new Date(Date.now() - 60_000).toISOString(),
        }),
        dueRow({ id: "int-b" }),
        dueRow({ id: "int-c" }),
        dueRow({ id: "int-d" }),
      ]);
      mockRefreshWithClaim
        .mockRejectedValueOnce(new RefreshAuthRequiredError("gmail", "invalid_grant"))
        .mockRejectedValueOnce(new RefreshNotSupportedError("gmail"))
        .mockRejectedValueOnce(new Error("secret-bearer-token-abc123 leaked in message"));

      const result = await runTokenRefreshSweep({ limit: 100 });

      // Result object: every value is a number (counts only).
      for (const v of Object.values(result)) {
        expect(typeof v).toBe("number");
      }

      const allLogged = [...warnSpy.mock.calls, ...infoSpy.mock.calls, ...errorSpy.mock.calls]
        .flat()
        .map(String)
        .join("\n");
      // Error messages (which may carry provider text) are never logged —
      // only fixed event names + id + provider + category.
      expect(allLogged).not.toContain("secret-bearer-token-abc123");
      expect(allLogged).not.toMatch(/refresh_token_encrypted|accessTokenEncrypted|Bearer /);
      for (const line of [...warnSpy.mock.calls].map((c) => String(c[0]))) {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        expect(Object.keys(parsed).sort()).toEqual(
          expect.arrayContaining(["event", "integrationId", "provider"]),
        );
        expect(
          Object.keys(parsed).every((k) =>
            ["event", "integrationId", "provider", "category"].includes(k),
          ),
        ).toBe(true);
      }
    } finally {
      warnSpy.mockRestore();
      infoSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});

describe("tokenRefreshSweep — selection window", () => {
  it("passes a now+window cutoff and the limit to the due query", async () => {
    mockListRefreshDue.mockResolvedValue([]);
    const before = Date.now();

    await runTokenRefreshSweep({ limit: 42, windowMinutes: 30 });

    const args = mockListRefreshDue.mock.calls[0]![0];
    expect(args.limit).toBe(42);
    const cutoff = Date.parse(args.dueBeforeIso);
    expect(cutoff).toBeGreaterThanOrEqual(before + 29 * 60_000);
    expect(cutoff).toBeLessThanOrEqual(Date.now() + 31 * 60_000);
  });
});
