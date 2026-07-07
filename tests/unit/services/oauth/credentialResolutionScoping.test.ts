/**
 * @jest-environment node
 *
 * Execution credential provenance scoping (Slice 4.ACCOUNT-MODEL-22B).
 *
 * Proves the personal-credential policy at the resolution chokepoint
 * (refreshAndRetry + the engine-set context):
 *   - personal provider pins the lookup to the workflow creator,
 *   - a Team workflow by A cannot resolve B's personal credential,
 *   - missing creator credential fails clearly with NO co-member fallback,
 *   - account/service providers stay account-shared (no pin),
 *   - outside an engine context, behavior is the pre-22B account-scoped path.
 */
const mockGetActiveForExecution = jest.fn();
const mockDispatcherRefresh = jest.fn();

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...a: unknown[]) => mockGetActiveForExecution(...a),
  getByIdForAccountServiceRole: jest.fn(),
  updateTokens: jest.fn(),
  upsertActive: jest.fn(),
}));
jest.mock("@/services/oauth/dispatcher", () => ({
  refresh: (...a: unknown[]) => mockDispatcherRefresh(...a),
}));
// Phase 8: the REAL refreshWithClaim now sits between refreshAndRetry and the
// dispatcher — mock its claim repo so the wrapper always wins the claim and
// the pin-scoping assertions below still exercise the real pass-through.
jest.mock("@/repositories/integrationsRefresh", () => ({
  claimRefresh: jest.fn().mockResolvedValue(true),
  releaseRefreshClaim: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: jest.fn((enc: string) => enc.replace(/^ENC-/, "")),
  encryptToken: jest.fn((p: string) => `ENC-${p}`),
}));

import { refreshAndRetry, Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { runWithCredentialResolutionContext } from "@/services/oauth/credentialResolutionContext";

function rowFor(connectedByUserId: string) {
  return {
    id: `int-${connectedByUserId}`,
    accountId: "team-1",
    connectedByUserId,
    provider: "gmail",
    providerAccountId: `${connectedByUserId}@example.com`,
    displayName: connectedByUserId,
    accessTokenEncrypted: `ENC-token-${connectedByUserId}`,
    refreshTokenEncrypted: "ENC-refresh",
    accessTokenExpiresAt: null,
    scopes: ["gmail.send"],
    accountMetadata: {},
    disconnectedAt: null,
    createdAt: "2026-05-07T00:00:00Z",
    updatedAt: "2026-05-07T00:00:00Z",
  };
}

/** The team has A's and B's Gmail; the repo returns the row matching the pin. */
function teamWithBothGmail() {
  mockGetActiveForExecution.mockImplementation(
    (_account: string, _provider: string, _pa: string | null, opts?: { connectedByUserId?: string }) => {
      const who = opts?.connectedByUserId ?? null;
      if (who === "A") return Promise.resolve(rowFor("A"));
      if (who === "B") return Promise.resolve(rowFor("B"));
      // account-shared (no pin) → arbitrary first row (simulate A's).
      return Promise.resolve(rowFor("A"));
    },
  );
}

beforeEach(() => {
  mockGetActiveForExecution.mockReset();
  mockDispatcherRefresh.mockReset();
});

describe("personal provider — provenance pin", () => {
  it("pins the lookup to the workflow creator (A), never a co-member", async () => {
    teamWithBothGmail();
    const apiCall = jest.fn().mockResolvedValue({ ok: true });

    const result = await runWithCredentialResolutionContext(
      { createdByUserId: "A" },
      () => refreshAndRetry({ accountId: "team-1", provider: "gmail", apiCall }),
    );

    expect(result).toEqual({ ok: true });
    // Resolved A's token, not B's.
    expect(apiCall).toHaveBeenCalledWith("token-A");
    // The lookup was filtered by connected_by_user_id = A.
    expect(mockGetActiveForExecution).toHaveBeenCalledWith(
      "team-1",
      "gmail",
      null,
      { connectedByUserId: "A" },
    );
  });

  it("a Team workflow by A cannot resolve B's Gmail — fails clearly, no fallback", async () => {
    // Only B has connected Gmail; A has none.
    mockGetActiveForExecution.mockImplementation(
      (_a: string, _p: string, _pa: string | null, opts?: { connectedByUserId?: string }) =>
        Promise.resolve(opts?.connectedByUserId === "B" ? rowFor("B") : null),
    );
    const apiCall = jest.fn();

    await expect(
      runWithCredentialResolutionContext({ createdByUserId: "A" }, () =>
        refreshAndRetry({ accountId: "team-1", provider: "gmail", apiCall }),
      ),
    ).rejects.toThrow(/workflow owner has no active gmail connection/i);

    expect(apiCall).not.toHaveBeenCalled();
    expect(mockDispatcherRefresh).not.toHaveBeenCalled();
    // Never retried the lookup without the pin (no silent account-wide fallback).
    for (const call of mockGetActiveForExecution.mock.calls) {
      expect(call[3]).toEqual({ connectedByUserId: "A" });
    }
  });

  it("pins the refresh + refetch to the creator on 401", async () => {
    teamWithBothGmail();
    let calls = 0;
    const apiCall = jest.fn().mockImplementation(() => {
      calls += 1;
      if (calls === 1) throw new Unauthorized401Error();
      return Promise.resolve({ ok: true });
    });
    mockDispatcherRefresh.mockResolvedValue({ integration: rowFor("A") });

    await runWithCredentialResolutionContext({ createdByUserId: "A" }, () =>
      refreshAndRetry({ accountId: "team-1", provider: "gmail", apiCall }),
    );

    expect(mockDispatcherRefresh).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "gmail", connectedByUserId: "A" }),
    );
  });
});

describe("account/service provider — stays account-shared", () => {
  it("does NOT pin the lookup for slack even inside a creator context", async () => {
    mockGetActiveForExecution.mockResolvedValue({
      ...rowFor("A"),
      provider: "slack",
      accessTokenEncrypted: "ENC-slack-token",
    });
    const apiCall = jest.fn().mockResolvedValue({ ok: true });

    await runWithCredentialResolutionContext({ createdByUserId: "A" }, () =>
      refreshAndRetry({ accountId: "team-1", provider: "slack", apiCall }),
    );

    expect(apiCall).toHaveBeenCalledWith("slack-token");
    // 4th arg undefined → account-shared resolution (no provenance filter).
    expect(mockGetActiveForExecution).toHaveBeenCalledWith(
      "team-1",
      "slack",
      null,
      undefined,
    );
  });
});

describe("no engine context — pre-22B account-scoped behavior", () => {
  it("does not pin a personal provider when called outside a context", async () => {
    mockGetActiveForExecution.mockResolvedValue(rowFor("A"));
    const apiCall = jest.fn().mockResolvedValue({ ok: true });

    await refreshAndRetry({ accountId: "team-1", provider: "gmail", apiCall });

    expect(mockGetActiveForExecution).toHaveBeenCalledWith(
      "team-1",
      "gmail",
      null,
      undefined,
    );
  });
});
