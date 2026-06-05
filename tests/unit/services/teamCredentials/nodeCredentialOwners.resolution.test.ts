/**
 * @jest-environment node
 *
 * CS-2 — per-node credential owner ↔ resolution integration.
 *
 * Combines effectiveCredentialOwner (which produces the value the engine puts
 * into the credential-resolution context) with refreshAndRetry (which pins the
 * lookup to that context) to prove the end-to-end CS-2 contract WITHOUT standing
 * up the full engine:
 *   - a personal node with an accepted owner resolves under THAT owner, not the creator,
 *   - an accepted owner with no active connection fails clearly with NO fallback to the creator,
 *   - an account/service provider ignores the owner row and stays account-shared.
 *
 * Mirrors tests/unit/services/oauth/credentialResolutionScoping.test.ts (22B).
 */
const mockGetActiveForExecution = jest.fn();
const mockDispatcherRefresh = jest.fn();

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...a: unknown[]) => mockGetActiveForExecution(...a),
  updateTokens: jest.fn(),
  upsertActive: jest.fn(),
}));
jest.mock("@/services/oauth/dispatcher", () => ({
  refresh: (...a: unknown[]) => mockDispatcherRefresh(...a),
}));
jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: jest.fn((enc: string) => enc.replace(/^ENC-/, "")),
  encryptToken: jest.fn((p: string) => `ENC-${p}`),
}));

import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { runWithCredentialResolutionContext } from "@/services/oauth/credentialResolutionContext";
import {
  effectiveCredentialOwner,
  type AcceptedNodeOwners,
} from "@/services/teamCredentials/nodeCredentialOwners";

function rowFor(connectedByUserId: string, provider = "gmail") {
  return {
    id: `int-${connectedByUserId}`,
    accountId: "team-1",
    connectedByUserId,
    provider,
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

/** Run the resolver exactly as the engine does: context owner = effectiveCredentialOwner. */
function runNode(input: {
  provider: string;
  nodeId: string;
  creatorUserId: string;
  acceptedOwners: AcceptedNodeOwners;
  apiCall: (token: string) => Promise<unknown>;
}) {
  const effectiveOwner = effectiveCredentialOwner({
    provider: input.provider,
    nodeId: input.nodeId,
    creatorUserId: input.creatorUserId,
    acceptedOwners: input.acceptedOwners,
  });
  return runWithCredentialResolutionContext({ createdByUserId: effectiveOwner }, () =>
    refreshAndRetry({ accountId: "team-1", provider: input.provider, apiCall: input.apiCall }),
  );
}

beforeEach(() => {
  mockGetActiveForExecution.mockReset();
  mockDispatcherRefresh.mockReset();
});

describe("CS-2 — accepted node owner drives resolution", () => {
  it("personal node with accepted owner B resolves under B, NOT the creator A", async () => {
    // Team has both A's and B's Gmail; the repo returns the row matching the pin.
    mockGetActiveForExecution.mockImplementation(
      (_a: string, _p: string, _pa: string | null, opts?: { connectedByUserId?: string }) =>
        Promise.resolve(opts?.connectedByUserId === "B" ? rowFor("B") : rowFor("A")),
    );
    const apiCall = jest.fn().mockResolvedValue({ ok: true });

    await runNode({
      provider: "gmail",
      nodeId: "node-1",
      creatorUserId: "A",
      acceptedOwners: new Map([["node-1", "B"]]),
      apiCall,
    });

    // Resolved B's token, and the lookup was pinned to connected_by_user_id = B.
    expect(apiCall).toHaveBeenCalledWith("token-B");
    expect(mockGetActiveForExecution).toHaveBeenCalledWith("team-1", "gmail", null, {
      connectedByUserId: "B",
    });
  });

  it("personal node with no accepted owner resolves under the creator A", async () => {
    mockGetActiveForExecution.mockImplementation(
      (_a: string, _p: string, _pa: string | null, opts?: { connectedByUserId?: string }) =>
        Promise.resolve(opts?.connectedByUserId === "A" ? rowFor("A") : null),
    );
    const apiCall = jest.fn().mockResolvedValue({ ok: true });

    await runNode({
      provider: "gmail",
      nodeId: "node-2",
      creatorUserId: "A",
      acceptedOwners: new Map([["node-1", "B"]]), // different node
      apiCall,
    });

    expect(apiCall).toHaveBeenCalledWith("token-A");
    expect(mockGetActiveForExecution).toHaveBeenCalledWith("team-1", "gmail", null, {
      connectedByUserId: "A",
    });
  });

  it("accepted owner B with NO active connection → clear error, NO fallback to creator A", async () => {
    // Only A has Gmail; the assigned owner B has none.
    mockGetActiveForExecution.mockImplementation(
      (_a: string, _p: string, _pa: string | null, opts?: { connectedByUserId?: string }) =>
        Promise.resolve(opts?.connectedByUserId === "A" ? rowFor("A") : null),
    );
    const apiCall = jest.fn();

    await expect(
      runNode({
        provider: "gmail",
        nodeId: "node-1",
        creatorUserId: "A",
        acceptedOwners: new Map([["node-1", "B"]]),
        apiCall,
      }),
    ).rejects.toThrow(/workflow owner has no active gmail connection/i);

    expect(apiCall).not.toHaveBeenCalled();
    expect(mockDispatcherRefresh).not.toHaveBeenCalled();
    // Every lookup stayed pinned to B — never silently retried as the creator A.
    for (const call of mockGetActiveForExecution.mock.calls) {
      expect(call[3]).toEqual({ connectedByUserId: "B" });
    }
  });

  it("account/service provider ignores the owner row and stays account-shared (no pin)", async () => {
    mockGetActiveForExecution.mockResolvedValue({
      ...rowFor("A", "slack"),
      accessTokenEncrypted: "ENC-slack-token",
    });
    const apiCall = jest.fn().mockResolvedValue({ ok: true });

    await runNode({
      provider: "slack",
      nodeId: "node-1",
      creatorUserId: "A",
      acceptedOwners: new Map([["node-1", "B"]]), // would-be override is ignored
      apiCall,
    });

    expect(apiCall).toHaveBeenCalledWith("slack-token");
    // 4th arg undefined → account-shared resolution (no provenance pin to B or A).
    expect(mockGetActiveForExecution).toHaveBeenCalledWith("team-1", "slack", null, undefined);
  });
});
