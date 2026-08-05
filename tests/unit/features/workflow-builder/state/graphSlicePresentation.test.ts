/** @jest-environment node */
/**
 * graphSlice presentation (manual sections) — CS-4.
 *
 * Presentation is part of the SAME canonical draft: hydrated, dirtied, saved,
 * undone/redone, and pruned on node changes exactly like nodes/edges — never a
 * second store. Section commands mutate ONLY presentation; node deletion prunes
 * membership atomically; AI additive keeps sections and replace prunes removed
 * nodes; the save payload omits presentation when empty.
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
import type { WorkflowDefinition, WorkflowNode } from "@/contracts/workflow";

function node(id: string, over: Partial<WorkflowNode> = {}): WorkflowNode {
  return { id, kind: "action", provider: "slack", type: "send_channel_message", config: {}, position: { x: 0, y: 0 }, ...over };
}
const DEF = (): WorkflowDefinition => ({
  nodes: [node("t", { kind: "trigger", provider: "hubspot", type: "new_contact" }), node("a"), node("b"), node("c")],
  edges: [
    { id: "e1", from: "t", to: "a" },
    { id: "e2", from: "a", to: "b" },
    { id: "e3", from: "b", to: "c" },
  ],
});
const withSections = (): WorkflowDefinition => ({
  ...DEF(),
  presentation: { version: 1, sections: [{ id: "s1", title: "Qualify", nodeIds: ["a", "b"] }] },
});

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  // WORKFLOW-CHANGED-ELSEWHERE-CONFLICT-PROTECTION-1 — legacy revision-less
  // hydrates adopt a server token via getWorkflow before saving; serve the
  // current saved baseline (no concurrent writer).
  mockGetWorkflowApi.mockReset();
  mockGetWorkflowApi.mockImplementation(async (id: string) => ({
    id,
    draftDefinition: {
      nodes: useGraphSlice.getState().savedNodes,
      edges: useGraphSlice.getState().savedEdges,
      ...(useGraphSlice.getState().savedPresentation
        ? { presentation: useGraphSlice.getState().savedPresentation }
        : {}),
    },
    updatedAt: "2026-05-06T00:00:00Z",
  }));
  useGraphSlice.getState().reset();
});

const g = () => useGraphSlice.getState();

describe("hydrate", () => {
  it("old definition (no presentation) hydrates to null presentation", () => {
    g().hydrate("wf", DEF());
    expect(g().savedPresentation).toBeNull();
    expect(g().pendingPresentation).toBeNull();
  });

  it("valid sections hydrate; saved === pending by reference", () => {
    g().hydrate("wf", withSections());
    expect(g().pendingPresentation?.sections[0]!.title).toBe("Qualify");
    expect(g().savedPresentation).toBe(g().pendingPresentation);
    expect(g().isDirty).toBe(false);
  });

  it("prunes stale membership defensively on hydrate (cast read path)", () => {
    g().hydrate("wf", {
      ...DEF(),
      presentation: { version: 1, sections: [{ id: "s1", title: "Q", nodeIds: ["a", "ghost"] }] } as never,
    });
    expect(g().pendingPresentation?.sections[0]!.nodeIds).toEqual(["a"]);
  });
});

describe("section commands mark dirty + are undoable", () => {
  it("createSection wraps nodes, marks dirty, does not touch nodes/edges", () => {
    g().hydrate("wf", DEF());
    const nodesRef = g().pendingNodes;
    const edgesRef = g().pendingEdges;
    const res = g().createSection({ nodeIds: ["a", "b"], title: "Qualify" });
    expect(res.ok).toBe(true);
    expect(g().pendingPresentation?.sections[0]!.nodeIds).toEqual(["a", "b"]);
    expect(g().isDirty).toBe(true);
    expect(g().pendingNodes).toBe(nodesRef); // topology untouched
    expect(g().pendingEdges).toBe(edgesRef);
  });

  it("createSection refuses an empty / all-stale selection without mutating", () => {
    g().hydrate("wf", DEF());
    expect(g().createSection({ nodeIds: [], title: "X" })).toEqual({ ok: false, reason: "empty_selection" });
    expect(g().createSection({ nodeIds: ["ghost"], title: "X" })).toEqual({ ok: false, reason: "empty_selection" });
    expect(g().createSection({ nodeIds: ["a"], title: "  " })).toEqual({ ok: false, reason: "empty_title" });
    expect(g().pendingPresentation).toBeNull();
    expect(g().isDirty).toBe(false);
  });

  it("rename / collapse / ungroup", () => {
    g().hydrate("wf", withSections());
    const id = g().pendingPresentation!.sections[0]!.id;
    expect(g().renameSection(id, "Qualify & route").ok).toBe(true);
    expect(g().pendingPresentation?.sections[0]!.title).toBe("Qualify & route");
    expect(g().renameSection(id, "Qualify & route")).toEqual({ ok: false, reason: "no_change" });

    expect(g().setSectionCollapsed(id, true).ok).toBe(true);
    expect(g().pendingPresentation?.sections[0]!.collapsed).toBe(true);
    expect(g().setSectionCollapsed(id, true)).toEqual({ ok: false, reason: "no_change" });

    expect(g().ungroupSection(id).ok).toBe(true);
    expect(g().pendingPresentation).toBeNull(); // wrapper gone
    // Nodes untouched by ungroup.
    expect(g().pendingNodes.map((n) => n.id)).toEqual(["t", "a", "b", "c"]);
  });

  it("moves a node between sections atomically (one section per node)", () => {
    g().hydrate("wf", DEF());
    g().createSection({ nodeIds: ["a", "b"], title: "One" });
    const s1 = g().pendingPresentation!.sections[0]!.id;
    const r2 = g().createSection({ nodeIds: ["c"], title: "Two" });
    const s2 = r2.ok ? r2.sectionId : "";
    // Move "b" into section Two.
    g().addNodesToSection(s2, ["b"]);
    const secs = g().pendingPresentation!.sections;
    expect(secs.find((s) => s.id === s1)!.nodeIds).toEqual(["a"]);
    expect(secs.find((s) => s.id === s2)!.nodeIds).toEqual(["c", "b"]);
  });

  it("removeNodesFromSection drops an emptied section", () => {
    g().hydrate("wf", DEF());
    const r = g().createSection({ nodeIds: ["a"], title: "Solo" });
    g().removeNodesFromSection(["a"]);
    expect(g().pendingPresentation).toBeNull();
    expect(r.ok).toBe(true);
  });

  it("undo restores a section edit; redo reapplies it", () => {
    g().hydrate("wf", DEF());
    g().createSection({ nodeIds: ["a", "b"], title: "Qualify" });
    expect(g().pendingPresentation?.sections).toHaveLength(1);
    g().undo();
    expect(g().pendingPresentation).toBeNull();
    expect(g().isDirty).toBe(false); // back to the saved (section-free) baseline
    g().redo();
    expect(g().pendingPresentation?.sections[0]!.title).toBe("Qualify");
    expect(g().isDirty).toBe(true);
  });
});

describe("node changes preserve / prune presentation", () => {
  it("a position edit preserves presentation byte-for-byte (same reference)", () => {
    g().hydrate("wf", withSections());
    const presRef = g().pendingPresentation;
    g().updateNodePosition("a", { x: 99, y: 99 });
    expect(g().pendingPresentation).toBe(presRef); // unchanged reference
  });

  it("a config edit preserves presentation", () => {
    g().hydrate("wf", withSections());
    const presRef = g().pendingPresentation;
    g().updateNodeConfig("a", { text: "hi" });
    expect(g().pendingPresentation).toBe(presRef);
  });

  it("removeNode prunes the deleted node's membership atomically", () => {
    g().hydrate("wf", withSections()); // section [a, b]
    g().removeNode("a");
    expect(g().pendingPresentation?.sections[0]!.nodeIds).toEqual(["b"]);
  });

  it("deleting the final member removes the section", () => {
    g().hydrate("wf", { ...DEF(), presentation: { version: 1, sections: [{ id: "s1", title: "Solo", nodeIds: ["a"] }] } });
    g().removeNode("a");
    expect(g().pendingPresentation).toBeNull();
  });

  it("deleteNodeAndRewire prunes membership", () => {
    g().hydrate("wf", withSections());
    g().deleteNodeAndRewire("b");
    expect(g().pendingPresentation?.sections[0]!.nodeIds).toEqual(["a"]);
  });
});

describe("AI graph edits", () => {
  it("additive patch preserves existing sections; new nodes stay unsectioned", () => {
    g().hydrate("wf", withSections());
    g().applyAdditivePatch(
      { kind: "additive", nodes: [{ ref: "n1", kind: "action", provider: "slack", type: "send_channel_message" }], edges: [] },
      {},
    );
    // Section [a,b] survives; the new node isn't in any section.
    expect(g().pendingPresentation?.sections[0]!.nodeIds).toEqual(["a", "b"]);
    const addedId = g().pendingNodes[g().pendingNodes.length - 1]!.id;
    expect(g().pendingPresentation?.sections.some((s) => s.nodeIds.includes(addedId))).toBe(false);
  });

  it("replaceGraphLocal preserves surviving membership and prunes removed nodes", () => {
    g().hydrate("wf", withSections()); // section [a, b]
    // Replace graph: keep t + a, drop b + c, add d.
    g().replaceGraphLocal(
      {
        nodes: [node("t", { kind: "trigger", provider: "hubspot", type: "new_contact" }), node("a"), node("d")],
        edges: [{ id: "e1", from: "t", to: "a" }, { id: "e2", from: "a", to: "d" }],
      },
      {},
    );
    // a survives → stays in the section; b pruned; d unsectioned.
    expect(g().pendingPresentation?.sections[0]!.nodeIds).toEqual(["a"]);
  });
});

describe("save payload", () => {
  it("includes normalized presentation when non-empty", async () => {
    g().hydrate("wf", DEF());
    g().createSection({ nodeIds: ["a", "b"], title: "Qualify" });
    mockUpdateWorkflow.mockImplementation(async (_id: string, body: { draftDefinition: WorkflowDefinition }) => ({
      draftDefinition: body.draftDefinition,
      updatedAt: "2026-07-21T00:00:00Z",
    }));
    await g().save();
    const sent = mockUpdateWorkflow.mock.calls[0]![1] as { draftDefinition: WorkflowDefinition };
    expect(sent.draftDefinition.presentation?.sections[0]!.title).toBe("Qualify");
    // Reconciled + clean.
    expect(g().isDirty).toBe(false);
    expect(g().savedPresentation).toBe(g().pendingPresentation);
  });

  it("omits presentation from the payload when there are no sections", async () => {
    g().hydrate("wf", DEF());
    g().updateNodeConfig("a", { text: "hi" }); // a non-section edit → dirty
    mockUpdateWorkflow.mockImplementation(async (_id: string, body: { draftDefinition: WorkflowDefinition }) => ({
      draftDefinition: body.draftDefinition,
      updatedAt: "2026-07-21T00:00:00Z",
    }));
    await g().save();
    const sent = mockUpdateWorkflow.mock.calls[0]![1] as { draftDefinition: WorkflowDefinition };
    expect(sent.draftDefinition).not.toHaveProperty("presentation");
  });
});
