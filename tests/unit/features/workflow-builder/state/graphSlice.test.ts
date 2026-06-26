/**
 * @jest-environment node
 *
 * Tests for features/workflow-builder/state/graphSlice.
 *
 * The slice is the single source of truth for the builder's nodes/edges/dirty
 * state. Tests cover the workflow-state-store rule's required cases:
 *   - hydrate replaces state cleanly
 *   - reset returns to initial
 *   - each action transitions state correctly
 *   - save reconciles saved* with the typed-client response
 *   - save error keeps pending* intact and surfaces saveError
 *
 * Mocks `lib/api/workflows.updateWorkflow` so the test never touches network.
 */

const mockUpdateWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    updateWorkflow: (...args: unknown[]) => mockUpdateWorkflow(...args),
  };
});

import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { WorkflowApiError } from "@/lib/api/workflows";
import type { WorkflowDefinition } from "@/contracts/workflow";

const EMPTY_DEF: WorkflowDefinition = { nodes: [], edges: [] };

const TRIGGER_DEF: WorkflowDefinition = {
  nodes: [
    {
      id: "t1",
      kind: "trigger",
      provider: "slack",
      type: "message_received",
      config: {},
      position: { x: 0, y: 0 },
    },
  ],
  edges: [],
};

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  useGraphSlice.getState().reset();
});

describe("graphSlice — initial + hydrate + reset", () => {
  it("starts with the documented initial shape", () => {
    const s = useGraphSlice.getState();
    expect(s.workflowId).toBeNull();
    expect(s.isHydrated).toBe(false);
    expect(s.savedNodes).toEqual([]);
    expect(s.pendingNodes).toEqual([]);
    expect(s.isDirty).toBe(false);
    expect(s.isSaving).toBe(false);
    expect(s.saveError).toBeNull();
  });

  it("hydrate populates saved + pending and marks isHydrated", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF);
    const s = useGraphSlice.getState();
    expect(s.workflowId).toBe("wf-1");
    expect(s.isHydrated).toBe(true);
    expect(s.savedNodes).toEqual(TRIGGER_DEF.nodes);
    expect(s.pendingNodes).toEqual(TRIGGER_DEF.nodes);
    expect(s.isDirty).toBe(false);
  });

  it("reset clears everything back to initial", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF);
    useGraphSlice.getState().reset();
    const s = useGraphSlice.getState();
    expect(s.workflowId).toBeNull();
    expect(s.isHydrated).toBe(false);
    expect(s.pendingNodes).toEqual([]);
  });
});

// ─── Slice 4.BUILDER-APPLY-HYDRATE-RACE-1 — hydrate revision guard ───────────

describe("graphSlice.hydrate — revision guard", () => {
  const OLD = "2026-05-06T00:00:01Z";
  const NEW = "2026-05-06T00:05:00Z";

  it("ignores a STALE (older-revision) hydrate for the same workflow", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF, NEW);
    useGraphSlice.getState().hydrate("wf-1", EMPTY_DEF, OLD);
    const s = useGraphSlice.getState();
    expect(s.pendingNodes).toHaveLength(1);
    expect(s.savedNodes).toHaveLength(1);
    expect(s.hydratedRevision).toBe(NEW);
  });

  it("the post-apply race: a late stale empty hydrate never clobbers the applied graph", () => {
    // Apply hydrated the new (non-empty) draft at the post-apply revision...
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF, NEW);
    // ...then the builder's prop-driven effect re-fires with the STALE empty draft.
    useGraphSlice.getState().hydrate("wf-1", EMPTY_DEF, OLD);
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(1);
  });

  it("accepts a NEWER-revision hydrate for the same workflow", () => {
    useGraphSlice.getState().hydrate("wf-1", EMPTY_DEF, OLD);
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF, NEW);
    const s = useGraphSlice.getState();
    expect(s.pendingNodes).toHaveLength(1);
    expect(s.hydratedRevision).toBe(NEW);
  });

  it("accepts an EQUAL-revision hydrate (idempotent re-hydrate, never stale)", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF, NEW);
    useGraphSlice.getState().hydrate("wf-1", EMPTY_DEF, NEW);
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(0);
  });

  it("a DIFFERENT workflow always hydrates, even with an older revision", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF, NEW);
    useGraphSlice.getState().hydrate("wf-2", EMPTY_DEF, OLD);
    const s = useGraphSlice.getState();
    expect(s.workflowId).toBe("wf-2");
    expect(s.pendingNodes).toHaveLength(0);
    expect(s.hydratedRevision).toBe(OLD);
  });

  it("a legacy hydrate without a revision still accepts (no-regression)", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF, NEW);
    useGraphSlice.getState().hydrate("wf-1", EMPTY_DEF);
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(0);
  });

  it("reset clears hydratedRevision so the next hydrate is accepted", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF, NEW);
    useGraphSlice.getState().reset();
    expect(useGraphSlice.getState().hydratedRevision).toBeNull();
    useGraphSlice.getState().hydrate("wf-1", EMPTY_DEF, OLD);
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(0);
  });
});

// ─── Launch-blocker BUILDER-SAVE-WIPE-1 — re-hydrate must not wipe edits ──────
//
// Production repro: new workflow → add manual trigger + native action → a late
// RSC re-render re-fires the mount hydrate with the SAME revision + still-empty
// server draft → pendingNodes were wiped to [] → Save persisted the empty graph
// (PATCH 200), workflow empty on reopen.

describe("graphSlice.hydrate — unsaved-edit protection (BUILDER-SAVE-WIPE-1)", () => {
  const REV = "2026-06-11T00:00:00.000Z";

  function hydrateEmptyThenAddTwoNodes(rev?: string): void {
    const s = useGraphSlice.getState();
    s.hydrate("wf-1", EMPTY_DEF, rev);
    s.addTrigger({ provider: "manual", type: "run" });
    s.addAction({ provider: "http", type: "request" });
  }

  it("does NOT wipe unsaved edits on a SAME-revision re-hydrate (prod repro)", () => {
    hydrateEmptyThenAddTwoNodes(REV);
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(2);
    expect(useGraphSlice.getState().isDirty).toBe(true);
    // Late RSC re-render: same revision, still-empty server draft.
    useGraphSlice.getState().hydrate("wf-1", EMPTY_DEF, REV);
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(2);
    expect(useGraphSlice.getState().isDirty).toBe(true);
  });

  it("does NOT wipe unsaved edits on a revision-less re-hydrate", () => {
    hydrateEmptyThenAddTwoNodes(REV);
    useGraphSlice.getState().hydrate("wf-1", EMPTY_DEF);
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(2);
  });

  it("does NOT wipe unsaved edits on an older-revision re-hydrate", () => {
    hydrateEmptyThenAddTwoNodes(REV);
    useGraphSlice.getState().hydrate("wf-1", EMPTY_DEF, "2025-01-01T00:00:00.000Z");
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(2);
  });

  it("still applies a clean (non-dirty) equal-revision re-hydrate (idempotent)", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF, REV);
    // not dirty → an equal-revision re-hydrate may replace.
    useGraphSlice.getState().hydrate("wf-1", EMPTY_DEF, REV);
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(0);
  });

  it("still applies a strictly-NEWER revision even with edits (external write wins)", () => {
    hydrateEmptyThenAddTwoNodes(REV);
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF, "2027-01-01T00:00:00.000Z");
    expect(useGraphSlice.getState().pendingNodes).toEqual(TRIGGER_DEF.nodes);
  });
});

describe("graphSlice.save — persists the current graph after a same-revision re-hydrate", () => {
  const REV = "2026-06-11T00:00:00.000Z";
  const SERVER_REV = "2026-06-11T00:10:00.000Z";

  it("sends the added nodes (never the wiped empty graph) and tracks the new revision", async () => {
    const s = useGraphSlice.getState();
    s.hydrate("wf-1", EMPTY_DEF, REV);
    s.addTrigger({ provider: "manual", type: "run" });
    s.addAction({ provider: "http", type: "request" });
    // Late RSC re-render — same revision, still-empty server draft (pre-fix wiped).
    s.hydrate("wf-1", EMPTY_DEF, REV);

    mockUpdateWorkflow.mockResolvedValueOnce({
      id: "wf-1",
      updatedAt: SERVER_REV,
      draftDefinition: {
        nodes: useGraphSlice.getState().pendingNodes,
        edges: useGraphSlice.getState().pendingEdges,
      },
    });

    await useGraphSlice.getState().save();

    expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
    const body = mockUpdateWorkflow.mock.calls[0]![1] as {
      draftDefinition: { nodes: unknown[]; edges: unknown[] };
    };
    // The PATCH payload must carry the trigger + action — never an empty graph.
    expect(body.draftDefinition.nodes).toHaveLength(2);
    expect(body.draftDefinition.edges).toHaveLength(1);
    // Revision now tracks the server so further edits aren't clobbered.
    expect(useGraphSlice.getState().hydratedRevision).toBe(SERVER_REV);
    expect(useGraphSlice.getState().isDirty).toBe(false);
  });
});

describe("graphSlice.addTrigger", () => {
  it("adds a trigger node and marks dirty", () => {
    useGraphSlice.getState().hydrate("wf-1", EMPTY_DEF);
    const node = useGraphSlice.getState().addTrigger({ provider: "slack" });
    const s = useGraphSlice.getState();
    expect(s.pendingNodes).toHaveLength(1);
    expect(s.pendingNodes[0]).toMatchObject({
      kind: "trigger",
      provider: "slack",
      type: "",
      config: {},
    });
    expect(s.pendingNodes[0]?.id).toBe(node.id);
    expect(s.isDirty).toBe(true);
  });

  it("rejects a second trigger when one already exists", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF);
    expect(() =>
      useGraphSlice.getState().addTrigger({ provider: "gmail" }),
    ).toThrow(/already has a trigger/i);
    // No state mutation on rejection.
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(1);
    expect(useGraphSlice.getState().isDirty).toBe(false);
  });
});

describe("graphSlice.addAction", () => {
  it("appends an action and stitches an edge from the previous tail", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF);
    const action = useGraphSlice.getState().addAction({ provider: "slack" });
    const s = useGraphSlice.getState();
    expect(s.pendingNodes).toHaveLength(2);
    expect(s.pendingNodes[1]).toMatchObject({
      kind: "action",
      provider: "slack",
      type: "",
    });
    expect(s.pendingEdges).toHaveLength(1);
    expect(s.pendingEdges[0]).toMatchObject({
      from: "t1",
      to: action.id,
    });
    expect(s.isDirty).toBe(true);
  });

  it("refuses to add an action before a trigger exists", () => {
    useGraphSlice.getState().hydrate("wf-1", EMPTY_DEF);
    expect(() =>
      useGraphSlice.getState().addAction({ provider: "slack" }),
    ).toThrow(/trigger/i);
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(0);
  });
});

// ─── Slice 4.BUILDER-CANVAS-LAYOUT-1 — append at end of chain, no overlap ───
describe("graphSlice.addAction — chain-tail anchor + non-overlap (BUILDER-CANVAS-LAYOUT-1)", () => {
  it("places a freshly-built linear chain in the same even column as before", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF);
    const a1 = useGraphSlice.getState().addAction({ provider: "slack" });
    const a2 = useGraphSlice.getState().addAction({ provider: "gmail" });
    const nodes = useGraphSlice.getState().pendingNodes;
    expect(nodes.find((n) => n.id === a1.id)!.position).toEqual({ x: 0, y: 120 });
    expect(nodes.find((n) => n.id === a2.id)!.position).toEqual({ x: 0, y: 240 });
  });

  it("anchors on the CHAIN tail (sole leaf), not the array tail", () => {
    // Array order puts the chain tail (a2) in the MIDDLE of the array.
    const def: WorkflowDefinition = {
      nodes: [
        { id: "t1", kind: "trigger", provider: "slack", type: "m", config: {}, position: { x: 0, y: 0 } },
        { id: "a2", kind: "action", provider: "gmail", type: "x", config: {}, position: { x: 0, y: 240 } },
        { id: "a1", kind: "action", provider: "slack", type: "x", config: {}, position: { x: 0, y: 120 } },
      ],
      edges: [
        { id: "e1", from: "t1", to: "a1" },
        { id: "e2", from: "a1", to: "a2" },
      ],
    };
    useGraphSlice.getState().hydrate("wf-1", def);
    const added = useGraphSlice.getState().addAction({ provider: "http" });
    const edge = useGraphSlice.getState().pendingEdges.find((e) => e.to === added.id)!;
    // Edge stitched from the real chain tail a2 (array tail is a1).
    expect(edge.from).toBe("a2");
  });

  it("never overlaps an existing node after a delete shrinks the array (the old bug)", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF);
    useGraphSlice.getState().addAction({ provider: "slack" }); // a1 @ y120
    useGraphSlice.getState().addAction({ provider: "gmail" }); // a2 @ y240
    const a3 = useGraphSlice.getState().addAction({ provider: "http" }); // a3 @ y360
    // Delete the middle node a2; a1 → a3 rewires. Array now has 3 nodes again.
    const a2 = useGraphSlice.getState().pendingNodes.find((n) => n.position.y === 240)!;
    useGraphSlice.getState().deleteNodeAndRewire(a2.id);
    // Append again. Old heuristic (length*120 = 360) would collide with a3 @ y360.
    const a4 = useGraphSlice.getState().addAction({ provider: "notion" });
    const nodes = useGraphSlice.getState().pendingNodes;
    const a4Pos = nodes.find((n) => n.id === a4.id)!.position;
    const a3Pos = nodes.find((n) => n.id === a3.id)!.position;
    expect(a4Pos).not.toEqual(a3Pos);
    // a4 sits a clean row below the chain tail a3.
    expect(a4Pos).toEqual({ x: 0, y: 480 });
    // Edge stitched from the chain tail a3.
    expect(useGraphSlice.getState().pendingEdges.find((e) => e.to === a4.id)!.from).toBe(a3.id);
  });
});

describe("graphSlice.addActionAfter (BUILDER-CANVAS-ERGONOMICS-FIX-1)", () => {
  it("appends after a SPECIFIC node and stitches the edge from it (branch-specific)", () => {
    // Branch: trigger → a, trigger → b. Append after b explicitly.
    const def: WorkflowDefinition = {
      nodes: [
        { id: "t1", kind: "trigger", provider: "slack", type: "m", config: {}, position: { x: 0, y: 0 } },
        { id: "a", kind: "action", provider: "slack", type: "x", config: {}, position: { x: 0, y: 120 } },
        { id: "b", kind: "action", provider: "gmail", type: "x", config: {}, position: { x: 320, y: 120 } },
      ],
      edges: [
        { id: "e1", from: "t1", to: "a" },
        { id: "e2", from: "t1", to: "b" },
      ],
    };
    useGraphSlice.getState().hydrate("wf-1", def);
    const added = useGraphSlice.getState().addActionAfter("b", { provider: "http" });
    const s = useGraphSlice.getState();
    // Edge stitched from b (the chosen branch end), NOT a or the trigger.
    expect(s.pendingEdges.find((e) => e.to === added.id)!.from).toBe("b");
    // Non-overlapping with every existing node.
    const others = s.pendingNodes.filter((n) => n.id !== added.id);
    for (const n of others) {
      expect(
        Math.abs(n.position.x - added.position.x) < 280 &&
          Math.abs(n.position.y - added.position.y) < 100,
      ).toBe(false);
    }
    expect(s.isDirty).toBe(true);
  });

  it("addActionAfterFromMeta derives config + appends after the named node", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF);
    const node = useGraphSlice.getState().addActionAfterFromMeta("t1", httpRequestMeta);
    const s = useGraphSlice.getState();
    expect(s.pendingEdges.find((e) => e.to === node.id)!.from).toBe("t1");
    expect(node.provider).toBe("native");
    expect(node.type).toBe("http_request");
  });

  it("throws on an unknown anchor node (never guesses)", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF);
    expect(() =>
      useGraphSlice.getState().addActionAfter("ghost", { provider: "slack" }),
    ).toThrow(/unknown node/i);
  });
});

describe("graphSlice.autoLayout (BUILDER-CANVAS-LAYOUT-1)", () => {
  it("re-lays a messy linear chain into a clean column and flips dirty", () => {
    const def: WorkflowDefinition = {
      nodes: [
        { id: "t1", kind: "trigger", provider: "slack", type: "m", config: {}, position: { x: 50, y: 50 } },
        { id: "a1", kind: "action", provider: "gmail", type: "x", config: {}, position: { x: 50, y: 60 } },
        { id: "a2", kind: "action", provider: "http", type: "x", config: {}, position: { x: 50, y: 55 } },
      ],
      edges: [
        { id: "e1", from: "t1", to: "a1" },
        { id: "e2", from: "a1", to: "a2" },
      ],
    };
    useGraphSlice.getState().hydrate("wf-1", def);
    expect(useGraphSlice.getState().isDirty).toBe(false);
    useGraphSlice.getState().autoLayout();
    const nodes = useGraphSlice.getState().pendingNodes;
    expect(nodes.find((n) => n.id === "t1")!.position).toEqual({ x: 0, y: 0 });
    expect(nodes.find((n) => n.id === "a1")!.position).toEqual({ x: 0, y: 120 });
    expect(nodes.find((n) => n.id === "a2")!.position).toEqual({ x: 0, y: 240 });
    expect(useGraphSlice.getState().isDirty).toBe(true);
  });

  it("is a no-op (no dirty flip) when the layout is already tidy", () => {
    const def: WorkflowDefinition = {
      nodes: [
        { id: "t1", kind: "trigger", provider: "slack", type: "m", config: {}, position: { x: 0, y: 0 } },
        { id: "a1", kind: "action", provider: "gmail", type: "x", config: {}, position: { x: 0, y: 120 } },
      ],
      edges: [{ id: "e1", from: "t1", to: "a1" }],
    };
    useGraphSlice.getState().hydrate("wf-1", def);
    useGraphSlice.getState().autoLayout();
    expect(useGraphSlice.getState().isDirty).toBe(false);
  });

  it("is a no-op on an empty graph", () => {
    useGraphSlice.getState().hydrate("wf-1", EMPTY_DEF);
    useGraphSlice.getState().autoLayout();
    expect(useGraphSlice.getState().isDirty).toBe(false);
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(0);
  });
});

describe("graphSlice.removeNode", () => {
  it("removes the node and its connected edges; dirty flips on", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF);
    const action = useGraphSlice.getState().addAction({ provider: "slack" });
    // Sanity check: edge exists.
    expect(useGraphSlice.getState().pendingEdges).toHaveLength(1);
    useGraphSlice.getState().removeNode(action.id);
    const s = useGraphSlice.getState();
    expect(s.pendingNodes.find((n) => n.id === action.id)).toBeUndefined();
    expect(
      s.pendingEdges.find((e) => e.from === action.id || e.to === action.id),
    ).toBeUndefined();
    expect(s.isDirty).toBe(true);
  });

  it("no-op on unknown id (does not flip dirty)", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF);
    useGraphSlice.getState().removeNode("ghost");
    expect(useGraphSlice.getState().isDirty).toBe(false);
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(1);
  });
});

describe("graphSlice.save", () => {
  it("calls updateWorkflow with the pending definition and reconciles saved* on success", async () => {
    useGraphSlice.getState().hydrate("wf-1", EMPTY_DEF);
    useGraphSlice.getState().addTrigger({ provider: "slack" });
    const pending = useGraphSlice.getState().pendingNodes;
    mockUpdateWorkflow.mockResolvedValueOnce({
      id: "wf-1",
      name: "x",
      state: "draft",
      disabledReason: null,
      disabledContext: null,
      activeRevisionId: null,
      draftDefinition: { nodes: pending, edges: [] },
      deletedAt: null,
      createdAt: "2026-05-06T00:00:00Z",
      updatedAt: "2026-05-06T00:01:00Z",
    });

    await useGraphSlice.getState().save();

    expect(mockUpdateWorkflow).toHaveBeenCalledWith(
      "wf-1",
      expect.objectContaining({
        draftDefinition: expect.objectContaining({ nodes: pending, edges: [] }),
      }),
    );
    const s = useGraphSlice.getState();
    expect(s.savedNodes).toEqual(pending);
    expect(s.isDirty).toBe(false);
    expect(s.isSaving).toBe(false);
    expect(s.saveError).toBeNull();
  });

  it("captures WorkflowApiError into saveError; pending* untouched", async () => {
    useGraphSlice.getState().hydrate("wf-1", EMPTY_DEF);
    useGraphSlice.getState().addTrigger({ provider: "slack" });
    const before = useGraphSlice.getState().pendingNodes;
    mockUpdateWorkflow.mockRejectedValueOnce(
      new WorkflowApiError("saved elsewhere", "LIFECYCLE_CONFLICT", 409),
    );

    await expect(useGraphSlice.getState().save()).rejects.toThrow(
      /saved elsewhere/,
    );
    const s = useGraphSlice.getState();
    expect(s.isSaving).toBe(false);
    expect(s.saveError).toBe("saved elsewhere");
    expect(s.isDirty).toBe(true); // user's edits preserved
    expect(s.pendingNodes).toEqual(before);
  });

  it("uses generic message for non-WorkflowApiError failures", async () => {
    useGraphSlice.getState().hydrate("wf-1", EMPTY_DEF);
    useGraphSlice.getState().addTrigger({ provider: "slack" });
    mockUpdateWorkflow.mockRejectedValueOnce(new Error("network"));

    await expect(useGraphSlice.getState().save()).rejects.toThrow();
    expect(useGraphSlice.getState().saveError).toMatch(/failed to save/i);
  });

  it("throws when called before hydrate (programmer error guard)", async () => {
    await expect(useGraphSlice.getState().save()).rejects.toThrow(
      /before hydrate/i,
    );
  });

  it("single-flights concurrent saves (second call is a no-op)", async () => {
    useGraphSlice.getState().hydrate("wf-1", EMPTY_DEF);
    useGraphSlice.getState().addTrigger({ provider: "slack" });
    let resolveCall: (v: unknown) => void = () => {};
    mockUpdateWorkflow.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCall = resolve;
        }),
    );

    const p1 = useGraphSlice.getState().save();
    const p2 = useGraphSlice.getState().save();
    expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
    resolveCall({
      draftDefinition: { nodes: useGraphSlice.getState().pendingNodes, edges: [] },
    });
    await Promise.all([p1, p2]);
  });
});

// ─── Slice 3.2 extensions ────────────────────────────────────────────────────

import type { ActionMeta } from "@/contracts/actionMeta";
import {
  deriveDefaultConfig,
  findSoleRootActionId,
} from "@/features/workflow-builder/state/graphSlice";

const httpRequestMeta: ActionMeta = {
  key: "native:http_request",
  provider: "native",
  type: "http_request",
  displayName: "HTTP Request",
  description: "Make an HTTP request.",
  category: "http",
  requiresIntegration: false,
  fields: [
    {
      name: "method",
      label: "Method",
      type: "select",
      required: true,
      options: [{ value: "GET", label: "GET" }],
    },
    {
      name: "url",
      label: "URL",
      type: "text",
      required: true,
    },
    {
      name: "timeoutSeconds",
      label: "Timeout",
      type: "number",
      required: false,
      defaultValue: 15,
      numeric: { min: 1, max: 30, integer: true, step: 1 },
    },
  ],
  outputs: [],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};

describe("deriveDefaultConfig", () => {
  it("returns only fields that declare a defaultValue", () => {
    expect(deriveDefaultConfig(httpRequestMeta)).toEqual({ timeoutSeconds: 15 });
  });
});

describe("graphSlice.addActionFromMeta", () => {
  it("creates a node with provider/type from the meta and default config", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF);
    const node = useGraphSlice.getState().addActionFromMeta(httpRequestMeta);
    expect(node).toMatchObject({
      provider: "native",
      type: "http_request",
      config: { timeoutSeconds: 15 },
      kind: "action",
    });
    expect(useGraphSlice.getState().isDirty).toBe(true);
  });

  it("refuses to add an action before a trigger exists (delegates to addAction)", () => {
    useGraphSlice.getState().hydrate("wf-1", EMPTY_DEF);
    expect(() =>
      useGraphSlice.getState().addActionFromMeta(httpRequestMeta),
    ).toThrow(/trigger/i);
  });
});

// ─── Slice 3.3 — trigger meta extension ──────────────────────────────────────

import type { TriggerMeta } from "@/contracts/triggerMeta";

const scheduledTriggerMeta: TriggerMeta = {
  key: "native:schedule.fired",
  provider: "native",
  type: "schedule.fired",
  displayName: "Scheduled Trigger",
  description: "Fires on a cron expression.",
  category: "scheduling",
  activation: "scheduled",
  requiresIntegration: false,
  fields: [
    {
      name: "cronExpression",
      label: "Cron Expression",
      type: "cron",
      required: true,
      defaultValue: "0 9 * * 1-5",
    },
  ],
  payloadShape: [],
  displayOrder: 20,
};

const manualTriggerMeta: TriggerMeta = {
  key: "native:manual.run",
  provider: "native",
  type: "manual.run",
  displayName: "Manual Trigger",
  description: "Runs when you click Run Now.",
  category: "logic",
  activation: "manual",
  requiresIntegration: false,
  fields: [],
  payloadShape: [],
  displayOrder: 10,
};

describe("deriveDefaultConfig — TriggerMeta variant", () => {
  it("returns only fields that declare a defaultValue (scheduled trigger)", () => {
    expect(deriveDefaultConfig(scheduledTriggerMeta)).toEqual({
      cronExpression: "0 9 * * 1-5",
    });
  });

  it("returns empty for fields-less manual trigger", () => {
    expect(deriveDefaultConfig(manualTriggerMeta)).toEqual({});
  });
});

describe("graphSlice.addTriggerFromMeta", () => {
  it("creates a trigger node with provider/type from the meta and default config", () => {
    useGraphSlice.getState().hydrate("wf-1", EMPTY_DEF);
    const node = useGraphSlice
      .getState()
      .addTriggerFromMeta(scheduledTriggerMeta);
    expect(node).toMatchObject({
      kind: "trigger",
      provider: "native",
      type: "schedule.fired",
      config: { cronExpression: "0 9 * * 1-5" },
    });
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(1);
    expect(useGraphSlice.getState().isDirty).toBe(true);
  });

  it("creates a manual trigger with empty config", () => {
    useGraphSlice.getState().hydrate("wf-1", EMPTY_DEF);
    const node = useGraphSlice
      .getState()
      .addTriggerFromMeta(manualTriggerMeta);
    expect(node).toMatchObject({
      kind: "trigger",
      provider: "native",
      type: "manual.run",
      config: {},
    });
  });

  it("refuses to add a second trigger when one already exists (delegates to addTrigger)", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF);
    expect(() =>
      useGraphSlice.getState().addTriggerFromMeta(manualTriggerMeta),
    ).toThrow(/already has a trigger/i);
    // No state mutation on rejection.
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(1);
    expect(useGraphSlice.getState().isDirty).toBe(false);
  });
});

// ─── Slice 4.BUILDER-TRIGGER-RECOVERY-1 — trigger auto-connect on recovery ───

const SINGLE_ACTION_NO_TRIGGER_DEF: WorkflowDefinition = {
  nodes: [
    {
      id: "a1",
      kind: "action",
      provider: "slack",
      type: "send_message",
      config: {},
      position: { x: 0, y: 120 },
    },
  ],
  edges: [],
};

const CHAIN_NO_TRIGGER_DEF: WorkflowDefinition = {
  // a1 → a2 with the trigger deleted: a1 is the sole root (no incoming edge),
  // a2 has an incoming edge from a1.
  nodes: [
    {
      id: "a1",
      kind: "action",
      provider: "slack",
      type: "send_message",
      config: {},
      position: { x: 0, y: 120 },
    },
    {
      id: "a2",
      kind: "action",
      provider: "github",
      type: "add_comment",
      config: {},
      position: { x: 0, y: 240 },
    },
  ],
  edges: [{ id: "e1", from: "a1", to: "a2" }],
};

const TWO_ROOT_ACTIONS_NO_TRIGGER_DEF: WorkflowDefinition = {
  // Two disconnected root actions — ambiguous which one a trigger should
  // attach to, so auto-connect must NOT create an edge.
  nodes: [
    {
      id: "a1",
      kind: "action",
      provider: "slack",
      type: "send_message",
      config: {},
      position: { x: 0, y: 120 },
    },
    {
      id: "a2",
      kind: "action",
      provider: "github",
      type: "add_comment",
      config: {},
      position: { x: 200, y: 120 },
    },
  ],
  edges: [],
};

describe("graphSlice.addTriggerFromMeta — recovery auto-connect", () => {
  it("connects the new trigger to the sole root action and preserves the action", () => {
    useGraphSlice.getState().hydrate("wf-1", SINGLE_ACTION_NO_TRIGGER_DEF);
    const trigger = useGraphSlice
      .getState()
      .addTriggerFromMeta(manualTriggerMeta);
    const s = useGraphSlice.getState();
    // Action is preserved; trigger added.
    expect(s.pendingNodes).toHaveLength(2);
    expect(s.pendingNodes.some((n) => n.id === "a1")).toBe(true);
    // Exactly one edge: trigger → a1.
    expect(s.pendingEdges).toHaveLength(1);
    expect(s.pendingEdges[0]).toMatchObject({ from: trigger.id, to: "a1" });
    expect(s.isDirty).toBe(true);
  });

  it("connects the trigger to the chain's root (first) action, not a mid-chain action", () => {
    useGraphSlice.getState().hydrate("wf-1", CHAIN_NO_TRIGGER_DEF);
    const trigger = useGraphSlice
      .getState()
      .addTriggerFromMeta(manualTriggerMeta);
    const s = useGraphSlice.getState();
    expect(s.pendingNodes).toHaveLength(3);
    // Original a1 → a2 edge preserved, plus the new trigger → a1 edge.
    expect(s.pendingEdges).toHaveLength(2);
    expect(
      s.pendingEdges.some((e) => e.from === trigger.id && e.to === "a1"),
    ).toBe(true);
    expect(s.pendingEdges.some((e) => e.from === "a1" && e.to === "a2")).toBe(
      true,
    );
    // No edge straight to the mid-chain node.
    expect(
      s.pendingEdges.some((e) => e.from === trigger.id && e.to === "a2"),
    ).toBe(false);
  });

  it("does NOT auto-connect when there are multiple root actions (ambiguous)", () => {
    useGraphSlice.getState().hydrate("wf-1", TWO_ROOT_ACTIONS_NO_TRIGGER_DEF);
    const trigger = useGraphSlice
      .getState()
      .addTriggerFromMeta(manualTriggerMeta);
    const s = useGraphSlice.getState();
    // Trigger added, both actions preserved, but no unsafe edge created.
    expect(s.pendingNodes).toHaveLength(3);
    expect(s.pendingEdges).toHaveLength(0);
    expect(
      s.pendingEdges.some((e) => e.from === trigger.id),
    ).toBe(false);
  });

  it("creates no edge for the empty-canvas first-trigger flow (no actions)", () => {
    useGraphSlice.getState().hydrate("wf-1", EMPTY_DEF);
    useGraphSlice.getState().addTriggerFromMeta(manualTriggerMeta);
    const s = useGraphSlice.getState();
    expect(s.pendingNodes).toHaveLength(1);
    expect(s.pendingEdges).toHaveLength(0);
  });
});

describe("findSoleRootActionId", () => {
  it("returns the sole root action id", () => {
    expect(
      findSoleRootActionId(
        SINGLE_ACTION_NO_TRIGGER_DEF.nodes,
        SINGLE_ACTION_NO_TRIGGER_DEF.edges,
      ),
    ).toBe("a1");
  });

  it("returns null when zero or multiple root actions exist", () => {
    expect(findSoleRootActionId([], [])).toBeNull();
    expect(
      findSoleRootActionId(
        TWO_ROOT_ACTIONS_NO_TRIGGER_DEF.nodes,
        TWO_ROOT_ACTIONS_NO_TRIGGER_DEF.edges,
      ),
    ).toBeNull();
  });

  it("ignores trigger nodes — only actions count as roots", () => {
    expect(findSoleRootActionId(TRIGGER_DEF.nodes, TRIGGER_DEF.edges)).toBeNull();
  });
});

describe("graphSlice.addTrigger — config passthrough (Slice 3.3)", () => {
  it("uses the supplied config when provided", () => {
    useGraphSlice.getState().hydrate("wf-1", EMPTY_DEF);
    const node = useGraphSlice.getState().addTrigger({
      provider: "native",
      type: "schedule.fired",
      config: { cronExpression: "*/30 * * * *" },
    });
    expect(node.config).toEqual({ cronExpression: "*/30 * * * *" });
  });

  it("defaults to empty config when not supplied (Slice 1I.2 behavior preserved)", () => {
    useGraphSlice.getState().hydrate("wf-1", EMPTY_DEF);
    const node = useGraphSlice.getState().addTrigger({ provider: "slack" });
    expect(node.config).toEqual({});
  });
});

describe("graphSlice.updateNodeConfig", () => {
  beforeEach(() => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF);
  });

  it("replaces the named node's config and marks dirty", () => {
    const node = useGraphSlice.getState().addActionFromMeta(httpRequestMeta);
    // Saving the node + clearing dirty is the caller's concern in real code;
    // here we just compare before/after the update.
    useGraphSlice.getState().updateNodeConfig(node.id, {
      method: "POST",
      url: "https://example.com",
      timeoutSeconds: 30,
    });
    const updated = useGraphSlice
      .getState()
      .pendingNodes.find((n) => n.id === node.id);
    expect(updated?.config).toEqual({
      method: "POST",
      url: "https://example.com",
      timeoutSeconds: 30,
    });
    expect(useGraphSlice.getState().isDirty).toBe(true);
  });

  it("no-op when the supplied config is shallow-equal to the existing one", () => {
    const node = useGraphSlice.getState().addActionFromMeta(httpRequestMeta);
    // First update with new values to flip dirty back to false would require a save;
    // instead, snapshot pendingNodes reference and assert the second update doesn't
    // produce a new reference.
    const before = useGraphSlice.getState().pendingNodes;
    useGraphSlice.getState().updateNodeConfig(node.id, { timeoutSeconds: 15 });
    expect(useGraphSlice.getState().pendingNodes).toBe(before);
  });

  it("no-op when the nodeId is unknown", () => {
    const before = useGraphSlice.getState().pendingNodes;
    useGraphSlice.getState().updateNodeConfig("ghost", { x: 1 });
    expect(useGraphSlice.getState().pendingNodes).toBe(before);
  });
});

// ─── Slice 4.BUILDER-NODE-IDENTITY-1 — user-facing node rename ───────────────

describe("graphSlice.renameNode", () => {
  beforeEach(() => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF);
  });

  it("sets the node's displayName, marks dirty, and leaves identity untouched", () => {
    useGraphSlice.getState().renameNode("t1", "Notify Support Team");
    const node = useGraphSlice.getState().pendingNodes.find((n) => n.id === "t1")!;
    expect(node.displayName).toBe("Notify Support Team");
    // id / provider / type / config are NEVER changed by a rename.
    expect(node.id).toBe("t1");
    expect(node.provider).toBe("slack");
    expect(node.type).toBe("message_received");
    expect(node.config).toEqual({});
    expect(useGraphSlice.getState().isDirty).toBe(true);
  });

  it("trims the name and clears it (back to undefined) when blank — falls back to default", () => {
    useGraphSlice.getState().renameNode("t1", "  Spaced Name  ");
    expect(useGraphSlice.getState().pendingNodes.find((n) => n.id === "t1")!.displayName).toBe("Spaced Name");
    useGraphSlice.getState().renameNode("t1", "   ");
    expect(useGraphSlice.getState().pendingNodes.find((n) => n.id === "t1")!.displayName).toBeUndefined();
  });

  it("no-op (same reference) when the value is unchanged", () => {
    useGraphSlice.getState().renameNode("t1", "Same");
    const before = useGraphSlice.getState().pendingNodes;
    useGraphSlice.getState().renameNode("t1", "Same");
    expect(useGraphSlice.getState().pendingNodes).toBe(before);
  });

  it("no-op on an unknown nodeId", () => {
    const before = useGraphSlice.getState().pendingNodes;
    useGraphSlice.getState().renameNode("ghost", "X");
    expect(useGraphSlice.getState().pendingNodes).toBe(before);
  });

  it("persists displayName through save → re-hydrate", async () => {
    useGraphSlice.getState().renameNode("t1", "Watcher");
    const pending = useGraphSlice.getState().pendingNodes;
    mockUpdateWorkflow.mockResolvedValueOnce({
      id: "wf-1",
      name: "x",
      state: "draft",
      disabledReason: null,
      disabledContext: null,
      activeRevisionId: null,
      draftDefinition: { nodes: pending, edges: [] },
      deletedAt: null,
      createdAt: "2026-05-06T00:00:00Z",
      updatedAt: "2026-05-06T00:01:00Z",
    });
    await useGraphSlice.getState().save();
    // The saved payload carries displayName; re-hydrating from it preserves it.
    expect(mockUpdateWorkflow).toHaveBeenCalledWith(
      "wf-1",
      expect.objectContaining({
        draftDefinition: expect.objectContaining({
          nodes: expect.arrayContaining([expect.objectContaining({ id: "t1", displayName: "Watcher" })]),
        }),
      }),
    );
    expect(useGraphSlice.getState().savedNodes.find((n) => n.id === "t1")!.displayName).toBe("Watcher");
  });
});

// ─── Slice 3.5 — canvas-driven actions ──────────────────────────────────────

describe("graphSlice.updateNodePosition", () => {
  beforeEach(() => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF);
  });

  it("replaces the named node's position and flips dirty", () => {
    useGraphSlice
      .getState()
      .updateNodePosition("t1", { x: 200, y: 80 });
    const moved = useGraphSlice
      .getState()
      .pendingNodes.find((n) => n.id === "t1");
    expect(moved?.position).toEqual({ x: 200, y: 80 });
    expect(useGraphSlice.getState().isDirty).toBe(true);
  });

  it("no-op when the position is shallow-equal (click without drag)", () => {
    const before = useGraphSlice.getState().pendingNodes;
    useGraphSlice
      .getState()
      .updateNodePosition("t1", { x: 0, y: 0 });
    expect(useGraphSlice.getState().pendingNodes).toBe(before);
    expect(useGraphSlice.getState().isDirty).toBe(false);
  });

  it("no-op when the nodeId is unknown", () => {
    const before = useGraphSlice.getState().pendingNodes;
    useGraphSlice
      .getState()
      .updateNodePosition("ghost", { x: 1, y: 2 });
    expect(useGraphSlice.getState().pendingNodes).toBe(before);
    expect(useGraphSlice.getState().isDirty).toBe(false);
  });

  it("does not touch unrelated nodes", () => {
    useGraphSlice.getState().addAction({ provider: "slack" });
    const otherBefore = useGraphSlice
      .getState()
      .pendingNodes.find((n) => n.id !== "t1")!;
    useGraphSlice
      .getState()
      .updateNodePosition("t1", { x: 1, y: 2 });
    const otherAfter = useGraphSlice
      .getState()
      .pendingNodes.find((n) => n.id !== "t1")!;
    expect(otherAfter).toBe(otherBefore);
  });
});

describe("graphSlice.connectNodes", () => {
  beforeEach(() => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF);
    useGraphSlice.getState().addAction({ provider: "slack" });
    useGraphSlice.getState().addAction({ provider: "gmail" });
  });

  it("adds an edge between two existing nodes and flips dirty", () => {
    // addAction auto-stitches edges trigger→A→B, so we connect
    // trigger→B (a non-adjacent pair) to exercise connectNodes without
    // colliding with the existing auto-stitched edges.
    const { pendingNodes, pendingEdges } = useGraphSlice.getState();
    const from = pendingNodes[0]!.id;
    const to = pendingNodes[2]!.id;
    const initialEdgeCount = pendingEdges.length;
    // Reset dirty after the addAction-driven flip so we measure connectNodes alone.
    useGraphSlice.setState({ isDirty: false });
    const edge = useGraphSlice.getState().connectNodes({ from, to });
    expect(edge.from).toBe(from);
    expect(edge.to).toBe(to);
    const after = useGraphSlice.getState();
    expect(after.pendingEdges).toHaveLength(initialEdgeCount + 1);
    expect(after.pendingEdges).toContainEqual(edge);
    expect(after.isDirty).toBe(true);
  });

  it("throws on self-loop", () => {
    const id = useGraphSlice.getState().pendingNodes[0]!.id;
    expect(() =>
      useGraphSlice.getState().connectNodes({ from: id, to: id }),
    ).toThrow(/self-loops/i);
  });

  it("throws when the source is unknown", () => {
    const id = useGraphSlice.getState().pendingNodes[0]!.id;
    expect(() =>
      useGraphSlice.getState().connectNodes({ from: "ghost", to: id }),
    ).toThrow(/unknown source node/i);
  });

  it("throws when the target is unknown", () => {
    const id = useGraphSlice.getState().pendingNodes[0]!.id;
    expect(() =>
      useGraphSlice.getState().connectNodes({ from: id, to: "ghost" }),
    ).toThrow(/unknown target node/i);
  });

  it("rejects duplicate unlabeled edges between the same (from, to)", () => {
    // Use a non-adjacent pair so the first connectNodes succeeds (the
    // auto-stitched edges already cover trigger→A and A→B).
    const { pendingNodes } = useGraphSlice.getState();
    const from = pendingNodes[0]!.id;
    const to = pendingNodes[2]!.id;
    useGraphSlice.getState().connectNodes({ from, to });
    expect(() =>
      useGraphSlice.getState().connectNodes({ from, to }),
    ).toThrow(/already exists/i);
  });
});

// ─── Slice 4.BUILDER-NODE-DELETE-1 — safe delete + rewire ────────────────────

describe("graphSlice.deleteNodeAndRewire", () => {
  function seedABC(): { aId: string; bId: string; cId: string } {
    useGraphSlice.getState().reset();
    useGraphSlice.getState().hydrate("wf-1", {
      nodes: [
        {
          id: "a",
          kind: "trigger",
          provider: "slack",
          type: "slack.message",
          config: {},
          position: { x: 0, y: 0 },
        },
        {
          id: "b",
          kind: "action",
          provider: "native",
          type: "noop",
          config: {},
          position: { x: 100, y: 100 },
        },
        {
          id: "c",
          kind: "action",
          provider: "native",
          type: "noop",
          config: {},
          position: { x: 200, y: 200 },
        },
      ],
      edges: [
        { id: "e-a-b", from: "a", to: "b" },
        { id: "e-b-c", from: "b", to: "c" },
      ],
    });
    return { aId: "a", bId: "b", cId: "c" };
  }

  it("deletes a middle action, rewires A → C, drops the bracketing edges, and flips dirty", () => {
    seedABC();
    const out = useGraphSlice.getState().deleteNodeAndRewire("b");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.deletedNodeId).toBe("b");
    expect(out.rewiredEdgeId).not.toBeNull();
    expect(new Set(out.removedEdgeIds)).toEqual(new Set(["e-a-b", "e-b-c"]));
    expect(out.warning).toBeNull();

    const s = useGraphSlice.getState();
    expect(s.pendingNodes.map((n) => n.id).sort()).toEqual(["a", "c"]);
    expect(s.pendingEdges).toHaveLength(1);
    expect(s.pendingEdges[0]).toMatchObject({
      from: "a",
      to: "c",
      id: out.rewiredEdgeId!,
    });
    expect(s.isDirty).toBe(true);
  });

  it("deletes a last action with no outgoing edges, drops only the incoming edge", () => {
    seedABC();
    useGraphSlice.setState({ isDirty: false });
    const out = useGraphSlice.getState().deleteNodeAndRewire("c");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.rewiredEdgeId).toBeNull();
    expect(out.removedEdgeIds).toEqual(["e-b-c"]);
    const s = useGraphSlice.getState();
    expect(s.pendingNodes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(s.pendingEdges.map((e) => e.id)).toEqual(["e-a-b"]);
    expect(s.isDirty).toBe(true);
  });

  it("deletes a standalone unconnected node — no edge changes", () => {
    useGraphSlice.getState().hydrate("wf-1", {
      nodes: [
        {
          id: "trig",
          kind: "trigger",
          provider: "slack",
          type: "slack.message",
          config: {},
          position: { x: 0, y: 0 },
        },
        {
          id: "orphan",
          kind: "action",
          provider: "native",
          type: "noop",
          config: {},
          position: { x: 200, y: 200 },
        },
      ],
      edges: [],
    });
    useGraphSlice.setState({ isDirty: false });
    const out = useGraphSlice.getState().deleteNodeAndRewire("orphan");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.removedEdgeIds).toEqual([]);
    expect(out.rewiredEdgeId).toBeNull();
    const s = useGraphSlice.getState();
    expect(s.pendingNodes.map((n) => n.id)).toEqual(["trig"]);
    expect(s.pendingEdges).toEqual([]);
    expect(s.isDirty).toBe(true);
  });

  it("deletes a trigger with one outgoing edge — drops trigger + the outgoing edge (no rewire)", () => {
    useGraphSlice.getState().hydrate("wf-1", {
      nodes: [
        {
          id: "trig",
          kind: "trigger",
          provider: "slack",
          type: "slack.message",
          config: {},
          position: { x: 0, y: 0 },
        },
        {
          id: "a",
          kind: "action",
          provider: "native",
          type: "noop",
          config: {},
          position: { x: 100, y: 100 },
        },
      ],
      edges: [{ id: "e-trig-a", from: "trig", to: "a" }],
    });
    const out = useGraphSlice.getState().deleteNodeAndRewire("trig");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.rewiredEdgeId).toBeNull();
    expect(out.removedEdgeIds).toEqual(["e-trig-a"]);
    const s = useGraphSlice.getState();
    expect(s.pendingNodes.map((n) => n.id)).toEqual(["a"]);
    expect(s.pendingEdges).toEqual([]);
    expect(s.isDirty).toBe(true);
  });

  it("blocks a multi-edge fan-in node with downstream — no state mutation", () => {
    useGraphSlice.getState().hydrate("wf-1", {
      nodes: [
        {
          id: "trig",
          kind: "trigger",
          provider: "slack",
          type: "slack.message",
          config: {},
          position: { x: 0, y: 0 },
        },
        {
          id: "alt",
          kind: "action",
          provider: "native",
          type: "noop",
          config: {},
          position: { x: 0, y: 50 },
        },
        {
          id: "mid",
          kind: "action",
          provider: "native",
          type: "noop",
          config: {},
          position: { x: 100, y: 100 },
        },
        {
          id: "c",
          kind: "action",
          provider: "native",
          type: "noop",
          config: {},
          position: { x: 200, y: 200 },
        },
      ],
      edges: [
        { id: "e-trig-mid", from: "trig", to: "mid" },
        { id: "e-alt-mid", from: "alt", to: "mid" },
        { id: "e-mid-c", from: "mid", to: "c" },
      ],
    });
    useGraphSlice.setState({ isDirty: false });
    const beforeNodes = useGraphSlice.getState().pendingNodes;
    const beforeEdges = useGraphSlice.getState().pendingEdges;

    const out = useGraphSlice.getState().deleteNodeAndRewire("mid");
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("cannot_rewire_multi_edge");
    expect(out.message).toMatch(/multiple paths/i);

    // No state change on blocked outcome.
    expect(useGraphSlice.getState().pendingNodes).toBe(beforeNodes);
    expect(useGraphSlice.getState().pendingEdges).toBe(beforeEdges);
    expect(useGraphSlice.getState().isDirty).toBe(false);
  });

  it("returns unknown_node on a ghost id — no state mutation", () => {
    seedABC();
    useGraphSlice.setState({ isDirty: false });
    const beforeNodes = useGraphSlice.getState().pendingNodes;
    const beforeEdges = useGraphSlice.getState().pendingEdges;
    const out = useGraphSlice.getState().deleteNodeAndRewire("ghost");
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("unknown_node");
    expect(useGraphSlice.getState().pendingNodes).toBe(beforeNodes);
    expect(useGraphSlice.getState().pendingEdges).toBe(beforeEdges);
    expect(useGraphSlice.getState().isDirty).toBe(false);
  });

  it("save() round-trips after a rewire-delete (serialization compatibility)", async () => {
    seedABC();
    useGraphSlice.getState().deleteNodeAndRewire("b");
    const pending = useGraphSlice.getState().pendingNodes;
    const pendingEdges = useGraphSlice.getState().pendingEdges;
    mockUpdateWorkflow.mockResolvedValueOnce({
      id: "wf-1",
      name: "x",
      state: "draft",
      disabledReason: null,
      disabledContext: null,
      activeRevisionId: null,
      draftDefinition: { nodes: pending, edges: pendingEdges },
      deletedAt: null,
      createdAt: "2026-05-06T00:00:00Z",
      updatedAt: "2026-05-06T00:01:00Z",
    });
    await useGraphSlice.getState().save();
    expect(mockUpdateWorkflow).toHaveBeenCalledWith(
      "wf-1",
      expect.objectContaining({
        draftDefinition: expect.objectContaining({
          nodes: pending,
          edges: pendingEdges,
        }),
      }),
    );
    expect(useGraphSlice.getState().isDirty).toBe(false);
    expect(useGraphSlice.getState().saveError).toBeNull();
  });

  it("surfaces a warning when rewire would create a duplicate but still deletes the node", () => {
    useGraphSlice.getState().hydrate("wf-1", {
      nodes: [
        {
          id: "trig",
          kind: "trigger",
          provider: "slack",
          type: "slack.message",
          config: {},
          position: { x: 0, y: 0 },
        },
        {
          id: "mid",
          kind: "action",
          provider: "native",
          type: "noop",
          config: {},
          position: { x: 100, y: 100 },
        },
        {
          id: "c",
          kind: "action",
          provider: "native",
          type: "noop",
          config: {},
          position: { x: 200, y: 200 },
        },
      ],
      edges: [
        { id: "e-trig-mid", from: "trig", to: "mid" },
        { id: "e-mid-c", from: "mid", to: "c" },
        { id: "e-trig-c", from: "trig", to: "c" },
      ],
    });
    const out = useGraphSlice.getState().deleteNodeAndRewire("mid");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.warning).toBe("rewire_would_duplicate");
    expect(out.rewiredEdgeId).toBeNull();
    const s = useGraphSlice.getState();
    expect(s.pendingNodes.map((n) => n.id).sort()).toEqual(["c", "trig"]);
    expect(s.pendingEdges.map((e) => e.id)).toEqual(["e-trig-c"]);
    expect(s.isDirty).toBe(true);
  });
});

describe("graphSlice.removeEdge", () => {
  it("removes the edge by id and flips dirty", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF);
    useGraphSlice.getState().addAction({ provider: "slack" });
    const edgeId = useGraphSlice.getState().pendingEdges[0]!.id;
    useGraphSlice.setState({ isDirty: false });
    useGraphSlice.getState().removeEdge(edgeId);
    const s = useGraphSlice.getState();
    expect(s.pendingEdges.find((e) => e.id === edgeId)).toBeUndefined();
    expect(s.isDirty).toBe(true);
  });

  it("no-op on unknown edge id (does not flip dirty)", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF);
    const before = useGraphSlice.getState().pendingEdges;
    useGraphSlice.getState().removeEdge("ghost");
    expect(useGraphSlice.getState().pendingEdges).toBe(before);
    expect(useGraphSlice.getState().isDirty).toBe(false);
  });
});

// ─── Slice 4.AI-25 — delete + save persistence regression suite ──────────────
//
// Marcus's 2026-05-27 smoke: deleted Manual Trigger → Slack locally, opened
// React Agent, the canvas still showed those nodes. After saving the delete
// first, the issue went away. Root cause = saved-draft rehydration on page
// refresh / re-render (server-component re-load), NOT a bug. These tests pin
// the expected behavior so it can't drift:
//
//   1. Local delete updates pending* immediately + sets isDirty true.
//      saved* is UNCHANGED (the server still has the pre-delete draft).
//   2. Save round-trips: the call posts the post-delete pending payload AND
//      reconciles saved* to match. After save, isDirty is false. A
//      subsequent re-hydrate (Next.js server re-render) sees the empty
//      saved draft from the DB, so the deletion is now permanent.
//   3. WITHOUT save: a forced re-hydrate (simulating a hard refresh that
//      re-loads the saved draft from the DB) DOES override the local
//      delete. This is the user-visible "old nodes came back" behavior —
//      expected because unsaved changes don't survive refresh.

describe("graphSlice — delete + save persistence (AI-25 regression)", () => {
  const TRIGGER_PLUS_ACTION_DEF: WorkflowDefinition = {
    nodes: [
      {
        id: "trig-1",
        kind: "trigger",
        provider: "native",
        type: "manual.run",
        config: {},
        position: { x: 0, y: 0 },
      },
      {
        id: "act-1",
        kind: "action",
        provider: "slack",
        type: "send_channel_message",
        config: {},
        position: { x: 100, y: 0 },
      },
    ],
    edges: [{ id: "e-1", from: "trig-1", to: "act-1" }],
  };

  it("local delete (no save) — pendingNodes empty + isDirty true; savedNodes UNCHANGED", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_PLUS_ACTION_DEF);
    expect(useGraphSlice.getState().isDirty).toBe(false);

    useGraphSlice.getState().deleteNodeAndRewire("act-1");
    useGraphSlice.getState().deleteNodeAndRewire("trig-1");

    const s = useGraphSlice.getState();
    // Pending state reflects the delete immediately.
    expect(s.pendingNodes).toEqual([]);
    expect(s.pendingEdges).toEqual([]);
    expect(s.isDirty).toBe(true);
    // Saved state is unchanged — the server still has the pre-delete draft.
    expect(s.savedNodes.map((n) => n.id)).toEqual(["trig-1", "act-1"]);
    expect(s.savedEdges.map((e) => e.id)).toEqual(["e-1"]);
  });

  it("save after delete — posts the empty payload, reconciles savedNodes to empty, clears isDirty", async () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_PLUS_ACTION_DEF);
    useGraphSlice.getState().deleteNodeAndRewire("act-1");
    useGraphSlice.getState().deleteNodeAndRewire("trig-1");
    // Server returns the empty draft (mirrors the request).
    mockUpdateWorkflow.mockResolvedValueOnce({
      id: "wf-1",
      name: "x",
      state: "draft",
      disabledReason: null,
      disabledContext: null,
      activeRevisionId: null,
      draftDefinition: { nodes: [], edges: [] },
      deletedAt: null,
      createdAt: "2026-05-06T00:00:00Z",
      updatedAt: "2026-05-27T00:01:00Z",
    });

    await useGraphSlice.getState().save();

    // The save call posted the post-delete pending payload.
    expect(mockUpdateWorkflow).toHaveBeenCalledWith(
      "wf-1",
      expect.objectContaining({
        draftDefinition: expect.objectContaining({ nodes: [], edges: [] }),
      }),
    );
    const s = useGraphSlice.getState();
    expect(s.savedNodes).toEqual([]);
    expect(s.savedEdges).toEqual([]);
    expect(s.pendingNodes).toEqual([]);
    expect(s.pendingEdges).toEqual([]);
    expect(s.isDirty).toBe(false);
    expect(s.saveError).toBeNull();
  });

  it("simulated page refresh (re-hydrate from server) AFTER save — deletion is permanent", async () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_PLUS_ACTION_DEF);
    useGraphSlice.getState().deleteNodeAndRewire("act-1");
    useGraphSlice.getState().deleteNodeAndRewire("trig-1");
    mockUpdateWorkflow.mockResolvedValueOnce({
      id: "wf-1",
      name: "x",
      state: "draft",
      disabledReason: null,
      disabledContext: null,
      activeRevisionId: null,
      draftDefinition: { nodes: [], edges: [] },
      deletedAt: null,
      createdAt: "2026-05-06T00:00:00Z",
      updatedAt: "2026-05-27T00:01:00Z",
    });
    await useGraphSlice.getState().save();
    // Page refresh: WorkflowBuilder mount effect re-runs hydrate() with the
    // freshly-loaded server draft. Because we saved, the server draft is
    // empty too.
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    const s = useGraphSlice.getState();
    expect(s.pendingNodes).toEqual([]);
    expect(s.pendingEdges).toEqual([]);
    expect(s.savedNodes).toEqual([]);
    expect(s.savedEdges).toEqual([]);
    expect(s.isDirty).toBe(false);
  });

  it("real page refresh BEFORE save discards unsaved changes (full remount resets in-memory state)", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_PLUS_ACTION_DEF);
    useGraphSlice.getState().deleteNodeAndRewire("act-1");
    useGraphSlice.getState().deleteNodeAndRewire("trig-1");
    expect(useGraphSlice.getState().isDirty).toBe(true);

    // A REAL page refresh tears down the whole client: the module-level store is
    // recreated from INITIAL_STATE (equivalently, the builder's unmount runs
    // reset()). The fresh mount then hydrates the SAVED server draft — which
    // still has the pre-delete nodes because the user never clicked Save. So
    // unsaved changes are discarded by design.
    //
    // NOTE (BUILDER-SAVE-WIPE-1): the discard happens because of the reset, NOT
    // because hydrate clobbers dirty edits. A SPURIOUS same-session re-hydrate
    // WITHOUT a reset must NOT wipe unsaved edits — that path is what caused the
    // prod save-wipe bug and is now guarded (see the unsaved-edit-protection
    // suite). This test models the real-refresh remount: reset → hydrate.
    useGraphSlice.getState().reset();
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_PLUS_ACTION_DEF);
    const s = useGraphSlice.getState();
    expect(s.pendingNodes.map((n) => n.id)).toEqual(["trig-1", "act-1"]);
    expect(s.pendingEdges.map((e) => e.id)).toEqual(["e-1"]);
    // isDirty is false: a fresh hydrate sets pending* === saved*.
    expect(s.isDirty).toBe(false);
  });

  it("save preserves dirty + saveError if the request fails — delete stays local", async () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_PLUS_ACTION_DEF);
    useGraphSlice.getState().deleteNodeAndRewire("act-1");
    useGraphSlice.getState().deleteNodeAndRewire("trig-1");
    mockUpdateWorkflow.mockRejectedValueOnce(
      new WorkflowApiError("network", "SERVER_ERROR", 500),
    );
    await expect(useGraphSlice.getState().save()).rejects.toThrow();
    const s = useGraphSlice.getState();
    expect(s.pendingNodes).toEqual([]);
    expect(s.pendingEdges).toEqual([]);
    expect(s.isDirty).toBe(true);
    expect(s.saveError).toBe("network");
    // Saved* is unchanged — the failed save left the server draft intact.
    expect(s.savedNodes.map((n) => n.id)).toEqual(["trig-1", "act-1"]);
  });
});

describe("graphSlice — applyAdditivePatch (HERMES-AGENT-APPLY-PREVIEW-PATCH)", () => {
  const ADDITIVE_PATCH = {
    kind: "additive" as const,
    nodes: [
      { ref: "p0", kind: "trigger" as const, provider: "gmail", type: "new_email" },
      { ref: "p1", kind: "action" as const, provider: "slack", type: "send_message" },
    ],
    edges: [{ fromRef: "p0", toRef: "p1" }],
  };

  it("blank graph: adds the proposed nodes + edges with EMPTY config, marks dirty, mints real ids", () => {
    useGraphSlice.getState().hydrate("wf-1", EMPTY_DEF);
    const outcome = useGraphSlice.getState().applyAdditivePatch(ADDITIVE_PATCH);
    const s = useGraphSlice.getState();
    expect(outcome.ok).toBe(true);
    expect(s.pendingNodes).toHaveLength(2);
    expect(s.pendingEdges).toHaveLength(1);
    expect(s.pendingNodes.map((n) => `${n.provider}:${n.type}`)).toEqual(["gmail:new_email", "slack:send_message"]);
    // Real ids (not patch refs) + empty config (nothing inferred).
    expect(s.pendingNodes.every((n) => n.id !== "p0" && n.id !== "p1")).toBe(true);
    expect(s.pendingNodes.every((n) => Object.keys(n.config).length === 0)).toBe(true);
    expect(s.pendingEdges[0]).toMatchObject({ from: s.pendingNodes[0]!.id, to: s.pendingNodes[1]!.id });
    expect(s.isDirty).toBe(true);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled(); // never auto-saves
  });

  it("existing graph: existing nodes/edges/config are untouched; new nodes are added (additive)", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF); // one trigger t1 with config {}
    const beforeIds = useGraphSlice.getState().pendingNodes.map((n) => n.id);
    // The patch also proposes a trigger — it must be SKIPPED (no replace-trigger).
    const outcome = useGraphSlice.getState().applyAdditivePatch(ADDITIVE_PATCH);
    const s = useGraphSlice.getState();
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.skippedTrigger).toBe(true);
    // Original trigger still present + unchanged.
    expect(s.pendingNodes.find((n) => n.id === "t1")).toMatchObject({ provider: "slack", type: "message_received" });
    expect(beforeIds.every((id) => s.pendingNodes.some((n) => n.id === id))).toBe(true);
    // Only the action was added (trigger skipped) → 1 original + 1 new = 2, no new edge (its from-ref was skipped).
    expect(s.pendingNodes).toHaveLength(2);
    expect(s.pendingNodes.some((n) => n.provider === "slack" && n.type === "send_message")).toBe(true);
    expect(s.pendingEdges).toHaveLength(0);
  });

  it("never deletes/replaces: a second action-only patch only appends", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF);
    useGraphSlice.getState().applyAdditivePatch({ kind: "additive", nodes: [{ ref: "p0", kind: "action", provider: "notion", type: "create_page" }], edges: [] });
    const s = useGraphSlice.getState();
    expect(s.pendingNodes).toHaveLength(2);
    expect(s.pendingNodes.find((n) => n.id === "t1")).toBeDefined();
  });

  it("empty patch → ok:false, no mutation", () => {
    useGraphSlice.getState().hydrate("wf-1", EMPTY_DEF);
    const outcome = useGraphSlice.getState().applyAdditivePatch({ kind: "additive", nodes: [], edges: [] });
    expect(outcome.ok).toBe(false);
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(0);
    expect(useGraphSlice.getState().isDirty).toBe(false);
  });

  it("trigger-only patch on a graph that already has a trigger → nothing added", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF);
    const outcome = useGraphSlice.getState().applyAdditivePatch({ kind: "additive", nodes: [{ ref: "p0", kind: "trigger", provider: "gmail", type: "new_email" }], edges: [] });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("nothing_added");
      expect(outcome.skippedTrigger).toBe(true);
    }
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(1); // only the original trigger
  });

  it("blank graph → placement 'blank'", () => {
    useGraphSlice.getState().hydrate("wf-1", EMPTY_DEF);
    const outcome = useGraphSlice.getState().applyAdditivePatch(ADDITIVE_PATCH);
    expect(outcome.ok && outcome.placement).toBe("blank");
  });
});

describe("graphSlice — applyAdditivePatch in-place placement (HERMES-AGENT-APPLY-IN-PLACE)", () => {
  const TRIGGER_ACTION_DEF: WorkflowDefinition = {
    nodes: [
      { id: "t1", kind: "trigger", provider: "slack", type: "message_received", config: {}, position: { x: 0, y: 0 } },
      { id: "a1", kind: "action", provider: "github", type: "add_comment", config: { repo: "x" }, position: { x: 0, y: 160 } },
    ],
    edges: [{ id: "e1", from: "t1", to: "a1" }],
  };
  const TWO_TAIL_DEF: WorkflowDefinition = {
    nodes: [
      { id: "t1", kind: "trigger", provider: "slack", type: "message_received", config: {}, position: { x: 0, y: 0 } },
      { id: "a1", kind: "action", provider: "github", type: "add_comment", config: {}, position: { x: -120, y: 160 } },
      { id: "a2", kind: "action", provider: "notion", type: "create_page", config: {}, position: { x: 120, y: 160 } },
    ],
    edges: [
      { id: "e1", from: "t1", to: "a1" },
      { id: "e2", from: "t1", to: "a2" },
    ],
  };
  const ACTION_PATCH = {
    kind: "additive" as const,
    nodes: [{ ref: "p0", kind: "action" as const, provider: "notion", type: "create_page" }],
    edges: [],
  };
  const TRIGGER_THEN_ACTION_PATCH = {
    kind: "additive" as const,
    nodes: [
      { ref: "p0", kind: "trigger" as const, provider: "gmail", type: "new_email" },
      { ref: "p1", kind: "action" as const, provider: "slack", type: "send_message" },
    ],
    edges: [{ fromRef: "p0", toRef: "p1" }],
  };

  it("sole-tail append: appends after the terminal action with a new anchor edge", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_ACTION_DEF);
    const outcome = useGraphSlice.getState().applyAdditivePatch(ACTION_PATCH);
    const s = useGraphSlice.getState();
    expect(outcome.ok && outcome.placement).toBe("appended");
    expect(s.pendingNodes).toHaveLength(3);
    const added = s.pendingNodes.find((n) => n.provider === "notion" && n.type === "create_page")!;
    // New anchor edge a1 → added; the existing trigger→action edge is untouched.
    expect(s.pendingEdges.some((e) => e.from === "a1" && e.to === added.id)).toBe(true);
    expect(s.pendingEdges.some((e) => e.id === "e1")).toBe(true);
    expect(s.pendingEdges).toHaveLength(2);
  });

  it("selected node with MULTIPLE outgoing edges → appended (no split, no edge removed)", () => {
    useGraphSlice.getState().hydrate("wf-1", TWO_TAIL_DEF); // t1 → a1, t1 → a2
    const beforeEdgeIds = useGraphSlice.getState().pendingEdges.map((e) => e.id);
    // Select t1 (two outgoing) — must NOT split; branches off t1 additively instead.
    const outcome = useGraphSlice.getState().applyAdditivePatch(ACTION_PATCH, { appendAfterNodeId: "t1" });
    const s = useGraphSlice.getState();
    expect(outcome.ok && outcome.placement).toBe("appended");
    const added = s.pendingNodes.find((n) => !["t1", "a1", "a2"].includes(n.id))!;
    expect(s.pendingEdges.some((e) => e.from === "t1" && e.to === added.id)).toBe(true);
    // No existing edge removed.
    expect(beforeEdgeIds.every((id) => s.pendingEdges.some((e) => e.id === id))).toBe(true);
  });

  it("trigger-first patch: trigger skipped, the action appends after the sole tail", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_ACTION_DEF);
    const outcome = useGraphSlice.getState().applyAdditivePatch(TRIGGER_THEN_ACTION_PATCH);
    const s = useGraphSlice.getState();
    expect(outcome.ok && outcome.placement).toBe("appended");
    expect(outcome.ok && outcome.skippedTrigger).toBe(true);
    expect(s.pendingNodes.filter((n) => n.kind === "trigger")).toHaveLength(1); // no replace-trigger
    const added = s.pendingNodes.find((n) => n.provider === "slack" && n.type === "send_message")!;
    expect(s.pendingEdges.some((e) => e.from === "a1" && e.to === added.id)).toBe(true);
  });

  it("ambiguous multi-tail (no selection) → side_chain fallback, no anchor edge", () => {
    useGraphSlice.getState().hydrate("wf-1", TWO_TAIL_DEF);
    const beforeEdgeIds = useGraphSlice.getState().pendingEdges.map((e) => e.id);
    const outcome = useGraphSlice.getState().applyAdditivePatch(ACTION_PATCH);
    const s = useGraphSlice.getState();
    expect(outcome.ok && outcome.placement).toBe("side_chain");
    expect(s.pendingNodes).toHaveLength(4);
    const added = s.pendingNodes.find((n) => !["t1", "a1", "a2"].includes(n.id))!;
    // No edge connects an existing node to the new one (detached chain).
    expect(s.pendingEdges.some((e) => e.to === added.id)).toBe(false);
    // Existing edges are all still present and unchanged.
    expect(beforeEdgeIds.every((id) => s.pendingEdges.some((e) => e.id === id))).toBe(true);
    expect(s.pendingEdges).toHaveLength(beforeEdgeIds.length); // none added, none removed
  });

  it("existing node config + positions are never mutated by an in-place append", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_ACTION_DEF);
    useGraphSlice.getState().applyAdditivePatch(ACTION_PATCH, { appendAfterNodeId: "a1" });
    const s = useGraphSlice.getState();
    expect(s.pendingNodes.find((n) => n.id === "a1")).toMatchObject({ config: { repo: "x" }, position: { x: 0, y: 160 } });
    expect(s.pendingNodes.find((n) => n.id === "t1")).toMatchObject({ position: { x: 0, y: 0 } });
  });

  it("insert-between: selecting a mid-chain node splits its sole edge (A → new → B); only that edge is removed", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_ACTION_DEF); // t1 → a1 (edge e1)
    const outcome = useGraphSlice.getState().applyAdditivePatch(ACTION_PATCH, { appendAfterNodeId: "t1" });
    const s = useGraphSlice.getState();
    expect(outcome.ok && outcome.placement).toBe("inserted_between");
    const added = s.pendingNodes.find((n) => n.provider === "notion" && n.type === "create_page")!;
    // The original t1 → a1 edge (e1) is the ONLY edge removed; replaced by t1 → new and new → a1.
    expect(s.pendingEdges.some((e) => e.id === "e1")).toBe(false);
    expect(s.pendingEdges.some((e) => e.from === "t1" && e.to === added.id)).toBe(true);
    expect(s.pendingEdges.some((e) => e.from === added.id && e.to === "a1")).toBe(true);
    expect(s.pendingEdges).toHaveLength(2);
    // Existing nodes + config untouched; nothing saved.
    expect(s.pendingNodes.find((n) => n.id === "a1")).toMatchObject({ config: { repo: "x" } });
    expect(s.pendingNodes).toHaveLength(3);
    expect(s.isDirty).toBe(true);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });
});

// HERMES-AGENT-WORKFLOW-EDITOR — replaceGraphLocal: atomically replace the local draft with a validated
// candidate end-state (the general mutation apply).
describe("graphSlice — replaceGraphLocal (general mutation apply)", () => {
  const TRIGGER_SLACK_DEF: WorkflowDefinition = {
    nodes: [
      { id: "t1", kind: "trigger", provider: "native", type: "manual.run", config: {}, position: { x: 0, y: 0 } },
      { id: "a1", kind: "action", provider: "slack", type: "send_channel_message", config: { channel: "C1" }, position: { x: 0, y: 160 } },
    ],
    edges: [{ id: "e1", from: "t1", to: "a1" }],
  };

  it("replaces the whole local graph with the candidate (Slack → email swap), dirty, no save", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_SLACK_DEF);
    // Candidate built from the current draft with the Slack action swapped for a new email node id.
    const candidate: WorkflowDefinition = {
      nodes: [
        { id: "t1", kind: "trigger", provider: "native", type: "manual.run", config: {}, position: { x: 0, y: 0 } },
        { id: "email-1", kind: "action", provider: "gmail", type: "send_email", config: {}, position: { x: 0, y: 0 } },
      ],
      edges: [{ id: "ne1", from: "t1", to: "email-1" }],
    };
    const outcome = useGraphSlice.getState().replaceGraphLocal(candidate);
    const s = useGraphSlice.getState();
    expect(outcome.ok).toBe(true);
    expect(outcome.addedNodeIds).toEqual(["email-1"]); // NEW node id → drives the post-apply setup UX
    expect(s.pendingNodes.map((n) => `${n.provider}:${n.type}`)).toEqual(["native:manual.run", "gmail:send_email"]);
    expect(s.pendingNodes.some((n) => n.provider === "slack")).toBe(false); // Slack gone, not appended
    expect(s.pendingEdges).toEqual([{ id: "ne1", from: "t1", to: "email-1" }]);
    expect(s.isDirty).toBe(true);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it("preserves untouched nodes' config (the candidate carries them unchanged)", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_SLACK_DEF);
    // Candidate keeps the Slack node + config and adds an email node (add second notification).
    const candidate: WorkflowDefinition = {
      nodes: [
        ...TRIGGER_SLACK_DEF.nodes,
        { id: "email-1", kind: "action", provider: "gmail", type: "send_email", config: {}, position: { x: 0, y: 0 } },
      ],
      edges: [...TRIGGER_SLACK_DEF.edges, { id: "ne1", from: "t1", to: "email-1" }],
    };
    useGraphSlice.getState().replaceGraphLocal(candidate);
    const s = useGraphSlice.getState();
    expect(s.pendingNodes.find((n) => n.id === "a1")!.config).toEqual({ channel: "C1" }); // preserved
    expect(s.pendingNodes).toHaveLength(3);
  });
});

// ─── BUILDER-TOPBAR-UNDO-REDO — bounded draft-edit history ───────────────────
describe("graphSlice — undo / redo", () => {
  it("add node → undo removes it → redo restores it", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF);
    expect(useGraphSlice.getState().past).toHaveLength(0);

    const action = useGraphSlice.getState().addAction({ provider: "slack", type: "send_message" });
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(2);
    expect(useGraphSlice.getState().past).toHaveLength(1);
    expect(useGraphSlice.getState().future).toHaveLength(0);

    useGraphSlice.getState().undo();
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(1);
    expect(useGraphSlice.getState().pendingNodes.some((n) => n.id === action.id)).toBe(false);
    expect(useGraphSlice.getState().future).toHaveLength(1);

    useGraphSlice.getState().redo();
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(2);
    expect(useGraphSlice.getState().pendingNodes.some((n) => n.id === action.id)).toBe(true);
    expect(useGraphSlice.getState().future).toHaveLength(0);
  });

  it("edit node config → undo restores the previous config → redo restores the new config", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF);
    useGraphSlice.getState().updateNodeConfig("t1", { channel: "C1" });
    expect(useGraphSlice.getState().pendingNodes[0]!.config).toEqual({ channel: "C1" });

    useGraphSlice.getState().undo();
    expect(useGraphSlice.getState().pendingNodes[0]!.config).toEqual({}); // back to the saved baseline

    useGraphSlice.getState().redo();
    expect(useGraphSlice.getState().pendingNodes[0]!.config).toEqual({ channel: "C1" });
  });

  it("undo back to the saved baseline clears isDirty; an intermediate redo is dirty again", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF);
    useGraphSlice.getState().updateNodeConfig("t1", { channel: "C1" });
    expect(useGraphSlice.getState().isDirty).toBe(true);

    useGraphSlice.getState().undo();
    expect(useGraphSlice.getState().isDirty).toBe(false); // identical to saved (by reference)

    useGraphSlice.getState().redo();
    expect(useGraphSlice.getState().isDirty).toBe(true);
  });

  it("a NEW edit after undo clears the redo (future) stack", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF);
    useGraphSlice.getState().addAction({ provider: "slack", type: "send_message" });
    useGraphSlice.getState().undo();
    expect(useGraphSlice.getState().future).toHaveLength(1);

    useGraphSlice.getState().updateNodeConfig("t1", { x: 1 });
    expect(useGraphSlice.getState().future).toHaveLength(0); // redo invalidated by the new edit
  });

  it("delete node → undo restores it", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF);
    const action = useGraphSlice.getState().addAction({ provider: "slack", type: "send_message" });
    useGraphSlice.getState().deleteNodeAndRewire(action.id);
    expect(useGraphSlice.getState().pendingNodes.some((n) => n.id === action.id)).toBe(false);

    useGraphSlice.getState().undo();
    expect(useGraphSlice.getState().pendingNodes.some((n) => n.id === action.id)).toBe(true);
  });

  it("no-op edits do not create history (unchanged position / unknown node)", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF);
    useGraphSlice.getState().updateNodePosition("t1", { x: 0, y: 0 }); // same position → no-op
    useGraphSlice.getState().renameNode("ghost", "x"); // unknown node → no-op
    expect(useGraphSlice.getState().past).toHaveLength(0);
  });

  it("undo with empty history and redo with empty future are no-ops", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF);
    const before = useGraphSlice.getState().pendingNodes;
    useGraphSlice.getState().undo();
    useGraphSlice.getState().redo();
    expect(useGraphSlice.getState().pendingNodes).toBe(before);
    expect(useGraphSlice.getState().isDirty).toBe(false);
  });

  it("hydrate clears history (you cannot undo across a fresh baseline)", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF);
    useGraphSlice.getState().addAction({ provider: "slack", type: "send_message" });
    expect(useGraphSlice.getState().past.length).toBeGreaterThan(0);

    useGraphSlice.getState().hydrate("wf-2", TRIGGER_DEF);
    expect(useGraphSlice.getState().past).toHaveLength(0);
    expect(useGraphSlice.getState().future).toHaveLength(0);
  });

  it("undo / redo never call the workflow save route", () => {
    useGraphSlice.getState().hydrate("wf-1", TRIGGER_DEF);
    useGraphSlice.getState().addAction({ provider: "slack", type: "send_message" });
    useGraphSlice.getState().undo();
    useGraphSlice.getState().redo();
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });
});
