/** @jest-environment node */
/**
 * CS-5 branch persistence / round-trip fidelity (5.DUAL-BUILDER-1).
 *
 * A branch authored through the Document commands must survive the canonical
 * save funnel (the SAME `WorkflowDefinitionSchema` `PATCH /api/workflows/[id]`
 * parses) and reload with byte-identical branch node configs + labeled edge
 * topology — no Document-only save path, no prose persistence. Switching
 * builders is a shared-store no-op, so a reload from the parsed definition is
 * what both surfaces would render.
 */
import type { ActionMeta } from "@/contracts/actionMeta";
import type { WorkflowDefinition } from "@/contracts/workflow";
import { WorkflowDefinitionSchema } from "@/contracts/workflowDefinition";
import {
  addDocumentActionToEmptyLane,
  addDocumentBranchRoute,
  createDocumentIfThenBranch,
  renameDocumentBranchRoute,
  updateDocumentIfThenCondition,
} from "@/features/workflow-builder/document/documentBranchCommands";
import { projectDefinitionToDocument } from "@/features/workflow-builder/document/projection";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";

const leafMeta = {
  key: "slack:send_channel_message", provider: "slack", type: "send_channel_message",
  displayName: "Send", description: "", category: "messaging", requiresIntegration: true,
  fields: [], outputs: [], producesFileRef: false, consumesFileRef: false,
  displayOrder: 1, isDestructive: false, requiresConfirmation: false, riskLevel: "low",
} as unknown as ActionMeta;

function pending(): WorkflowDefinition {
  return {
    nodes: [...useGraphSlice.getState().pendingNodes],
    edges: [...useGraphSlice.getState().pendingEdges],
  };
}

beforeEach(() => {
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
});

function seed() {
  useGraphSlice.getState().hydrate("wf", {
    nodes: [
      { id: "t", kind: "trigger", provider: "hubspot", type: "new_contact", config: {}, position: { x: 0, y: 0 } },
      { id: "seed", kind: "action", provider: "slack", type: "send_channel_message", config: { text: "hi" }, position: { x: 0, y: 120 } },
    ],
    edges: [{ id: "e1", from: "t", to: "seed" }],
  });
}

describe("If/Then round-trip through the canonical schema", () => {
  it("save (parse) then reload preserves branch config and labeled edges", () => {
    seed();
    const create = createDocumentIfThenBranch({ location: { kind: "tail", anchorNodeId: "seed" } });
    const ifId = create.ok ? create.nodeId! : "";
    updateDocumentIfThenCondition({ nodeId: ifId, patch: { input: "{{seed.text}}", operator: "equals", value: "hi", onFalse: "branch" } });
    addDocumentActionToEmptyLane({ forkNodeId: ifId, label: "true", meta: leafMeta });
    addDocumentActionToEmptyLane({ forkNodeId: ifId, label: "false", meta: leafMeta });

    // The save funnel parses through WorkflowDefinitionSchema; it must accept the
    // Document-authored definition and preserve every branch label.
    const saved = WorkflowDefinitionSchema.parse(pending());
    const ifLabels = saved.edges.filter((e) => e.from === ifId).map((e) => e.label).sort();
    expect(ifLabels).toEqual(["false", "true"]);
    const ifConfig = saved.nodes.find((n) => n.id === ifId)!.config;
    expect(ifConfig).toMatchObject({ operator: "equals", value: "hi", onFalse: "branch" });

    // Reload into a FRESH store from the saved definition — both builders render
    // this. The projected fork is identical (condition + two lanes).
    useGraphSlice.getState().reset();
    useGraphSlice.getState().hydrate("wf", saved as WorkflowDefinition);
    const model = projectDefinitionToDocument({ nodes: saved.nodes, edges: saved.edges });
    const fork = model.blocks.find((b) => b.kind === "fork" && b.nodeId === ifId);
    expect(fork?.kind).toBe("fork");
    if (fork?.kind === "fork") {
      expect(fork.lanes.map((l) => l.label)).toEqual(["true", "false"]);
      expect(fork.lanes.every((l) => l.warning === null)).toBe(true); // both wired
    }
  });
});

describe("Router route rename survives the round-trip", () => {
  it("renamed route label persists on both config and the labeled edge", () => {
    useGraphSlice.getState().hydrate("wf", {
      nodes: [
        { id: "t", kind: "trigger", provider: "hubspot", type: "new_contact", config: {}, position: { x: 0, y: 0 } },
        { id: "r", kind: "action", provider: "native", type: "router", config: { routes: [{ label: "hot", condition: { input: "x", operator: "equals", value: "x" } }] }, position: { x: 0, y: 120 } },
        { id: "h", kind: "action", provider: "slack", type: "send_channel_message", config: {}, position: { x: 0, y: 240 } },
      ],
      edges: [
        { id: "e1", from: "t", to: "r" },
        { id: "e2", from: "r", to: "h", label: "hot" },
      ],
    });
    addDocumentBranchRoute({ nodeId: "r", label: "warm", condition: { input: "x", operator: "equals", value: "y" } });
    addDocumentActionToEmptyLane({ forkNodeId: "r", label: "warm", meta: leafMeta });
    expect(renameDocumentBranchRoute({ nodeId: "r", oldLabel: "hot", newLabel: "priority" }).ok).toBe(true);

    const saved = WorkflowDefinitionSchema.parse(pending());
    const routes = (saved.nodes.find((n) => n.id === "r")!.config.routes as Array<{ label: string }>).map((x) => x.label);
    expect(routes).toEqual(["priority", "warm"]);
    // The wired edge kept its destination and was relabeled with it.
    expect(saved.edges.find((e) => e.to === "h")?.label).toBe("priority");
  });
});
