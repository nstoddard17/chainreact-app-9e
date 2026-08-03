/** @jest-environment node */
/**
 * Document command boundary (5.DUAL-BUILDER-1 / CS-2).
 *
 * Proves every command is a thin composition over the EXISTING stores, returns
 * a typed result (never throws), and refuses ambiguous/stale gestures instead
 * of guessing.
 */
import type { WorkflowDefinition } from "@/contracts/workflow";
import {
  cancelDocumentField,
  commitDocumentField,
  describeDocumentRefusal,
  guardDocumentActionMeta,
  openDocumentStepConfig,
  validateDocumentEdgeInsertion,
  validateDocumentTailAdd,
  type DocumentCommandRefusal,
} from "@/features/workflow-builder/document/documentCommands";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";

function cloneDefinition(def: WorkflowDefinition): WorkflowDefinition {
  return JSON.parse(JSON.stringify(def)) as WorkflowDefinition;
}

const linear: WorkflowDefinition = {
  nodes: [
    { id: "t", kind: "trigger", provider: "hubspot", type: "new_contact", config: {}, position: { x: 0, y: 0 } },
    { id: "a", kind: "action", provider: "slack", type: "send_channel_message", config: { text: "hi" }, position: { x: 0, y: 120 } },
    { id: "b", kind: "action", provider: "slack", type: "send_channel_message", config: {}, position: { x: 0, y: 240 } },
  ],
  edges: [
    { id: "e1", from: "t", to: "a" },
    { id: "e2", from: "a", to: "b" },
  ],
};

beforeEach(() => {
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-cmd", cloneDefinition(linear));
});

describe("commitDocumentField / cancelDocumentField", () => {
  it("commits the shared draft through the canonical graph action", () => {
    useConfigSlice.getState().openNode({ nodeId: "a", initialValues: { text: "hi" } });
    useConfigSlice.getState().updateField({ nodeId: "a", name: "text", value: "changed" });
    expect(useGraphSlice.getState().pendingNodes.find((n) => n.id === "a")?.config.text).toBe("hi");

    const result = commitDocumentField({ nodeId: "a" });

    expect(result).toEqual({ ok: true });
    expect(useGraphSlice.getState().pendingNodes.find((n) => n.id === "a")?.config.text).toBe(
      "changed",
    );
    expect(useGraphSlice.getState().isDirty).toBe(true);
    // Draft reconciled exactly like the inspector's Save-in-panel.
    expect(useConfigSlice.getState().drafts["a"]?.isDirty).toBe(false);
  });

  it("commits an unresolved required field (empty → value)", () => {
    useConfigSlice.getState().openNode({ nodeId: "b", initialValues: {} });
    useConfigSlice.getState().updateField({ nodeId: "b", name: "channel", value: "C123" });
    expect(commitDocumentField({ nodeId: "b" })).toEqual({ ok: true });
    expect(useGraphSlice.getState().pendingNodes.find((n) => n.id === "b")?.config.channel).toBe(
      "C123",
    );
  });

  it("refuses when the node is gone, without mutating", () => {
    const before = useGraphSlice.getState().pendingNodes;
    expect(commitDocumentField({ nodeId: "ghost" })).toEqual({
      ok: false,
      reason: "node_missing",
    });
    expect(useGraphSlice.getState().pendingNodes).toBe(before);
  });

  it("refuses when there is no draft to commit", () => {
    expect(commitDocumentField({ nodeId: "a" })).toEqual({ ok: false, reason: "no_draft" });
  });

  it("cancel restores the open-time snapshot and leaves the graph untouched", () => {
    useConfigSlice.getState().openNode({ nodeId: "a", initialValues: { text: "hi" } });
    const snapshot = { ...useConfigSlice.getState().drafts["a"]!.values };
    useConfigSlice.getState().updateField({ nodeId: "a", name: "text", value: "typed-but-abandoned" });

    const nodesBefore = useGraphSlice.getState().pendingNodes;
    expect(cancelDocumentField({ nodeId: "a", snapshotValues: snapshot })).toEqual({ ok: true });

    expect(useConfigSlice.getState().drafts["a"]?.values.text).toBe("hi");
    expect(useConfigSlice.getState().drafts["a"]?.isDirty).toBe(false);
    expect(useGraphSlice.getState().pendingNodes).toBe(nodesBefore);
    expect(useGraphSlice.getState().isDirty).toBe(false);
  });
});

describe("insertion guards", () => {
  it("accepts a true linear tail", () => {
    expect(validateDocumentTailAdd({ anchorNodeId: "b" })).toEqual({ ok: true });
  });

  it("refuses a tail anchor that now has an outgoing edge (stale model)", () => {
    expect(validateDocumentTailAdd({ anchorNodeId: "a" })).toEqual({
      ok: false,
      reason: "stale_document_model",
    });
  });

  it("refuses a missing tail node", () => {
    expect(validateDocumentTailAdd({ anchorNodeId: "ghost" })).toEqual({
      ok: false,
      reason: "node_missing",
    });
  });

  it("accepts a simple unlabeled linear edge", () => {
    expect(
      validateDocumentEdgeInsertion({ edgeId: "e2", expectedFrom: "a", expectedTo: "b" }),
    ).toEqual({ ok: true });
  });

  it("refuses when the edge is gone", () => {
    useGraphSlice.getState().removeEdge("e2");
    expect(
      validateDocumentEdgeInsertion({ edgeId: "e2", expectedFrom: "a", expectedTo: "b" }),
    ).toEqual({ ok: false, reason: "edge_missing" });
  });

  it("refuses when the edge no longer connects the rendered endpoints", () => {
    expect(
      validateDocumentEdgeInsertion({ edgeId: "e2", expectedFrom: "a", expectedTo: "t" }),
    ).toEqual({ ok: false, reason: "stale_document_model" });
  });

  it("refuses a labeled (branch) edge — Visual Builder owns those in CS-2", () => {
    useGraphSlice.getState().reset();
    useGraphSlice.getState().hydrate("wf-b", {
      nodes: [
        { id: "if", kind: "action", provider: "native", type: "if_then_condition", config: {}, position: { x: 0, y: 0 } },
        { id: "x", kind: "action", provider: "slack", type: "send_channel_message", config: {}, position: { x: 0, y: 120 } },
      ],
      edges: [{ id: "eb", from: "if", to: "x", label: "true" }],
    });
    expect(
      validateDocumentEdgeInsertion({ edgeId: "eb", expectedFrom: "if", expectedTo: "x" }),
    ).toEqual({ ok: false, reason: "unsupported_region" });
  });

  it("refuses when the source fans out to several edges (ambiguous)", () => {
    useGraphSlice.getState().connectNodes({ from: "a", to: "t" });
    expect(
      validateDocumentEdgeInsertion({ edgeId: "e2", expectedFrom: "a", expectedTo: "b" }),
    ).toEqual({ ok: false, reason: "ambiguous_insertion" });
  });
});

describe("branch guard + step config + refusal copy", () => {
  it("refuses branching action metas in CS-2", () => {
    expect(guardDocumentActionMeta({ key: "native:if_then_condition" })).toEqual({
      ok: false,
      reason: "branching_not_supported_in_cs2",
    });
    expect(guardDocumentActionMeta({ key: "native:router" })).toEqual({
      ok: false,
      reason: "branching_not_supported_in_cs2",
    });
  });

  it("allows ordinary action metas", () => {
    expect(guardDocumentActionMeta({ key: "slack:send_channel_message" })).toEqual({ ok: true });
  });

  it("openDocumentStepConfig selects through the shared configSlice", () => {
    expect(openDocumentStepConfig({ nodeId: "a" })).toEqual({ ok: true });
    expect(useConfigSlice.getState().activeNodeId).toBe("a");
    expect(openDocumentStepConfig({ nodeId: "ghost" })).toEqual({
      ok: false,
      reason: "node_missing",
    });
  });

  it("every refusal has plain-language copy and no raw error leaks", () => {
    const reasons: DocumentCommandRefusal[] = [
      "node_missing",
      "edge_missing",
      "no_draft",
      "stale_document_model",
      "ambiguous_insertion",
      "branching_not_supported_in_cs2",
      "unsupported_region",
    ];
    for (const reason of reasons) {
      const copy = describeDocumentRefusal(reason);
      expect(copy.length).toBeGreaterThan(10);
      expect(copy).not.toMatch(/undefined|null|Error|_/);
    }
  });

  it("commands never throw for arbitrary ids", () => {
    expect(() => commitDocumentField({ nodeId: "" })).not.toThrow();
    expect(() => validateDocumentTailAdd({ anchorNodeId: "" })).not.toThrow();
    expect(() =>
      validateDocumentEdgeInsertion({ edgeId: "", expectedFrom: "", expectedTo: "" }),
    ).not.toThrow();
    expect(() => openDocumentStepConfig({ nodeId: "" })).not.toThrow();
  });
});
