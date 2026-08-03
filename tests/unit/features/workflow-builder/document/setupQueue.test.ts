/** @jest-environment node */
/**
 * Pure Finish Setup queue model (5.DUAL-BUILDER-1 / CS-3).
 *
 * Locks the queue derivation from the SAME authoritative sources that drive the
 * header issues pill: `collectBuilderValidationIssues` (missing fields, branch
 * wiring, structural) + the Document projection/outline (order + branch/lane
 * context). Proves deterministic ordering, branch context, stable identity,
 * honest structural/wiring handoff (never a fake field stop), and totality.
 */
import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import { projectDefinitionToDocument } from "@/features/workflow-builder/document/projection";
import { buildDocumentOutline } from "@/features/workflow-builder/document/documentOutline";
import {
  buildSetupQueue,
  deriveSetupBannerState,
  type SetupQueue,
} from "@/features/workflow-builder/document/setupQueueModel";
import {
  collectBuilderValidationIssues,
  countBuilderValidationIssues,
} from "@/features/workflow-builder/validation/collectBuilderValidationIssues";
import type { RequiredFieldsByType } from "@/core/workflows/requiredFields";
import type { NodeSummaryFieldsByType } from "@/core/workflows/nodeSummaryFields";

// ---- fixtures ---------------------------------------------------------------

function node(id: string, over: Partial<WorkflowNode> = {}): WorkflowNode {
  return {
    id,
    kind: "action",
    provider: "slack",
    type: "send_channel_message",
    config: {},
    position: { x: 0, y: 0 },
    ...over,
  };
}
function trigger(id = "t", over: Partial<WorkflowNode> = {}): WorkflowNode {
  return node(id, { kind: "trigger", provider: "hubspot", type: "new_contact", ...over });
}
function edge(from: string, to: string, label?: string): WorkflowEdge {
  return { id: `${from}->${to}${label ? `:${label}` : ""}`, from, to, ...(label !== undefined ? { label } : {}) };
}
function ifNode(id: string, over: Partial<WorkflowNode> = {}): WorkflowNode {
  return node(id, {
    provider: "native",
    type: "if_then_condition",
    config: { input: "{{trigger.amount}}", operator: "greater_than", value: "100", onFalse: "branch" },
    ...over,
  });
}
function routerNode(id: string, labels: readonly string[]): WorkflowNode {
  return node(id, {
    provider: "native",
    type: "router",
    config: {
      routes: labels.map((label) => ({
        label,
        condition: { input: "{{trigger.kind}}", operator: "equals", value: label },
      })),
    },
  });
}

const requiredFieldsByType: RequiredFieldsByType = {
  "hubspot:new_contact": { displayName: "New Contact", requiredFields: [] },
  "slack:send_channel_message": {
    displayName: "Send Channel Message",
    requiredFields: [
      { name: "channel", label: "Channel" },
      { name: "text", label: "Message" },
    ],
  },
  "native:if_then_condition": {
    displayName: "If/Then Condition",
    requiredFields: [
      { name: "input", label: "Input" },
      { name: "operator", label: "Operator" },
    ],
  },
};

const summaryFieldsByType: NodeSummaryFieldsByType = {
  "hubspot:new_contact": { displayName: "New Contact", fields: [] },
  "slack:send_channel_message": {
    displayName: "Send Channel Message",
    fields: [
      { name: "channel", label: "Channel", type: "select", required: true },
      { name: "text", label: "Message", type: "textarea", required: true },
    ],
  },
};

function buildQueue(nodes: readonly WorkflowNode[], edges: readonly WorkflowEdge[]): SetupQueue {
  const model = projectDefinitionToDocument({ nodes, edges, requiredFieldsByType, summaryFieldsByType });
  const outline = buildDocumentOutline(model);
  const issues = collectBuilderValidationIssues({ pendingNodes: nodes, pendingEdges: edges, requiredFieldsByType });
  return buildSetupQueue({ outline, issues });
}

// ---- tests ------------------------------------------------------------------

describe("buildSetupQueue — ordering & classification", () => {
  it("empty workflow → empty queue (no field stops)", () => {
    const q = buildQueue([], []);
    expect(q.items).toEqual([]);
    expect(q.supportedCount).toBe(0);
    // The only issue an empty workflow raises is structural (no trigger) —
    // surfaced as a handoff, never a field stop.
    expect(q.items).toHaveLength(0);
    expect(q.handoffs.every((h) => h.reason === "structural")).toBe(true);
  });

  it("no unresolved items → empty queue", () => {
    const nodes = [trigger("t"), node("a", { config: { channel: "C1", text: "hi" } })];
    const q = buildQueue(nodes, [edge("t", "a")]);
    expect(q.supportedCount).toBe(0);
  });

  it("one missing field → one item with stable identity + label", () => {
    const nodes = [trigger("t"), node("a", { config: { channel: "C1" } })];
    const q = buildQueue(nodes, [edge("t", "a")]);
    expect(q.items).toHaveLength(1);
    expect(q.items[0]).toMatchObject({
      id: "a::text",
      nodeId: "a",
      fieldKey: "text",
      issueCode: "missing_required_field",
      kind: "field",
    });
    expect(q.items[0]!.label).toContain("Message");
  });

  it("multiple fields on one node → metadata field order", () => {
    const nodes = [trigger("t"), node("a")];
    const q = buildQueue(nodes, [edge("t", "a")]);
    expect(q.items.map((i) => i.fieldKey)).toEqual(["channel", "text"]);
  });

  it("multiple nodes → deterministic document order, not node-array order", () => {
    // node-array order is shuffled; document (execution) order is t → a1 → a2.
    const nodes = [node("a2"), trigger("t"), node("a1")];
    const edges = [edge("t", "a1"), edge("a1", "a2")];
    const q = buildQueue(nodes, edges);
    expect(q.items.map((i) => `${i.nodeId}:${i.fieldKey}`)).toEqual([
      "a1:channel",
      "a1:text",
      "a2:channel",
      "a2:text",
    ]);
    // documentOrder strictly increases across distinct nodes.
    const a1 = q.items.find((i) => i.nodeId === "a1")!.documentOrder;
    const a2 = q.items.find((i) => i.nodeId === "a2")!.documentOrder;
    expect(a1).toBeLessThan(a2);
  });

  it("If/Then lanes → items ordered fork, then true lane, then false lane", () => {
    const nodes = [trigger("t"), ifNode("if"), node("a"), node("b")];
    const edges = [edge("t", "if"), edge("if", "a", "true"), edge("if", "b", "false")];
    const q = buildQueue(nodes, edges);
    // fork's own blanks (input/operator are set here) → none; then lane nodes.
    expect(q.items.map((i) => i.nodeId)).toEqual(["a", "a", "b", "b"]);
  });

  it("Router multi-lane → lanes in route (vocabulary) order", () => {
    const nodes = [trigger("t"), routerNode("rt", ["hot", "warm", "cold"]), node("h"), node("w"), node("c")];
    const edges = [
      edge("t", "rt"),
      edge("rt", "h", "hot"),
      edge("rt", "w", "warm"),
      edge("rt", "c", "cold"),
    ];
    const q = buildQueue(nodes, edges);
    expect([...new Set(q.items.map((i) => i.nodeId))]).toEqual(["h", "w", "c"]);
  });

  it("nested branch context → breadcrumb crumbs from fork + lane titles", () => {
    const nodes = [
      trigger("t"),
      ifNode("f1", { displayName: "Qualify & route" }),
      ifNode("f2", {
        displayName: "Enterprise check",
        config: { input: "x", operator: "equals", value: "1", onFalse: "branch" },
      }),
      node("deep"),
      node("cc"),
      node("c"),
    ];
    const edges = [
      edge("t", "f1"),
      edge("f1", "f2", "true"),
      edge("f1", "c", "false"),
      edge("f2", "deep", "true"),
      edge("f2", "cc", "false"),
    ];
    const q = buildQueue(nodes, edges);
    const deep = q.items.find((i) => i.nodeId === "deep");
    expect(deep).toBeDefined();
    // "Qualify & route" (outer fork) › "If yes" (outer lane) › "If yes" (inner lane)
    expect(deep!.crumbs).toEqual(["Qualify & route", "If yes", "If yes"]);
  });

  it("terminal lane items are still queued (terminal path remains editable)", () => {
    const nodes = [trigger("t"), ifNode("if"), node("a"), node("b")];
    const edges = [edge("t", "if"), edge("if", "a", "true"), edge("if", "b", "false")];
    const q = buildQueue(nodes, edges);
    expect(q.items.some((i) => i.nodeId === "a")).toBe(true);
    expect(q.items.some((i) => i.nodeId === "b")).toBe(true);
  });

  it("a rejoin node's fields appear exactly once", () => {
    const nodes = [trigger("t"), ifNode("if"), node("a"), node("b"), node("r")];
    const edges = [
      edge("t", "if"),
      edge("if", "a", "true"),
      edge("if", "b", "false"),
      edge("a", "r"),
      edge("b", "r"),
    ];
    const q = buildQueue(nodes, edges);
    const rItems = q.items.filter((i) => i.nodeId === "r");
    expect(rItems.map((i) => i.fieldKey)).toEqual(["channel", "text"]); // once each
  });

  it("stale branch warning is NOT a field stop — it is a branch_wiring handoff", () => {
    const nodes = [
      trigger("t"),
      ifNode("if"),
      node("a", { config: { channel: "C", text: "hi" } }),
      // "false" lane unwired → missing_branch_edge
    ];
    const q = buildQueue(nodes, [edge("t", "if"), edge("if", "a", "true")]);
    expect(q.items.every((i) => i.nodeId !== "if" || i.kind === "field")).toBe(true);
    const wiring = q.handoffs.find((h) => h.issueCode === "missing_branch_edge");
    expect(wiring).toMatchObject({ reason: "branch_wiring" });
    expect(q.items.some((i) => i.issueCode === "missing_branch_edge")).toBe(false);
  });

  it("structural issue (unreachable node) is excluded from the field queue", () => {
    const nodes = [trigger("t"), node("a", { config: { channel: "C", text: "hi" } }), node("orphan", { config: { channel: "C", text: "hi" } })];
    // orphan not connected → unreachable
    const q = buildQueue(nodes, [edge("t", "a")]);
    expect(q.items.some((i) => i.nodeId === "orphan")).toBe(false);
    expect(q.handoffs.some((h) => h.reason === "structural")).toBe(true);
  });

  it("hidden required field (unmet visibleWhen) is excluded from the queue", () => {
    const hiddenReq: RequiredFieldsByType = {
      ...requiredFieldsByType,
      "slack:send_channel_message": {
        displayName: "Send Channel Message",
        requiredFields: [
          { name: "channel", label: "Channel" },
          { name: "threadId", label: "Thread", visibleWhen: { field: "mode", valueIn: ["reply"] } },
        ],
      },
    };
    const nodes = [trigger("t"), node("a", { config: { channel: "C" } })]; // mode !== reply
    const model = projectDefinitionToDocument({ nodes, edges: [edge("t", "a")], requiredFieldsByType: hiddenReq, summaryFieldsByType });
    const outline = buildDocumentOutline(model);
    const issues = collectBuilderValidationIssues({ pendingNodes: nodes, pendingEdges: [edge("t", "a")], requiredFieldsByType: hiddenReq });
    const q = buildSetupQueue({ outline, issues });
    expect(q.items.map((i) => i.fieldKey)).not.toContain("threadId");
  });

  it("resolving a field (config filled) removes only that item; identity stable for the rest", () => {
    const before = buildQueue([trigger("t"), node("a")], [edge("t", "a")]);
    expect(before.items.map((i) => i.id)).toEqual(["a::channel", "a::text"]);
    const after = buildQueue([trigger("t"), node("a", { config: { channel: "C1" } })], [edge("t", "a")]);
    expect(after.items.map((i) => i.id)).toEqual(["a::text"]);
    // the surviving item kept its stable identity.
    expect(after.items[0]!.id).toBe(before.items[1]!.id);
  });

  it("never throws for junk graphs (totality)", () => {
    const junk: Array<[WorkflowNode[], WorkflowEdge[]]> = [
      [[trigger("t")], [edge("t", "t")]], // self-loop → Tier C
      [[trigger("t1"), trigger("t2")], []], // multiple triggers
      [[node("a", { config: null as unknown as Record<string, unknown> })], []],
    ];
    for (const [nodes, edges] of junk) {
      expect(() => buildQueue(nodes, edges)).not.toThrow();
    }
  });
});

// ---- banner parity ----------------------------------------------------------

describe("deriveSetupBannerState — readiness parity", () => {
  function banner(nodes: readonly WorkflowNode[], edges: readonly WorkflowEdge[], isDirty: boolean) {
    const q = buildQueue(nodes, edges);
    const issues = collectBuilderValidationIssues({ pendingNodes: nodes, pendingEdges: edges, requiredFieldsByType });
    return deriveSetupBannerState({
      queue: q,
      blockingErrorCount: countBuilderValidationIssues(issues).errorCount,
      isDirty,
    });
  }

  it("unresolved fields → needs_setup with the supported count", () => {
    const b = banner([trigger("t"), node("a")], [edge("t", "a")], true);
    expect(b.primary).toBe("needs_setup");
    expect(b.supportedCount).toBe(2);
  });

  it("all fields filled + dirty → ready_unsaved (Save still required)", () => {
    const b = banner([trigger("t"), node("a", { config: { channel: "C", text: "hi" } })], [edge("t", "a")], true);
    expect(b.primary).toBe("ready_unsaved");
    expect(b.supportedCount).toBe(0);
  });

  it("all fields filled + clean → ready_saved", () => {
    const b = banner([trigger("t"), node("a", { config: { channel: "C", text: "hi" } })], [edge("t", "a")], false);
    expect(b.primary).toBe("ready_saved");
  });

  it("structural blocker with no field stops → blocked_structural", () => {
    // no trigger → structural error, no queueable field items
    const b = banner([node("a", { config: { channel: "C", text: "hi" } })], [], true);
    expect(b.supportedCount).toBe(0);
    expect(b.primary).toBe("blocked_structural");
    expect(b.blockingErrorCount).toBeGreaterThan(0);
  });
});

// ---- queue ⊆ validation parity ---------------------------------------------

describe("queue vs validation parity", () => {
  it("every queue item corresponds to a validation issue on the same node/field", () => {
    const nodes = [trigger("t"), ifNode("if"), node("a"), node("b", { config: { channel: "C" } })];
    const edges = [edge("t", "if"), edge("if", "a", "true"), edge("if", "b", "false")];
    const q = buildQueue(nodes, edges);
    const issues = collectBuilderValidationIssues({ pendingNodes: nodes, pendingEdges: edges, requiredFieldsByType });
    for (const item of q.items) {
      const match = issues.find((i) => i.nodeId === item.nodeId && i.fieldName === item.fieldKey);
      expect(match).toBeDefined();
    }
    // Validation may legitimately be LARGER (structural / wiring issues).
    expect(issues.length).toBeGreaterThanOrEqual(q.items.length);
  });
});
