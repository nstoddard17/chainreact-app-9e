/**
 * @jest-environment node
 *
 * CS-5 — node-owner-aware AI integration availability. Mocks the workflows +
 * integrations repos and `loadAcceptedNodeOwners` (the flag-gated accepted-owner
 * batch loader) so we can drive the flag-ON behavior. Proves availability resolves
 * against the ACCEPTED node owner, the requester-is-owner / non-owner / owner-must-
 * connect states, account-shared pass-through, and the no-identity-leak rule.
 */
const mockGetById = jest.fn();
const mockListActive = jest.fn();
const mockIsMember = jest.fn();
const mockLoadAccepted = jest.fn();

jest.mock("@/repositories/workflows", () => ({
  getById: (...a: unknown[]) => mockGetById(...a),
}));
jest.mock("@/repositories/integrations", () => ({
  listActiveByAccount: (...a: unknown[]) => mockListActive(...a),
}));
jest.mock("@/repositories/accountMemberships", () => ({
  isMember: (...a: unknown[]) => mockIsMember(...a),
}));
jest.mock("@/services/teamCredentials/nodeCredentialOwners", () => ({
  loadAcceptedNodeOwners: (...a: unknown[]) => mockLoadAccepted(...a),
}));

import { getWorkflowIntegrationAvailabilityForAI } from "@/services/ai/tools/workflowContext";
import type { WorkflowRecord } from "@/repositories/workflows";

function record(nodes: Array<{ id: string; provider: string }>): WorkflowRecord {
  return {
    id: "wf-1",
    accountId: "team-1",
    createdByUserId: "creatorA",
    name: "WF",
    state: "draft",
    disabledReason: null,
    disabledContext: null,
    activeRevisionId: null,
    draftDefinition: {
      nodes: nodes.map((n) => ({ id: n.id, kind: "action", provider: n.provider, type: "send", config: {}, position: { x: 0, y: 0 } })),
      edges: [],
    },
    deletedAt: null,
    folderId: null,
    deletedByUserId: null,
    purgeAfter: null,
    deletedFromFolderId: null,
    deleteOperationId: null,
    createdAt: "t",
    updatedAt: "t",
  } as unknown as WorkflowRecord;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsMember.mockResolvedValue(true);
  mockLoadAccepted.mockResolvedValue(new Map()); // default: no accepted owners
});

async function availability(userId: string) {
  const r = await getWorkflowIntegrationAvailabilityForAI(userId, "wf-1");
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r)}`);
  return r.data;
}

describe("CS-5 — accepted node owner drives AI availability", () => {
  it("no accepted owner → resolves to the creator (byte-identical to 22D-3)", async () => {
    mockGetById.mockResolvedValue(record([{ id: "n0", provider: "gmail" }]));
    mockListActive.mockResolvedValue([{ provider: "gmail", connectedByUserId: "creatorA" }]);
    expect((await availability("creatorA")).providers).toEqual([
      { provider: "gmail", sharing: "personal", connected: true },
    ]);
  });

  it("accepted owner B (connected) + requester IS B → full connected (not ownerControlled)", async () => {
    mockGetById.mockResolvedValue(record([{ id: "n0", provider: "gmail" }]));
    mockLoadAccepted.mockResolvedValue(new Map([["n0", "userB"]]));
    mockListActive.mockResolvedValue([{ provider: "gmail", connectedByUserId: "userB", displayName: "dana@x.io" }]);
    const data = await availability("userB");
    expect(data.providers).toEqual([{ provider: "gmail", sharing: "personal", connected: true }]);
    expect(JSON.stringify(data)).not.toMatch(/userB|dana@x\.io|@/);
  });

  it("accepted owner B + requester is the CREATOR → ownerControlled (redacted), no owner id", async () => {
    mockGetById.mockResolvedValue(record([{ id: "n0", provider: "gmail" }]));
    mockLoadAccepted.mockResolvedValue(new Map([["n0", "userB"]]));
    mockListActive.mockResolvedValue([{ provider: "gmail", connectedByUserId: "userB", displayName: "dana@x.io" }]);
    const data = await availability("creatorA");
    expect(data.providers).toEqual([
      { provider: "gmail", sharing: "personal", connected: true, ownerControlled: true },
    ]);
    expect(JSON.stringify(data)).not.toMatch(/userB|dana@x\.io|@/);
  });

  it("accepted owner B with NO active connection → ownerMustConnect (no leak), even though the creator IS connected", async () => {
    mockGetById.mockResolvedValue(record([{ id: "n0", provider: "gmail" }]));
    mockLoadAccepted.mockResolvedValue(new Map([["n0", "userB"]]));
    // Creator is connected, but the effective owner (B) is not → run can't use the creator.
    mockListActive.mockResolvedValue([{ provider: "gmail", connectedByUserId: "creatorA" }]);
    const data = await availability("creatorA");
    expect(data.providers).toEqual([
      { provider: "gmail", sharing: "personal", connected: false, ownerMustConnect: true },
    ]);
    expect(JSON.stringify(data)).not.toMatch(/userB|@/);
  });

  it("a co-member who is NOT the effective owner still cannot see it → ownerControlled", async () => {
    mockGetById.mockResolvedValue(record([{ id: "n0", provider: "gmail" }]));
    mockLoadAccepted.mockResolvedValue(new Map([["n0", "userB"]]));
    mockListActive.mockResolvedValue([{ provider: "gmail", connectedByUserId: "userB" }]);
    // Requester userC (a different co-member) is not the owner.
    expect((await availability("userC")).providers).toEqual([
      { provider: "gmail", sharing: "personal", connected: true, ownerControlled: true },
    ]);
  });

  it("account/service provider ignores the node owner and stays account-shared", async () => {
    mockGetById.mockResolvedValue(record([{ id: "n0", provider: "slack" }]));
    // An (illegitimate) owner entry for a slack node must be ignored.
    mockLoadAccepted.mockResolvedValue(new Map([["n0", "userB"]]));
    mockListActive.mockResolvedValue([{ provider: "slack", connectedByUserId: "anyone" }]);
    expect((await availability("userC")).providers).toEqual([
      { provider: "slack", sharing: "account", connected: true },
    ]);
  });

  it("never emits the accepted credentialOwnerUserId anywhere in the serialized result", async () => {
    mockGetById.mockResolvedValue(record([{ id: "n0", provider: "gmail" }, { id: "n1", provider: "slack" }]));
    mockLoadAccepted.mockResolvedValue(new Map([["n0", "secret-owner-id-xyz"]]));
    mockListActive.mockResolvedValue([
      { provider: "gmail", connectedByUserId: "secret-owner-id-xyz" },
      { provider: "slack", connectedByUserId: "anyone" },
    ]);
    const data = await availability("creatorA");
    expect(JSON.stringify(data)).not.toContain("secret-owner-id-xyz");
  });
});
