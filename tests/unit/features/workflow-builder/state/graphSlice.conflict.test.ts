/**
 * @jest-environment node
 *
 * WORKFLOW-CHANGED-ELSEWHERE-CONFLICT-PROTECTION-1 — builder-state conflict
 * behavior. The REAL graphSlice runs; only the typed API client is mocked.
 *
 * Protected behaviors:
 *   - a revision-conflict save preserves every local pending edit (nodes,
 *     edges, node config) and never hydrates the server definition over them;
 *   - a metadata-only bump (rename / folder / lifecycle advanced updated_at,
 *     definition unchanged) transparently adopts the fresh token and retries
 *     ONCE — the retry uses the latest authoritative revision;
 *   - repeat saves with the same stale token are refused up-front (no 409 loop);
 *   - reload-latest hydrates the new server revision and clears the conflict;
 *   - conflict state resets on close (reset) and never leaks across workflows;
 *   - network / validation failures never masquerade as revision conflicts.
 */

const mockUpdateWorkflow = jest.fn();
const mockGetWorkflowApi = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    updateWorkflow: (...args: unknown[]) => mockUpdateWorkflow(...args),
    getWorkflow: (...args: unknown[]) => mockGetWorkflowApi(...args),
  };
});

import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import {
  WorkflowApiError,
  WorkflowRevisionConflictError,
} from "@/lib/api/workflows";
import type { WorkflowDefinition, WorkflowNode } from "@/contracts/workflow";

const REV = "2026-08-01T00:00:00.000Z";
const NEWER = "2026-08-01T00:05:00.000Z";

const BASE_DEF: WorkflowDefinition = {
  nodes: [
    {
      id: "t1",
      kind: "trigger",
      provider: "slack",
      type: "message_received",
      config: { channel: "C1" },
      position: { x: 0, y: 0 },
    },
  ],
  edges: [],
};

/** A different definition, as another session would have saved it. */
const ELSEWHERE_DEF: WorkflowDefinition = {
  nodes: [
    {
      id: "t1",
      kind: "trigger",
      provider: "slack",
      type: "message_received",
      config: { channel: "C-OTHER" },
      position: { x: 0, y: 0 },
    },
  ],
  edges: [],
};

function conflictErr(latestRevision?: string): WorkflowRevisionConflictError {
  return new WorkflowRevisionConflictError("changed elsewhere", 409, {
    workflowId: "wf-1",
    ...(latestRevision ? { latestRevision } : {}),
  });
}

function detail(def: WorkflowDefinition, updatedAt: string) {
  return { id: "wf-1", draftDefinition: def, updatedAt };
}

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockGetWorkflowApi.mockReset();
  useGraphSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", BASE_DEF, REV);
});

function makeDirtyEdit(): { nodeId: string; nodes: readonly WorkflowNode[] } {
  const s = useGraphSlice.getState();
  const nodeId = s.pendingNodes[0]!.id;
  s.updateNodeConfig(nodeId, { channel: "C-mine", text: "my unsaved value" });
  useGraphSlice.getState().addAction({ provider: "gmail", type: "send_email" });
  return { nodeId, nodes: useGraphSlice.getState().pendingNodes };
}

describe("revision conflict on save — local work preserved", () => {
  it("preserves local unsaved nodes, edges, and pending node configuration; marks conflicted; no auto-hydrate", async () => {
    const { nodeId, nodes } = makeDirtyEdit();
    const edges = useGraphSlice.getState().pendingEdges;
    mockUpdateWorkflow.mockRejectedValueOnce(conflictErr(NEWER));
    // The rebase probe finds genuinely different server content → real conflict.
    mockGetWorkflowApi.mockResolvedValueOnce(detail(ELSEWHERE_DEF, NEWER));

    await expect(useGraphSlice.getState().save()).rejects.toMatchObject({ code: "WORKFLOW_REVISION_CONFLICT" });

    const s = useGraphSlice.getState();
    expect(s.pendingNodes).toBe(nodes); // by reference — untouched
    expect(s.pendingEdges).toBe(edges);
    expect(
      (s.pendingNodes.find((n) => n.id === nodeId)!.config as { text?: string }).text,
    ).toBe("my unsaved value");
    expect(s.isDirty).toBe(true);
    expect(s.isSaving).toBe(false);
    expect(s.conflict).not.toBeNull();
    expect(s.conflict!.workflowId).toBe("wf-1");
    expect(s.conflict!.source).toBe("manual_save");
    expect(s.conflict!.latestRevision).toBe(NEWER);
    // Conflicts render through their own channel, never the generic error banner.
    expect(s.saveError).toBeNull();
    // The stale token is kept — the client never invents the next revision.
    expect(s.hydratedRevision).toBe(REV);
  });

  it("prevents repeated save attempts with the same stale revision (typed refusal, no network)", async () => {
    makeDirtyEdit();
    mockUpdateWorkflow.mockRejectedValueOnce(conflictErr(NEWER));
    mockGetWorkflowApi.mockResolvedValueOnce(detail(ELSEWHERE_DEF, NEWER));
    await expect(useGraphSlice.getState().save()).rejects.toMatchObject({ code: "WORKFLOW_REVISION_CONFLICT" });
    expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);

    // A second save with nothing resolved must not spam the server.
    await expect(useGraphSlice.getState().save()).rejects.toMatchObject({ code: "WORKFLOW_REVISION_CONFLICT" });
    expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
  });
});

describe("metadata-only bump — transparent rebase", () => {
  it("adopts the fresh token and retries once when the server definition is unchanged; retry carries the LATEST revision", async () => {
    makeDirtyEdit();
    mockUpdateWorkflow
      .mockRejectedValueOnce(conflictErr(NEWER))
      .mockImplementationOnce(async (_id: string, input: { draftDefinition: WorkflowDefinition }) =>
        detail(input.draftDefinition, "2026-08-01T00:06:00.000Z"),
      );
    // Rename/lifecycle bumped the row; the DEFINITION equals this session's baseline.
    mockGetWorkflowApi.mockResolvedValueOnce(detail(BASE_DEF, NEWER));

    const updated = await useGraphSlice.getState().save();
    expect(updated).toBeDefined();

    expect(mockUpdateWorkflow).toHaveBeenCalledTimes(2);
    expect(mockUpdateWorkflow.mock.calls[0]![1]).toMatchObject({ expectedRevision: REV });
    expect(mockUpdateWorkflow.mock.calls[1]![1]).toMatchObject({ expectedRevision: NEWER });

    const s = useGraphSlice.getState();
    expect(s.conflict).toBeNull();
    expect(s.isDirty).toBe(false);
    expect(s.hydratedRevision).toBe("2026-08-01T00:06:00.000Z");
  });

  it("records a conflict when even the rebased retry hits 409 (no endless loop)", async () => {
    makeDirtyEdit();
    mockUpdateWorkflow
      .mockRejectedValueOnce(conflictErr(NEWER))
      .mockRejectedValueOnce(conflictErr("2026-08-01T00:07:00.000Z"));
    mockGetWorkflowApi.mockResolvedValueOnce(detail(BASE_DEF, NEWER));

    await expect(useGraphSlice.getState().save()).rejects.toMatchObject({ code: "WORKFLOW_REVISION_CONFLICT" });
    expect(mockUpdateWorkflow).toHaveBeenCalledTimes(2);
    expect(useGraphSlice.getState().conflict).not.toBeNull();
    expect(useGraphSlice.getState().isDirty).toBe(true);
  });
});

describe("conflict resolution + lifecycle", () => {
  async function enterConflict(): Promise<void> {
    makeDirtyEdit();
    mockUpdateWorkflow.mockRejectedValueOnce(conflictErr(NEWER));
    mockGetWorkflowApi.mockResolvedValueOnce(detail(ELSEWHERE_DEF, NEWER));
    await expect(useGraphSlice.getState().save()).rejects.toMatchObject({ code: "WORKFLOW_REVISION_CONFLICT" });
    expect(useGraphSlice.getState().conflict).not.toBeNull();
  }

  it("reloadLatest hydrates the newer server revision and clears the conflict (explicit discard)", async () => {
    await enterConflict();
    mockGetWorkflowApi.mockResolvedValueOnce(detail(ELSEWHERE_DEF, NEWER));

    await useGraphSlice.getState().reloadLatest();

    const s = useGraphSlice.getState();
    expect(s.conflict).toBeNull();
    expect(s.isDirty).toBe(false);
    expect(s.hydratedRevision).toBe(NEWER);
    expect((s.pendingNodes[0]!.config as { channel?: string }).channel).toBe("C-OTHER");
  });

  it("a save that lands against the latest revision after reload clears the conflict permanently", async () => {
    await enterConflict();
    mockGetWorkflowApi.mockResolvedValueOnce(detail(ELSEWHERE_DEF, NEWER));
    await useGraphSlice.getState().reloadLatest();

    // Re-apply the local intent on top of the latest and save.
    const s = useGraphSlice.getState();
    s.updateNodeConfig(s.pendingNodes[0]!.id, { channel: "C-mine-again" });
    mockUpdateWorkflow.mockImplementationOnce(
      async (_id: string, input: { draftDefinition: WorkflowDefinition }) =>
        detail(input.draftDefinition, "2026-08-01T00:09:00.000Z"),
    );
    await useGraphSlice.getState().save();

    expect(mockUpdateWorkflow).toHaveBeenLastCalledWith(
      "wf-1",
      expect.objectContaining({ expectedRevision: NEWER }),
    );
    expect(useGraphSlice.getState().conflict).toBeNull();
    expect(useGraphSlice.getState().isDirty).toBe(false);
  });

  it("conflict state clears when the workflow closes (reset)", async () => {
    await enterConflict();
    useGraphSlice.getState().reset();
    expect(useGraphSlice.getState().conflict).toBeNull();
  });

  it("conflict state does not leak into another workflow", async () => {
    await enterConflict();
    useGraphSlice.getState().hydrate("wf-2", BASE_DEF, REV);
    expect(useGraphSlice.getState().conflict).toBeNull();
    expect(useGraphSlice.getState().workflowId).toBe("wf-2");
  });

  it("flagConflict (template replace / checkpoint restore surfaces) records the shared conflict", () => {
    useGraphSlice.getState().flagConflict({ source: "template_replace", latestRevision: NEWER });
    const c = useGraphSlice.getState().conflict;
    expect(c).not.toBeNull();
    expect(c!.source).toBe("template_replace");
    expect(c!.latestRevision).toBe(NEWER);
    expect(c!.expectedRevision).toBe(REV);
  });
});

describe("non-conflict failures never masquerade as conflicts", () => {
  it("a network failure sets the generic saveError and records NO conflict", async () => {
    makeDirtyEdit();
    mockUpdateWorkflow.mockRejectedValueOnce(new TypeError("fetch failed"));

    await expect(useGraphSlice.getState().save()).rejects.toThrow();
    const s = useGraphSlice.getState();
    expect(s.conflict).toBeNull();
    expect(s.saveError).toMatch(/failed to save/i);
    expect(s.isDirty).toBe(true);
  });

  it("a validation failure (400) sets the typed message and records NO conflict", async () => {
    makeDirtyEdit();
    mockUpdateWorkflow.mockRejectedValueOnce(
      new WorkflowApiError("draftDefinition invalid", "BAD_REQUEST", 400),
    );

    await expect(useGraphSlice.getState().save()).rejects.toThrow(/invalid/);
    const s = useGraphSlice.getState();
    expect(s.conflict).toBeNull();
    expect(s.saveError).toBe("draftDefinition invalid");
  });
});
