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

import { countImpactedWorkflowsForMember } from "@/services/accounts/offboardingImpact";

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

beforeEach(() => mockListByAccount.mockReset());

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
});
