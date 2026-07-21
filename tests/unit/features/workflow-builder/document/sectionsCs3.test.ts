/**
 * Sections × CS-3 surfaces (queue + map) — pure integration (CS-4).
 *
 * Queue ORDER is unchanged by sections (still document execution order); a
 * section title leads the item's breadcrumb. The Whole Workflow map renders
 * section PARENT rows over their contained rows, preserving fork/lane hierarchy
 * inside, with aggregated status.
 */
import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import type { WorkflowPresentation } from "@/contracts/workflowPresentation";
import { projectDefinitionToDocument } from "@/features/workflow-builder/document/projection";
import { buildDocumentOutline } from "@/features/workflow-builder/document/documentOutline";
import { buildSetupQueue } from "@/features/workflow-builder/document/setupQueueModel";
import { buildWholeWorkflowMap } from "@/features/workflow-builder/document/wholeWorkflowMapModel";
import { collectBuilderValidationIssues } from "@/features/workflow-builder/validation/collectBuilderValidationIssues";
import type { RequiredFieldsByType } from "@/core/workflows/requiredFields";

function node(id: string, over: Partial<WorkflowNode> = {}): WorkflowNode {
  return { id, kind: "action", provider: "slack", type: "send_channel_message", config: {}, position: { x: 0, y: 0 }, ...over };
}
function trigger(id = "t"): WorkflowNode {
  return node(id, { kind: "trigger", provider: "hubspot", type: "new_contact" });
}
function edge(from: string, to: string): WorkflowEdge {
  return { id: `${from}->${to}`, from, to };
}
const req: RequiredFieldsByType = {
  "hubspot:new_contact": { displayName: "New Contact", requiredFields: [] },
  "slack:send_channel_message": {
    displayName: "Send Channel Message",
    requiredFields: [{ name: "channel", label: "Channel" }, { name: "text", label: "Message" }],
  },
};
const pres = (sections: WorkflowPresentation["sections"]): WorkflowPresentation => ({ version: 1, sections });

function build(nodes: readonly WorkflowNode[], edges: readonly WorkflowEdge[], presentation: WorkflowPresentation | null) {
  const model = projectDefinitionToDocument({ nodes, edges, requiredFieldsByType: req });
  const outline = buildDocumentOutline(model);
  const issues = collectBuilderValidationIssues({ pendingNodes: nodes, pendingEdges: edges, requiredFieldsByType: req });
  const queue = buildSetupQueue({ outline, issues, presentation });
  const map = buildWholeWorkflowMap({ outline, issues, queue, presentation });
  return { queue, map };
}

const nodes = [trigger(), node("a"), node("b"), node("c")];
const edges = [edge("t", "a"), edge("a", "b"), edge("b", "c")];

describe("Finish Setup queue with sections", () => {
  it("queue ORDER is unchanged by section grouping", () => {
    const noSec = build(nodes, edges, null).queue.items.map((i) => `${i.nodeId}:${i.fieldKey}`);
    const withSec = build(nodes, edges, pres([{ id: "s1", title: "Qualify", nodeIds: ["a", "b"] }])).queue.items.map(
      (i) => `${i.nodeId}:${i.fieldKey}`,
    );
    expect(withSec).toEqual(noSec);
  });

  it("a section title leads the breadcrumb of items inside it", () => {
    const { queue } = build(nodes, edges, pres([{ id: "s1", title: "Qualify", nodeIds: ["a", "b"] }]));
    const aItem = queue.items.find((i) => i.nodeId === "a")!;
    const cItem = queue.items.find((i) => i.nodeId === "c")!;
    expect(aItem.crumbs[0]).toBe("Qualify");
    expect(cItem.crumbs).toEqual([]); // c is not in the section
  });
});

describe("Whole Workflow map with sections", () => {
  it("renders a section PARENT row and indents its contained rows", () => {
    const { map } = build(nodes, edges, pres([{ id: "s1", title: "Qualify", nodeIds: ["a", "b"] }]));
    const parent = map.rows.find((r) => r.kind === "section");
    expect(parent).toBeDefined();
    expect(parent?.kind === "section" && parent.sectionId).toBe("s1");
    // The section's contained step rows are deeper than the parent.
    const aRow = map.rows.find((r) => r.nodeId === "a")!;
    expect(aRow.depth).toBeGreaterThan(parent!.depth);
    // A row outside the section keeps depth 0.
    const cRow = map.rows.find((r) => r.nodeId === "c")!;
    expect(cRow.depth).toBe(0);
  });

  it("the section parent aggregates the most-severe contained status", () => {
    // a + b both need details → parent needs_detail.
    const { map } = build(nodes, edges, pres([{ id: "s1", title: "Qualify", nodeIds: ["a", "b"] }]));
    const parent = map.rows.find((r) => r.kind === "section")!;
    expect(parent.status).toBe("needs_detail");
  });

  it("every executable step still appears exactly once", () => {
    const { map } = build(nodes, edges, pres([{ id: "s1", title: "Q", nodeIds: ["a", "b"] }]));
    const stepIds = map.rows.filter((r) => r.kind === "trigger" || r.kind === "step").map((r) => r.nodeId);
    expect(stepIds.sort()).toEqual(["a", "b", "c", "t"]);
  });
});
