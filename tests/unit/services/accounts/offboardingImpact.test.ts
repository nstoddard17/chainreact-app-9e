/**
 * @jest-environment node
 *
 * Tests for services/accounts/offboardingImpact.ts (Slice 4.TEAM-WORKFLOWS-7 /
 * TW-5). Drives the REAL credentialSharing classifier (gmail=personal,
 * slack=account). Mocks only the workflows repo.
 */

const mockListByAccount = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  listByAccount: (...args: unknown[]) => mockListByAccount(...args),
}));

// CS-6: owned accepted-grant lookup (only consulted when the flag is ON).
const mockListAcceptedOwned = jest.fn();
jest.mock("@/repositories/workflowNodeCredentials", () => ({
  listAcceptedOwnedByUserInAccountServiceRole: (...a: unknown[]) => mockListAcceptedOwned(...a),
}));

import { countImpactedWorkflowsForMember } from "@/services/accounts/offboardingImpact";

const FLAG = "ENABLE_NODE_CREDENTIAL_REASSIGNMENT";
async function withFlag<T>(value: "true" | undefined, fn: () => Promise<T>): Promise<T> {
  const prev = process.env[FLAG];
  if (value === undefined) delete process.env[FLAG];
  else process.env[FLAG] = value;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env[FLAG];
    else process.env[FLAG] = prev;
  }
}

function grant(workflowId: string, status: string = "accepted") {
  return { id: `g-${workflowId}`, workflowId, nodeId: "n0", provider: "gmail", credentialOwnerUserId: "target", status };
}

function wf(overrides: {
  id: string;
  createdByUserId: string;
  providers: string[];
}) {
  return {
    id: overrides.id,
    accountId: "acct-team",
    createdByUserId: overrides.createdByUserId,
    name: overrides.id,
    state: "draft",
    draftDefinition: {
      nodes: overrides.providers.map((provider, i) => ({
        id: `n${i}`,
        kind: "action",
        provider,
        type: "x",
        config: {},
        position: { x: 0, y: i },
      })),
      edges: [],
    },
  };
}

beforeEach(() => {
  mockListByAccount.mockReset();
  mockListAcceptedOwned.mockReset().mockResolvedValue([]);
});

describe("countImpactedWorkflowsForMember", () => {
  it("counts only workflows created by the target member that use a personal provider", async () => {
    mockListByAccount.mockResolvedValue([
      wf({ id: "a", createdByUserId: "target", providers: ["gmail"] }), // personal → counts
      wf({ id: "b", createdByUserId: "target", providers: ["slack", "gmail"] }), // has personal → counts
      wf({ id: "c", createdByUserId: "other", providers: ["gmail"] }), // not the target → no
      wf({ id: "d", createdByUserId: "target", providers: ["slack"] }), // account-only → no
      wf({ id: "e", createdByUserId: "target", providers: ["native"] }), // native (no credential) → no
    ]);

    const count = await countImpactedWorkflowsForMember("acct-team", "target");
    // a + b. c excluded (other member), d excluded (account-only), e excluded (native).
    expect(count).toBe(2);
    expect(mockListByAccount).toHaveBeenCalledWith("acct-team");
  });

  it("does NOT count account/service-provider-only workflows", async () => {
    mockListByAccount.mockResolvedValue([
      wf({ id: "a", createdByUserId: "target", providers: ["slack"] }),
      wf({ id: "b", createdByUserId: "target", providers: ["notion", "stripe"] }),
    ]);
    expect(await countImpactedWorkflowsForMember("acct-team", "target")).toBe(0);
  });

  it("does NOT count workflows created by other members", async () => {
    mockListByAccount.mockResolvedValue([
      wf({ id: "a", createdByUserId: "someone-else", providers: ["gmail"] }),
    ]);
    expect(await countImpactedWorkflowsForMember("acct-team", "target")).toBe(0);
  });

  it("returns 0 when the account has no workflows", async () => {
    mockListByAccount.mockResolvedValue([]);
    expect(await countImpactedWorkflowsForMember("acct-team", "target")).toBe(0);
  });

  it("ignores accepted owned grants when the reassignment flag is OFF (TW-5 behavior preserved)", async () => {
    mockListByAccount.mockResolvedValue([
      wf({ id: "x", createdByUserId: "other", providers: ["gmail"] }), // not creator → 0 from class 1
    ]);
    mockListAcceptedOwned.mockResolvedValue([grant("x")]); // would add x, but flag OFF
    const count = await withFlag(undefined, () =>
      countImpactedWorkflowsForMember("acct-team", "target"),
    );
    expect(count).toBe(0);
    // Flag OFF → never consults the owned-grant repo.
    expect(mockListAcceptedOwned).not.toHaveBeenCalled();
  });
});

// ── CS-6: accepted node-credential owner impact (flag ON) ────────────────────
describe("countImpactedWorkflowsForMember — owned node grants (CS-6, flag ON)", () => {
  it("counts workflows where the member is the accepted credential owner, even if another member created them", async () => {
    mockListByAccount.mockResolvedValue([
      wf({ id: "created", createdByUserId: "target", providers: ["gmail"] }), // class 1
      wf({ id: "owned", createdByUserId: "other", providers: ["gmail"] }), // class 2 only
      wf({ id: "neither", createdByUserId: "other", providers: ["slack"] }),
    ]);
    mockListAcceptedOwned.mockResolvedValue([grant("owned")]);

    const count = await withFlag("true", () =>
      countImpactedWorkflowsForMember("acct-team", "target"),
    );
    // created (class 1) + owned (class 2). neither excluded.
    expect(count).toBe(2);
    expect(mockListAcceptedOwned).toHaveBeenCalledWith("acct-team", "target");
  });

  it("deduplicates a workflow the member both created (personal) and owns a node in", async () => {
    mockListByAccount.mockResolvedValue([
      wf({ id: "dup", createdByUserId: "target", providers: ["gmail"] }),
    ]);
    mockListAcceptedOwned.mockResolvedValue([grant("dup")]); // same workflow id

    const count = await withFlag("true", () =>
      countImpactedWorkflowsForMember("acct-team", "target"),
    );
    expect(count).toBe(1); // counted once, not twice
  });

  it("ignores an owned grant on a workflow not in the account's live (non-deleted) set", async () => {
    mockListByAccount.mockResolvedValue([
      wf({ id: "live", createdByUserId: "other", providers: ["gmail"] }),
    ]);
    // grant points at a workflow listByAccount didn't return (soft-deleted / other account).
    mockListAcceptedOwned.mockResolvedValue([grant("ghost")]);

    const count = await withFlag("true", () =>
      countImpactedWorkflowsForMember("acct-team", "target"),
    );
    expect(count).toBe(0);
  });

  it("counts only ACCEPTED owned grants — the repo helper is accepted-scoped, so pending/revoked never reach here", async () => {
    // The repo query filters status=accepted; the service trusts that. A grant
    // returned here is accepted by construction and contributes its workflow.
    mockListByAccount.mockResolvedValue([
      wf({ id: "owned", createdByUserId: "other", providers: ["gmail"] }),
    ]);
    mockListAcceptedOwned.mockResolvedValue([grant("owned", "accepted")]);
    const count = await withFlag("true", () =>
      countImpactedWorkflowsForMember("acct-team", "target"),
    );
    expect(count).toBe(1);
  });
});
