/**
 * Document React-Agent PREVIEW projection (5.DUAL-BUILDER-1 / CS-6).
 *
 * Pure conversion of the EXISTING agent response shapes into a read-only ghost
 * Document. Proves: additive plans render ghost sentences in sequence with
 * preview identity (never real ids); an edit proposal tags added/modified/
 * unchanged/removed vs the live draft; an unreadable proposed graph flags a
 * Visual handoff; and the conversion never mutates its inputs.
 */
import type { WorkflowDefinition } from "@/contracts/workflow";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import { buildDocumentPreview } from "@/features/workflow-builder/document/documentPreviewProjection";

const DRAFT_PREVIEW_NOTICE = "Preview only — your workflow has not changed." as const;

function additivePreview(): DraftPreview {
  return {
    version: 1,
    title: "New lead workflow",
    summary: "Qualify a new lead and notify sales.",
    notice: DRAFT_PREVIEW_NOTICE,
    notApplied: true,
    nodes: [
      { previewId: "p1", role: "trigger", provider: "hubspot", type: "new_contact", label: "HubSpot: new_contact", purpose: "When a new lead arrives", notApplied: true },
      { previewId: "p2", role: "action", provider: "native", type: "if_then_condition", label: "If/Then", purpose: "Check if it is a large account", missingInputs: ["value"], notApplied: true },
      { previewId: "p3", role: "action", provider: "slack", type: "send_channel_message", label: "Slack: send_channel_message", purpose: "Notify sales", notApplied: true },
    ],
    edges: [
      { previewId: "pe1", fromPreviewId: "p1", toPreviewId: "p2", notApplied: true },
      { previewId: "pe2", fromPreviewId: "p2", toPreviewId: "p3", notApplied: true },
    ],
  };
}

const liveWorkflow: WorkflowDefinition = {
  nodes: [
    { id: "t", kind: "trigger", provider: "hubspot", type: "new_contact", config: {}, position: { x: 0, y: 0 } },
    { id: "a", kind: "action", provider: "slack", type: "send_channel_message", config: { text: "hi" }, position: { x: 0, y: 120 } },
    { id: "old", kind: "action", provider: "gmail", type: "send_email", config: { to: "x@y.z" }, position: { x: 0, y: 240 } },
  ],
  edges: [
    { id: "e1", from: "t", to: "a" },
    { id: "e2", from: "a", to: "old" },
  ],
};

describe("additive plan preview", () => {
  it("renders ghost sentences in document order with preview identity, never real node ids", () => {
    const model = buildDocumentPreview({ liveNodes: [], liveEdges: [], preview: additivePreview() });
    expect(model.kind).toBe("additive");
    expect(model.ghosts.map((g) => g.previewId)).toEqual(["p1", "p2", "p3"]);
    // Preview ids are NOT graph node ids.
    expect(model.ghosts.every((g) => g.previewId.startsWith("p"))).toBe(true);
    // Missing inputs are carried honestly (from the agent's response).
    expect(model.ghosts.find((g) => g.previewId === "p2")?.missingInputs).toEqual(["value"]);
    expect(model.proposedModel).toBeNull();
    expect(model.removed).toEqual([]);
  });

  it("classifies an empty preview as empty", () => {
    const p = { ...additivePreview(), nodes: [], edges: [] };
    expect(buildDocumentPreview({ liveNodes: [], liveEdges: [], preview: p }).kind).toBe("empty");
  });

  it("does not mutate its inputs", () => {
    const live = JSON.parse(JSON.stringify(liveWorkflow.nodes));
    const preview = additivePreview();
    buildDocumentPreview({ liveNodes: liveWorkflow.nodes, liveEdges: liveWorkflow.edges, preview });
    expect(liveWorkflow.nodes).toEqual(live);
  });
});

describe("edit proposal preview", () => {
  function proposal(): WorkflowDefinition {
    return {
      nodes: [
        // unchanged trigger
        { id: "t", kind: "trigger", provider: "hubspot", type: "new_contact", config: {}, position: { x: 0, y: 0 } },
        // modified 'a' (config changed)
        { id: "a", kind: "action", provider: "slack", type: "send_channel_message", config: { text: "CHANGED" }, position: { x: 0, y: 120 } },
        // 'old' is dropped → removed; new 'z' added
        { id: "z", kind: "action", provider: "slack", type: "send_channel_message", config: { text: "new" }, position: { x: 0, y: 240 } },
      ],
      edges: [
        { id: "e1", from: "t", to: "a" },
        { id: "e3", from: "a", to: "z" },
      ],
    };
  }

  it("tags added / modified / unchanged / removed relative to the live draft", () => {
    const model = buildDocumentPreview({
      liveNodes: liveWorkflow.nodes,
      liveEdges: liveWorkflow.edges,
      preview: { ...additivePreview(), nodes: [], edges: [] },
      proposedDefinition: proposal(),
    });
    expect(model.kind).toBe("edit");
    expect(model.statusByNodeId.get("t")).toBe("unchanged");
    expect(model.statusByNodeId.get("a")).toBe("modified");
    expect(model.statusByNodeId.get("z")).toBe("added");
    expect(model.removed.map((r) => r.nodeId)).toEqual(["old"]);
    expect(model.proposedModel?.tier).toBe("A"); // linear proposed graph reads as prose
    expect(model.needsVisualReview).toBe(false);
  });

  it("flags a Visual handoff when the proposed graph can't be read as prose (cycle)", () => {
    const cyclic: WorkflowDefinition = {
      nodes: [
        { id: "t", kind: "trigger", provider: "hubspot", type: "new_contact", config: {}, position: { x: 0, y: 0 } },
        { id: "a", kind: "action", provider: "slack", type: "send_channel_message", config: {}, position: { x: 0, y: 120 } },
      ],
      edges: [
        { id: "e1", from: "t", to: "a" },
        { id: "e2", from: "a", to: "t" }, // cycle
      ],
    };
    const model = buildDocumentPreview({
      liveNodes: liveWorkflow.nodes,
      liveEdges: liveWorkflow.edges,
      preview: { ...additivePreview(), nodes: [], edges: [] },
      proposedDefinition: cyclic,
    });
    expect(model.needsVisualReview).toBe(true);
  });
});
