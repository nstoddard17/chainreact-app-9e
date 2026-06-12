/**
 * @jest-environment node
 *
 * CS-4b — assertWorkflowRunEditAllowed with ENABLE_CONNECTION_SHARING ON. Proves
 * the gate consumes the SHARED buildWorkflowCredentialPlan: a non-creator is
 * allowed iff `allTeamRunnable`, with creator / no-private short-circuits doing no
 * plan read. The flag-OFF parity lives in _shared.test.ts.
 */
const mockBuildPlan = jest.fn();
jest.mock("@/services/integrations/connectionResolution", () => ({
  buildWorkflowCredentialPlan: (...a: unknown[]) => mockBuildPlan(...a),
}));
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: jest.fn() } })),
}));

import { assertWorkflowRunEditAllowed, computeViewerCanRunEdit } from "@/app/api/workflows/_shared";
import type { WorkflowRecord } from "@/repositories/workflows";

const FLAG = "ENABLE_CONNECTION_SHARING";
const CREATOR = "creator-1";
const OTHER = "member-2";

function node(provider: string) {
  return { id: provider, kind: "action" as const, provider, type: "x", config: {}, position: { x: 0, y: 0 } };
}
function record(over: Partial<WorkflowRecord> = {}): WorkflowRecord {
  return {
    id: "wf-1", accountId: "acc-1", createdByUserId: CREATOR, name: "WF", state: "active",
    disabledReason: null, disabledContext: null, activeRevisionId: null,
    draftDefinition: { nodes: [node("gmail")], edges: [] } as never,
    deletedAt: null, folderId: null, deletedByUserId: null, purgeAfter: null,
    deletedFromFolderId: null, deleteOperationId: null,
    createdAt: "2026-06-01T00:00:00Z", updatedAt: "2026-06-01T00:00:00Z",
    ...over,
  } as WorkflowRecord;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env[FLAG] = "true";
});
afterAll(() => {
  delete process.env[FLAG];
});

describe("CS-4b gate (flag ON)", () => {
  it("creator → allowed (null) WITHOUT a plan read", async () => {
    expect(await assertWorkflowRunEditAllowed(record(), CREATOR)).toBeNull();
    expect(mockBuildPlan).not.toHaveBeenCalled();
  });

  it("no private providers → allowed (null) WITHOUT a plan read", async () => {
    const res = await assertWorkflowRunEditAllowed(
      record({ draftDefinition: { nodes: [node("slack")], edges: [] } as never }),
      OTHER,
    );
    expect(res).toBeNull();
    expect(mockBuildPlan).not.toHaveBeenCalled();
  });

  it("non-creator + plan.allTeamRunnable=true → allowed (null)", async () => {
    mockBuildPlan.mockResolvedValue({ ownerByNode: new Map(), resolutions: new Map(), allTeamRunnable: true });
    expect(await assertWorkflowRunEditAllowed(record(), OTHER)).toBeNull();
    expect(mockBuildPlan).toHaveBeenCalledWith({
      workflowId: "wf-1", accountId: "acc-1", createdByUserId: CREATOR,
      nodes: [node("gmail")],
    });
  });

  it("non-creator + plan.allTeamRunnable=false → 403 WORKFLOW_USES_PRIVATE_CREDENTIAL, no leak", async () => {
    mockBuildPlan.mockResolvedValue({ ownerByNode: new Map(), resolutions: new Map(), allTeamRunnable: false });
    const res = await assertWorkflowRunEditAllowed(record(), OTHER);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
    const body = await res!.json();
    expect(body.code).toBe("WORKFLOW_USES_PRIVATE_CREDENTIAL");
    expect(JSON.stringify(body)).not.toMatch(/gmail|creator-1|connector|token|email|scope/i);
  });
});

describe("CS-5a — computeViewerCanRunEdit (DTO boolean, flag ON) shares the gate plan", () => {
  it("creator → true (no plan read)", async () => {
    expect(await computeViewerCanRunEdit(record(), CREATOR)).toBe(true);
    expect(mockBuildPlan).not.toHaveBeenCalled();
  });
  it("no private providers → true (no plan read)", async () => {
    expect(
      await computeViewerCanRunEdit(record({ draftDefinition: { nodes: [node("slack")], edges: [] } as never }), OTHER),
    ).toBe(true);
    expect(mockBuildPlan).not.toHaveBeenCalled();
  });
  it("non-creator + one shared connector (allTeamRunnable) → true", async () => {
    mockBuildPlan.mockResolvedValue({ ownerByNode: new Map(), resolutions: new Map(), allTeamRunnable: true });
    expect(await computeViewerCanRunEdit(record(), OTHER)).toBe(true);
  });
  it("non-creator + ambiguous/unshared (not allTeamRunnable) → false", async () => {
    mockBuildPlan.mockResolvedValue({ ownerByNode: new Map(), resolutions: new Map(), allTeamRunnable: false });
    expect(await computeViewerCanRunEdit(record(), OTHER)).toBe(false);
  });
});
