/**
 * @jest-environment node
 *
 * CS-5b — accurate workflow LIST DTO eligibility (`computeViewerCanRunEditBatch` +
 * `toWorkflowListItem`). Proves the dashboard reflects the SAME run/edit decision
 * as the detail DTO + gate, computed in BOUNDED queries, while leaking nothing.
 *
 * `buildWorkflowCredentialPlansBatch` and the sharing flag are mocked; the pure
 * `workflowUsesPrivateCredential` / `viewerMayRunEdit` run for real.
 */
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: jest.fn() } })),
}));

const mockFlag = jest.fn();
jest.mock("@/services/integrations/connectionSharingFlags", () => ({
  isConnectionSharingEnabled: () => mockFlag(),
}));

const mockPlansBatch = jest.fn();
jest.mock("@/services/integrations/connectionResolution", () => ({
  buildWorkflowCredentialPlan: jest.fn(),
  buildWorkflowCredentialPlansBatch: (...a: unknown[]) => mockPlansBatch(...a),
}));

import { computeViewerCanRunEditBatch, toWorkflowListItem } from "@/app/api/workflows/_shared";
import type { WorkflowRecord } from "@/repositories/workflows";

function node(provider: string) {
  return { id: provider, kind: "action" as const, provider, type: "x", config: {}, position: { x: 0, y: 0 } };
}
function recordWith(over: Partial<WorkflowRecord>): WorkflowRecord {
  return {
    id: "wf-1",
    accountId: "acct-1",
    createdByUserId: "creator-1",
    name: "WF",
    state: "draft",
    disabledReason: null,
    disabledContext: null,
    activeRevisionId: null,
    draftDefinition: { nodes: [], edges: [] },
    deletedAt: null,
    folderId: null,
    deletedByUserId: null,
    purgeAfter: null,
    deletedFromFolderId: null,
    deleteOperationId: null,
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
    ...over,
  } as WorkflowRecord;
}
function plansMap(entries: Record<string, boolean>) {
  return new Map(Object.entries(entries).map(([id, allTeamRunnable]) => [id, { allTeamRunnable }]));
}

beforeEach(() => jest.clearAllMocks());

describe("computeViewerCanRunEditBatch — flag OFF (conservative WF-RUNPERM, no DB)", () => {
  beforeEach(() => mockFlag.mockReturnValue(false));

  it("creator allowed; non-creator on a private workflow blocked; NO batch query", async () => {
    const recs = [
      recordWith({ id: "own", createdByUserId: "me", draftDefinition: { nodes: [node("gmail")], edges: [] } as never }),
      recordWith({ id: "other", createdByUserId: "someone", draftDefinition: { nodes: [node("gmail")], edges: [] } as never }),
    ];
    const map = await computeViewerCanRunEditBatch(recs, "me");
    expect(map.get("own")).toBe(true);
    expect(map.get("other")).toBe(false); // conservative: private + non-creator
    expect(mockPlansBatch).not.toHaveBeenCalled();
  });
});

describe("computeViewerCanRunEditBatch — flag ON (accurate, batched)", () => {
  beforeEach(() => mockFlag.mockReturnValue(true));

  it("creator + no-private short-circuit to true with NO batch entry; only candidates go to the batch", async () => {
    mockPlansBatch.mockResolvedValue(plansMap({ shared: true, ambiguous: false }));
    const recs = [
      recordWith({ id: "creator", createdByUserId: "me", draftDefinition: { nodes: [node("gmail")], edges: [] } as never }),
      recordWith({ id: "noprivate", createdByUserId: "x", draftDefinition: { nodes: [node("slack")], edges: [] } as never }),
      recordWith({ id: "shared", createdByUserId: "x", draftDefinition: { nodes: [node("gmail")], edges: [] } as never }),
      recordWith({ id: "ambiguous", createdByUserId: "x", draftDefinition: { nodes: [node("gmail")], edges: [] } as never }),
    ];
    const map = await computeViewerCanRunEditBatch(recs, "me");
    expect(map.get("creator")).toBe(true);
    expect(map.get("noprivate")).toBe(true);
    expect(map.get("shared")).toBe(true); // single-sharer resolved by batch
    expect(map.get("ambiguous")).toBe(false); // ambiguous, no binding
    // Only the 2 non-creator private candidates were sent to the bounded batch.
    expect(mockPlansBatch).toHaveBeenCalledTimes(1);
    const sentIds = (mockPlansBatch.mock.calls[0]![0] as { records: { id: string }[] }).records.map((r) => r.id).sort();
    expect(sentIds).toEqual(["ambiguous", "shared"]);
  });

  it("valid binding makes a non-creator row runnable (batch returns allTeamRunnable true)", async () => {
    mockPlansBatch.mockResolvedValue(plansMap({ bound: true }));
    const map = await computeViewerCanRunEditBatch(
      [recordWith({ id: "bound", createdByUserId: "x", draftDefinition: { nodes: [node("gmail")], edges: [] } as never })],
      "me",
    );
    expect(map.get("bound")).toBe(true);
  });
});

describe("toWorkflowListItem — accurate viewerCanRunEdit + no-leak", () => {
  it("uses the precomputed eligibility map; falls back to conservative when absent", () => {
    const rec = recordWith({ id: "wf-x", createdByUserId: "x", draftDefinition: { nodes: [node("gmail")], edges: [] } as never });
    const runnable = toWorkflowListItem(rec, new Map(), "me", new Map([["wf-x", true]]));
    expect(runnable.viewerCanRunEdit).toBe(true);
    expect(runnable.usesPrivateCredential).toBe(true);
    // No map → conservative (non-creator on a private workflow → false).
    const conservative = toWorkflowListItem(rec, new Map(), "me");
    expect(conservative.viewerCanRunEdit).toBe(false);
  });

  it("DTO leaks no identity: no createdByUserId / accountId / draftDefinition / connector ids", () => {
    const rec = recordWith({
      id: "wf-x",
      accountId: "secret-account-id",
      createdByUserId: "secret-creator-id",
      draftDefinition: { nodes: [node("gmail")], edges: [] } as never,
    });
    const item = toWorkflowListItem(rec, new Map(), "me", new Map([["wf-x", true]]));
    for (const forbidden of ["createdByUserId", "accountId", "draftDefinition", "connectorUserId", "connected_by_user_id"]) {
      expect(item).not.toHaveProperty(forbidden);
    }
    const json = JSON.stringify(item);
    expect(json).not.toContain("secret-account-id");
    expect(json).not.toContain("secret-creator-id");
  });
});
