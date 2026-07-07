/**
 * @jest-environment node
 *
 * Tests for services/oauth/refreshWithClaim — the cross-instance single-flight
 * wrapper around the dispatcher's refresh (Phase 8 / OAUTH-REFRESH-
 * RELIABILITY-1). Mocks the repositories and the dispatcher so we can drive
 * claim-won / claim-lost / peer-finishes / peer-stalls / delegation branches.
 * Business behavior proven, not call counts alone: the loser NEVER reaches the
 * provider and comes back with the winner's persisted token.
 */

const mockGetActiveForExecution = jest.fn();
const mockGetByIdForAccountServiceRole = jest.fn();
const mockClaimRefresh = jest.fn();
const mockReleaseRefreshClaim = jest.fn();
const mockDispatcherRefresh = jest.fn();

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: mockGetActiveForExecution,
  getByIdForAccountServiceRole: mockGetByIdForAccountServiceRole,
}));

jest.mock("@/repositories/integrationsRefresh", () => ({
  claimRefresh: mockClaimRefresh,
  releaseRefreshClaim: mockReleaseRefreshClaim,
}));

jest.mock("@/services/oauth/dispatcher", () => ({
  refresh: mockDispatcherRefresh,
}));

import { __resetRefreshLockForTests } from "@/services/oauth/refreshLock";
import { refreshWithClaim } from "@/services/oauth/refreshWithClaim";

beforeEach(() => {
  __resetRefreshLockForTests();
  mockGetActiveForExecution.mockReset();
  mockGetByIdForAccountServiceRole.mockReset();
  mockClaimRefresh.mockReset();
  mockReleaseRefreshClaim.mockReset();
  mockReleaseRefreshClaim.mockResolvedValue(undefined);
  mockDispatcherRefresh.mockReset();
});

function makeRow(accessEnc: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "int-1",
    accountId: "acct-1",
    connectedByUserId: "user-1",
    provider: "gmail",
    providerAccountId: "alice@example.com",
    displayName: "Alice",
    accessTokenEncrypted: accessEnc,
    refreshTokenEncrypted: "ENC-refresh-token",
    accessTokenExpiresAt: "2026-07-07T00:00:00Z",
    scopes: ["gmail.send"],
    accountMetadata: {},
    disconnectedAt: null,
    needsReconnectAt: null,
    createdAt: "2026-05-07T00:00:00Z",
    updatedAt: "2026-05-07T00:00:00Z",
    ...overrides,
  };
}

const INPUT = {
  accountId: "acct-1",
  provider: "gmail",
  providerAccountId: "alice@example.com",
  connectedByUserId: null,
};

describe("refreshWithClaim — claim won", () => {
  it("claims, runs the dispatcher refresh, and releases the claim", async () => {
    mockGetActiveForExecution.mockResolvedValue(makeRow("ENC-stale"));
    mockClaimRefresh.mockResolvedValue(true);
    mockDispatcherRefresh.mockResolvedValue({ integration: makeRow("ENC-fresh") });

    const out = await refreshWithClaim(INPUT);

    expect(out.integration.accessTokenEncrypted).toBe("ENC-fresh");
    expect(mockDispatcherRefresh).toHaveBeenCalledTimes(1);
    expect(mockClaimRefresh).toHaveBeenCalledTimes(1);
    const claimArgs = mockClaimRefresh.mock.calls[0]![0];
    expect(claimArgs.integrationId).toBe("int-1");
    expect(typeof claimArgs.claimId).toBe("string");
    expect(mockReleaseRefreshClaim).toHaveBeenCalledWith({
      integrationId: "int-1",
      claimId: claimArgs.claimId,
    });
    // Ordering: claim → refresh → release.
    expect(mockClaimRefresh.mock.invocationCallOrder[0]).toBeLessThan(
      mockDispatcherRefresh.mock.invocationCallOrder[0]!,
    );
    expect(mockDispatcherRefresh.mock.invocationCallOrder[0]).toBeLessThan(
      mockReleaseRefreshClaim.mock.invocationCallOrder[0]!,
    );
  });

  it("releases the claim even when the dispatcher refresh throws, and rethrows verbatim", async () => {
    mockGetActiveForExecution.mockResolvedValue(makeRow("ENC-stale"));
    mockClaimRefresh.mockResolvedValue(true);
    const boom = new Error("provider 503");
    mockDispatcherRefresh.mockRejectedValue(boom);

    await expect(refreshWithClaim(INPUT)).rejects.toBe(boom);
    expect(mockReleaseRefreshClaim).toHaveBeenCalledTimes(1);
  });

  it("a release failure never masks the refresh result", async () => {
    mockGetActiveForExecution.mockResolvedValue(makeRow("ENC-stale"));
    mockClaimRefresh.mockResolvedValue(true);
    mockDispatcherRefresh.mockResolvedValue({ integration: makeRow("ENC-fresh") });
    mockReleaseRefreshClaim.mockRejectedValue(new Error("release boom"));

    const out = await refreshWithClaim(INPUT);
    expect(out.integration.accessTokenEncrypted).toBe("ENC-fresh");
  });
});

describe("refreshWithClaim — claim lost (peer instance refreshing)", () => {
  it("never calls the provider; returns the peer's refreshed row once it lands", async () => {
    mockGetActiveForExecution.mockResolvedValue(makeRow("ENC-stale"));
    mockClaimRefresh.mockResolvedValue(false);
    // First poll: unchanged. Second poll: the peer's new token landed.
    mockGetByIdForAccountServiceRole
      .mockResolvedValueOnce(makeRow("ENC-stale"))
      .mockResolvedValueOnce(makeRow("ENC-peer-fresh"));

    const out = await refreshWithClaim(INPUT);

    expect(out.integration.accessTokenEncrypted).toBe("ENC-peer-fresh");
    expect(mockDispatcherRefresh).not.toHaveBeenCalled();
    expect(mockReleaseRefreshClaim).not.toHaveBeenCalled(); // not ours to release
  }, 15_000);

  it("throws a transient error when the peer never finishes; no provider call, nothing released", async () => {
    mockGetActiveForExecution.mockResolvedValue(makeRow("ENC-stale"));
    mockClaimRefresh.mockResolvedValue(false);
    mockGetByIdForAccountServiceRole.mockResolvedValue(makeRow("ENC-stale"));

    await expect(refreshWithClaim(INPUT)).rejects.toThrow(/another refresh is in progress/i);
    expect(mockDispatcherRefresh).not.toHaveBeenCalled();
    expect(mockReleaseRefreshClaim).not.toHaveBeenCalled();
  }, 15_000);

  it("gives up cleanly when the row is disconnected mid-wait", async () => {
    mockGetActiveForExecution.mockResolvedValue(makeRow("ENC-stale"));
    mockClaimRefresh.mockResolvedValue(false);
    mockGetByIdForAccountServiceRole.mockResolvedValue(
      makeRow("ENC-stale", { disconnectedAt: "2026-07-07T01:00:00Z" }),
    );

    await expect(refreshWithClaim(INPUT)).rejects.toThrow(/another refresh is in progress/i);
    expect(mockDispatcherRefresh).not.toHaveBeenCalled();
  }, 15_000);
});

describe("refreshWithClaim — delegation (no claim needed)", () => {
  it("missing row → delegates to the dispatcher without claiming (canonical error preserved)", async () => {
    mockGetActiveForExecution.mockResolvedValue(null);
    const canonical = new Error("refresh: no active integration found for account acct-1 provider gmail.");
    mockDispatcherRefresh.mockRejectedValue(canonical);

    await expect(refreshWithClaim(INPUT)).rejects.toBe(canonical);
    expect(mockClaimRefresh).not.toHaveBeenCalled();
  });

  it("no stored refresh token → delegates without claiming (no provider call will happen)", async () => {
    mockGetActiveForExecution.mockResolvedValue(
      makeRow("ENC-tok", { refreshTokenEncrypted: null }),
    );
    const canonical = new Error("refresh: no refresh token stored on integration int-1 (provider gmail).");
    mockDispatcherRefresh.mockRejectedValue(canonical);

    await expect(refreshWithClaim(INPUT)).rejects.toBe(canonical);
    expect(mockClaimRefresh).not.toHaveBeenCalled();
  });
});

describe("refreshWithClaim — in-process coalescing preserved", () => {
  it("concurrent same-key callers collapse to ONE claim + ONE dispatcher refresh", async () => {
    mockGetActiveForExecution.mockResolvedValue(makeRow("ENC-stale"));
    mockClaimRefresh.mockResolvedValue(true);
    let resolveRefresh!: (v: unknown) => void;
    mockDispatcherRefresh.mockImplementation(
      () => new Promise((resolve) => (resolveRefresh = resolve)),
    );

    const p1 = refreshWithClaim(INPUT);
    const p2 = refreshWithClaim(INPUT);
    // Let the winner reach the (hanging) dispatcher call before resolving it.
    while (mockDispatcherRefresh.mock.calls.length === 0) {
      await new Promise((r) => setImmediate(r));
    }
    resolveRefresh({ integration: makeRow("ENC-fresh") });
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(mockClaimRefresh).toHaveBeenCalledTimes(1);
    expect(mockDispatcherRefresh).toHaveBeenCalledTimes(1);
    expect(r1.integration.accessTokenEncrypted).toBe("ENC-fresh");
    expect(r2).toBe(r1); // waiters share the winner's result
  });
});
