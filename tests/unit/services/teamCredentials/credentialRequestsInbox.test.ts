/**
 * @jest-environment node
 *
 * Tests for services/teamCredentials/credentialRequestsInbox.ts (CS-7). Mocks the
 * pending-grant repo, the member-identity RPC wrapper, and the workflows repo.
 * Proves: flag gating, safe view mapping (workflow name + requester display name
 * + provider type only), requester fallbacks, soft-deleted/missing-workflow
 * exclusion, and the no-leak field set.
 */

const mockListPending = jest.fn();
jest.mock("@/repositories/workflowNodeCredentials", () => ({
  listPendingForCredentialOwnerServiceRole: (...a: unknown[]) => mockListPending(...a),
}));

const mockListIdentities = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  listMemberIdentities: (...a: unknown[]) => mockListIdentities(...a),
}));

const mockGetWorkflow = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetWorkflow(...a),
}));

import {
  listIncomingCredentialRequests,
  countIncomingCredentialRequests,
} from "@/services/teamCredentials/credentialRequestsInbox";

const ACCOUNT = "acct-1";
const ME = "user-me";
const FLAG = "ENABLE_NODE_CREDENTIAL_REASSIGNMENT";

function grant(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "g1",
    workflowId: "wf-1",
    nodeId: "node-7",
    provider: "gmail",
    credentialOwnerUserId: ME,
    status: "pending",
    requestedByUserId: "user-req",
    requestedAt: "2026-06-06T00:00:00Z",
    decidedAt: null,
    createdAt: "2026-06-06T00:00:00Z",
    updatedAt: "2026-06-06T00:00:00Z",
    ...over,
  };
}

function wf(over: Partial<Record<string, unknown>> = {}) {
  return { id: "wf-1", name: "Send daily digest", state: "active", ...over };
}

beforeEach(() => {
  delete process.env[FLAG];
  mockListPending.mockReset().mockResolvedValue([]);
  mockListIdentities.mockReset().mockResolvedValue([]);
  mockGetWorkflow.mockReset().mockResolvedValue(null);
});

describe("listIncomingCredentialRequests — flag gating", () => {
  it("returns [] and touches no repo when the feature flag is OFF", async () => {
    mockListPending.mockResolvedValue([grant()]);
    const result = await listIncomingCredentialRequests({ accountId: ACCOUNT, userId: ME });
    expect(result).toEqual([]);
    expect(mockListPending).not.toHaveBeenCalled();
  });

  it("returns [] when there are no pending requests (flag ON)", async () => {
    process.env[FLAG] = "true";
    mockListPending.mockResolvedValue([]);
    const result = await listIncomingCredentialRequests({ accountId: ACCOUNT, userId: ME });
    expect(result).toEqual([]);
    expect(mockListPending).toHaveBeenCalledWith(ACCOUNT, ME);
    // Short-circuits before resolving identities / workflows.
    expect(mockListIdentities).not.toHaveBeenCalled();
  });
});

describe("listIncomingCredentialRequests — mapping (flag ON)", () => {
  beforeEach(() => {
    process.env[FLAG] = "true";
  });

  it("maps a pending grant to the safe view with workflow name + requester display name", async () => {
    mockListPending.mockResolvedValue([grant()]);
    mockGetWorkflow.mockResolvedValue(wf());
    mockListIdentities.mockResolvedValue([
      { userId: "user-req", email: "req@x.io", displayName: "Dana Scully" },
    ]);

    const result = await listIncomingCredentialRequests({ accountId: ACCOUNT, userId: ME });

    expect(result).toEqual([
      {
        workflowId: "wf-1",
        nodeId: "node-7",
        provider: "gmail",
        workflowName: "Send daily digest",
        requestedByLabel: "Dana Scully",
        requestedAt: "2026-06-06T00:00:00Z",
      },
    ]);
  });

  it("falls back to 'A teammate' when the requester has no display name", async () => {
    mockListPending.mockResolvedValue([grant()]);
    mockGetWorkflow.mockResolvedValue(wf());
    mockListIdentities.mockResolvedValue([
      { userId: "user-req", email: "req@x.io", displayName: null },
    ]);
    const [view] = await listIncomingCredentialRequests({ accountId: ACCOUNT, userId: ME });
    expect(view!.requestedByLabel).toBe("A teammate");
  });

  it("falls back to 'A teammate' when requestedByUserId is null", async () => {
    mockListPending.mockResolvedValue([grant({ requestedByUserId: null })]);
    mockGetWorkflow.mockResolvedValue(wf());
    const [view] = await listIncomingCredentialRequests({ accountId: ACCOUNT, userId: ME });
    expect(view!.requestedByLabel).toBe("A teammate");
  });

  it("excludes a request whose workflow is soft-deleted", async () => {
    mockListPending.mockResolvedValue([grant()]);
    mockGetWorkflow.mockResolvedValue(wf({ state: "deleted" }));
    expect(await listIncomingCredentialRequests({ accountId: ACCOUNT, userId: ME })).toEqual([]);
  });

  it("excludes a request whose workflow no longer resolves", async () => {
    mockListPending.mockResolvedValue([grant()]);
    mockGetWorkflow.mockResolvedValue(null);
    expect(await listIncomingCredentialRequests({ accountId: ACCOUNT, userId: ME })).toEqual([]);
  });

  it("NEVER leaks token / provider account label / email / scope fields", async () => {
    mockListPending.mockResolvedValue([grant()]);
    mockGetWorkflow.mockResolvedValue(wf());
    mockListIdentities.mockResolvedValue([
      { userId: "user-req", email: "req@x.io", displayName: "Dana" },
    ]);
    const [view] = await listIncomingCredentialRequests({ accountId: ACCOUNT, userId: ME });
    const keys = Object.keys(view!).sort();
    expect(keys).toEqual(
      ["nodeId", "provider", "requestedAt", "requestedByLabel", "workflowId", "workflowName"].sort(),
    );
    // No raw owner ids, emails, tokens, scopes, or provider account labels.
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain("req@x.io");
    expect(serialized).not.toContain("user-req");
    expect(serialized.toLowerCase()).not.toContain("token");
    expect(serialized.toLowerCase()).not.toContain("scope");
  });
});

// ── CS-8: count (NotificationBell badge) ─────────────────────────────────────
describe("countIncomingCredentialRequests (CS-8)", () => {
  it("returns 0 when the flag is OFF (never touches the repo)", async () => {
    delete process.env[FLAG];
    mockListPending.mockResolvedValue([grant(), grant({ workflowId: "wf-2" })]);
    expect(await countIncomingCredentialRequests({ accountId: ACCOUNT, userId: ME })).toBe(0);
    expect(mockListPending).not.toHaveBeenCalled();
  });

  it("counts the same visible set as the list (flag ON, soft-deleted excluded)", async () => {
    process.env[FLAG] = "true";
    mockListPending.mockResolvedValue([
      grant({ workflowId: "wf-live" }),
      grant({ workflowId: "wf-gone", nodeId: "n9" }),
    ]);
    mockGetWorkflow.mockImplementation(async (id: string) =>
      id === "wf-gone" ? wf({ id, state: "deleted" }) : wf({ id }),
    );
    mockListIdentities.mockResolvedValue([]);
    // wf-gone is soft-deleted → excluded from the list AND the count.
    expect(await countIncomingCredentialRequests({ accountId: ACCOUNT, userId: ME })).toBe(1);
  });

  it("returns 0 when there are no pending requests", async () => {
    process.env[FLAG] = "true";
    mockListPending.mockResolvedValue([]);
    expect(await countIncomingCredentialRequests({ accountId: ACCOUNT, userId: ME })).toBe(0);
  });
});
