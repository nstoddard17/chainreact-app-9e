/**
 * Pure graph→Document projection fixtures (5.DUAL-BUILDER-1 / CS-1).
 *
 * Locks the projection invariants from the planning doc §6.3 + CS-1 spec:
 * deterministic, total (never throws), non-mutating, every node represented
 * exactly once, lanes from edge labels only, honest degradation (no
 * misleading Tier A prose for unsupported shapes).
 */
import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import {
  projectDefinitionToDocument,
  type DocumentBlock,
  type DocumentModel,
  type DocumentProjectionInput,
} from "@/features/workflow-builder/document/projection";
import { MAX_FORK_DEPTH } from "@/features/workflow-builder/document/projectionTiers";
import type { RequiredFieldsByType } from "@/core/workflows/requiredFields";
import type { NodeSummaryFieldsByType } from "@/core/workflows/nodeSummaryFields";

// ---- fixture helpers ---------------------------------------------------------

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
  return {
    id: `${from}->${to}${label ? `:${label}` : ""}`,
    from,
    to,
    ...(label !== undefined ? { label } : {}),
  };
}

function ifNode(id: string, over: Partial<WorkflowNode> = {}): WorkflowNode {
  return node(id, {
    provider: "native",
    type: "if_then_condition",
    config: {
      input: "{{trigger.amount}}",
      operator: "greater_than",
      value: "100",
      onFalse: "branch",
    },
    ...over,
  });
}

function routerNode(id: string, labels: readonly string[], defaultRoute?: string): WorkflowNode {
  return node(id, {
    provider: "native",
    type: "router",
    config: {
      routes: labels.map((label) => ({
        label,
        condition: { input: "{{trigger.kind}}", operator: "equals", value: label },
      })),
      ...(defaultRoute ? { defaultRoute } : {}),
    },
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

function project(input: DocumentProjectionInput): DocumentModel {
  // Frozen inputs: any mutation attempt throws in strict mode → test fails.
  return projectDefinitionToDocument({
    ...input,
    nodes: deepFreeze(input.nodes.map((n) => deepFreeze({ ...n, config: { ...n.config }, position: { ...n.position } }))),
    edges: deepFreeze(input.edges.map((e) => deepFreeze({ ...e }))),
  });
}

/** Every node id represented in the model, counted (sentences, fork headers, complex lists). */
function representedIds(blocks: readonly DocumentBlock[]): string[] {
  const out: string[] = [];
  for (const block of blocks) {
    if (block.kind === "sentence") out.push(block.nodeId);
    else if (block.kind === "fork") {
      out.push(block.nodeId);
      for (const lane of block.lanes) out.push(...representedIds(lane.blocks));
    } else {
      out.push(...block.nodeIds);
    }
  }
  return out;
}

function expectEveryNodeOnce(model: DocumentModel, nodes: readonly WorkflowNode[]): void {
  const got = representedIds(model.blocks).sort();
  const want = nodes.map((n) => n.id).sort();
  expect(got).toEqual(want);
}

function forkBlocks(blocks: readonly DocumentBlock[]): DocumentBlock[] {
  const out: DocumentBlock[] = [];
  for (const b of blocks) {
    if (b.kind === "fork") {
      out.push(b);
      for (const lane of b.lanes) out.push(...forkBlocks(lane.blocks));
    }
  }
  return out;
}

// ---- fixtures ----------------------------------------------------------------

describe("projectDefinitionToDocument — fixtures", () => {
  it("empty workflow → empty Tier A model", () => {
    const model = project({ nodes: [], edges: [] });
    expect(model.empty).toBe(true);
    expect(model.tier).toBe("A");
    expect(model.blocks).toEqual([]);
  });

  it("trigger only → one trigger sentence", () => {
    const nodes = [trigger()];
    const model = project({ nodes, edges: [] });
    expect(model.tier).toBe("A");
    expect(model.blocks).toHaveLength(1);
    expect(model.blocks[0]).toMatchObject({ kind: "sentence", nodeId: "t", nodeKind: "trigger" });
    expectEveryNodeOnce(model, nodes);
  });

  it("linear chain renders sentences in execution order", () => {
    const nodes = [node("a2"), trigger("t"), node("a1")]; // shuffled array order
    const edges = [edge("t", "a1"), edge("a1", "a2")];
    const model = project({ nodes, edges });
    expect(model.tier).toBe("A");
    expect(model.blocks.map((b) => (b.kind === "sentence" ? b.nodeId : b.kind))).toEqual([
      "t",
      "a1",
      "a2",
    ]);
    expectEveryNodeOnce(model, nodes);
  });

  it("If/Then with both lanes and an unambiguous rejoin", () => {
    const nodes = [trigger("t"), ifNode("if"), node("a"), node("b"), node("r")];
    const edges = [
      edge("t", "if"),
      edge("if", "a", "true"),
      edge("if", "b", "false"),
      edge("a", "r"),
      edge("b", "r"),
    ];
    const model = project({ nodes, edges });
    expect(model.tier).toBe("A");
    const [tBlock, fork, rejoin] = model.blocks;
    expect(tBlock).toMatchObject({ kind: "sentence", nodeId: "t" });
    expect(fork).toMatchObject({ kind: "fork", nodeId: "if", rejoinNodeId: "r" });
    if (fork?.kind !== "fork") throw new Error("expected fork");
    expect(fork.lanes.map((l) => l.label)).toEqual(["true", "false"]);
    expect(fork.lanes.map((l) => l.title)).toEqual(["If yes", "Otherwise"]);
    expect(fork.lanes[0]!.blocks).toHaveLength(1);
    expect(fork.lanes[0]!.terminal).toBe(false);
    // The rejoin renders exactly ONCE, after the fork — never inside a lane.
    expect(rejoin).toMatchObject({ kind: "sentence", nodeId: "r" });
    expectEveryNodeOnce(model, nodes);
  });

  it("If/Then with one terminal lane (no rejoin)", () => {
    const nodes = [trigger("t"), ifNode("if"), node("a"), node("b"), node("b2")];
    const edges = [
      edge("t", "if"),
      edge("if", "a", "true"),
      edge("if", "b", "false"),
      edge("b", "b2"),
    ];
    const model = project({ nodes, edges });
    expect(model.tier).toBe("A");
    const fork = model.blocks[1];
    if (fork?.kind !== "fork") throw new Error("expected fork");
    expect(fork.rejoinNodeId).toBeNull();
    expect(fork.lanes[0]!.terminal).toBe(true); // a ends
    expect(fork.lanes[1]!.blocks.map((b) => (b.kind === "sentence" ? b.nodeId : b.kind))).toEqual([
      "b",
      "b2",
    ]);
    expect(fork.lanes[1]!.terminal).toBe(true);
    expectEveryNodeOnce(model, nodes);
  });

  it("Router with three labeled routes → three lanes in route order", () => {
    const nodes = [trigger("t"), routerNode("rt", ["hot", "warm", "cold"]), node("h"), node("w"), node("c")];
    const edges = [
      edge("t", "rt"),
      edge("rt", "h", "hot"),
      edge("rt", "w", "warm"),
      edge("rt", "c", "cold"),
    ];
    const model = project({ nodes, edges });
    expect(model.tier).toBe("A");
    const fork = model.blocks[1];
    if (fork?.kind !== "fork") throw new Error("expected fork");
    expect(fork.lanes.map((l) => l.label)).toEqual(["hot", "warm", "cold"]);
    expect(fork.lanes.every((l) => l.terminal)).toBe(true);
    expect(fork.conditionSummary).toMatch(/3 routes/);
    // Router lane subtitles carry the route condition, deterministically.
    expect(fork.lanes[0]!.subtitle).toBe("trigger.kind equals hot");
    expectEveryNodeOnce(model, nodes);
  });

  it("a rejoin shared by only SOME lanes still resolves when others terminate", () => {
    const nodes = [trigger("t"), routerNode("rt", ["a", "b", "c"]), node("na"), node("nb"), node("nc"), node("m")];
    const edges = [
      edge("t", "rt"),
      edge("rt", "na", "a"),
      edge("rt", "nb", "b"),
      edge("rt", "nc", "c"),
      edge("na", "m"),
      edge("nb", "m"),
    ];
    const model = project({ nodes, edges });
    expect(model.tier).toBe("A");
    const fork = model.blocks[1];
    if (fork?.kind !== "fork") throw new Error("expected fork");
    expect(fork.rejoinNodeId).toBe("m");
    expect(fork.lanes[2]!.terminal).toBe(true);
    expect(model.blocks[2]).toMatchObject({ kind: "sentence", nodeId: "m" });
    expectEveryNodeOnce(model, nodes);
  });

  it("nested fork renders inside its lane (depth 2)", () => {
    const nodes = [
      trigger("t"),
      ifNode("f1"),
      ifNode("f2", { config: { input: "x", operator: "equals", value: "1", onFalse: "branch" } }),
      node("a"),
      node("b"),
      node("c"),
    ];
    const edges = [
      edge("t", "f1"),
      edge("f1", "f2", "true"),
      edge("f1", "c", "false"),
      edge("f2", "a", "true"),
      edge("f2", "b", "false"),
    ];
    const model = project({ nodes, edges });
    expect(model.tier).toBe("A");
    const outer = model.blocks[1];
    if (outer?.kind !== "fork") throw new Error("expected fork");
    const nested = outer.lanes[0]!.blocks[0];
    expect(nested).toMatchObject({ kind: "fork", nodeId: "f2", depth: 1 });
    expectEveryNodeOnce(model, nodes);
  });

  it(`nesting beyond depth ${MAX_FORK_DEPTH} degrades that fork to a complex region`, () => {
    // Chain of skip-mode If/Then forks: f1 → f2 → f3 → f4 (each via its "true" lane).
    const skipIf = (id: string) =>
      ifNode(id, { config: { input: "x", operator: "equals", value: "1", onFalse: "skip" } });
    const nodes = [trigger("t"), skipIf("f1"), skipIf("f2"), skipIf("f3"), skipIf("f4"), node("end")];
    const edges = [
      edge("t", "f1"),
      edge("f1", "f2", "true"),
      edge("f2", "f3", "true"),
      edge("f3", "f4", "true"),
      edge("f4", "end", "true"),
    ];
    const model = project({ nodes, edges });
    expect(model.tier).toBe("B");
    const forks = forkBlocks(model.blocks).map((b) => (b.kind === "fork" ? b.nodeId : ""));
    expect(forks).toEqual(["f1", "f2", "f3"]);
    const flatJson = JSON.stringify(model.blocks);
    expect(flatJson).toContain('"reason":"nesting_too_deep"');
    expectEveryNodeOnce(model, nodes);
  });

  it("unlabeled edge from a branch node renders as a distinct always lane", () => {
    const nodes = [trigger("t"), ifNode("if"), node("a"), node("b"), node("cleanup")];
    const edges = [
      edge("t", "if"),
      edge("if", "a", "true"),
      edge("if", "b", "false"),
      edge("if", "cleanup"),
    ];
    const model = project({ nodes, edges });
    expect(model.tier).toBe("A");
    const fork = model.blocks[1];
    if (fork?.kind !== "fork") throw new Error("expected fork");
    expect(fork.lanes).toHaveLength(3);
    const always = fork.lanes[2]!;
    expect(always.kindHint).toBe("always");
    expect(always.title).toBe("Always");
    expect(always.blocks[0]).toMatchObject({ kind: "sentence", nodeId: "cleanup" });
    expectEveryNodeOnce(model, nodes);
  });

  // CS-2 — transient wiring gaps keep the fork READABLE with a lane warning
  // (CS-1 collapsed the whole fork into a complex region).
  it("missing branch edge keeps the fork visible with a warning lane", () => {
    const nodes = [trigger("t"), ifNode("if"), node("a")];
    const edges = [edge("t", "if"), edge("if", "a", "true")]; // "false" unwired
    const model = project({ nodes, edges });
    expect(model.tier).toBe("A");
    const fork = model.blocks[1];
    if (fork?.kind !== "fork") throw new Error("expected fork");
    expect(fork.lanes.map((l) => l.label)).toEqual(["true", "false"]);
    expect(fork.lanes[0]!.warning).toBeNull();
    expect(fork.lanes[1]!.warning).toMatchObject({ code: "missing_branch_edge" });
    expect(fork.lanes[1]!.blocks).toEqual([]);
    expect(fork.lanes[1]!.terminal).toBe(false);
    expectEveryNodeOnce(model, nodes);
  });

  it("stale branch edge keeps the fork visible with a warning lane", () => {
    const nodes = [
      trigger("t"),
      ifNode("if", { config: { input: "x", operator: "equals", value: "1", onFalse: "skip" } }),
      node("a"),
      node("b"),
    ];
    const edges = [
      edge("t", "if"),
      edge("if", "a", "true"),
      edge("if", "b", "false"), // stale: skip-mode never returns "false"
    ];
    const model = project({ nodes, edges });
    expect(model.tier).toBe("A");
    const fork = model.blocks[1];
    if (fork?.kind !== "fork") throw new Error("expected fork");
    // The vocabulary lane renders first; the stale lane follows, flagged.
    expect(fork.lanes.map((l) => l.label)).toEqual(["true", "false"]);
    expect(fork.lanes[0]!.warning).toBeNull();
    expect(fork.lanes[1]!.warning).toMatchObject({ code: "stale_branch_edge" });
    // The stale lane still SHOWS its steps (they exist in the graph) but never
    // votes on the rejoin — it is a dead path at runtime.
    expect(fork.lanes[1]!.blocks[0]).toMatchObject({ kind: "sentence", nodeId: "b" });
    expectEveryNodeOnce(model, nodes);
  });

  it("lanes converging at TWO different joins → ambiguous_rejoin region (never a fake rejoin)", () => {
    const nodes = [
      trigger("t"),
      routerNode("rt", ["a", "b", "c", "d"]),
      node("na"),
      node("nb"),
      node("nc"),
      node("nd"),
      node("m1"),
      node("m2"),
    ];
    const edges = [
      edge("t", "rt"),
      edge("rt", "na", "a"),
      edge("rt", "nb", "b"),
      edge("rt", "nc", "c"),
      edge("rt", "nd", "d"),
      edge("na", "m1"),
      edge("nb", "m1"),
      edge("nc", "m2"),
      edge("nd", "m2"),
    ];
    const model = project({ nodes, edges });
    expect(model.tier).toBe("B");
    const complex = model.blocks.find((b) => b.kind === "complex");
    expect(complex).toMatchObject({ kind: "complex", reason: "ambiguous_rejoin" });
    // No fork block claims a rejoin; nothing renders as Tier A prose lanes.
    expect(forkBlocks(model.blocks)).toHaveLength(0);
    expectEveryNodeOnce(model, nodes);
  });

  it("cross-link from outside the main path → cross_lane region + disconnected sweep", () => {
    const nodes = [trigger("t"), node("a"), node("j"), node("o")];
    const edges = [edge("t", "a"), edge("a", "j"), edge("o", "j")];
    const model = project({ nodes, edges });
    expect(model.tier).toBe("B");
    const reasons = model.blocks.filter((b) => b.kind === "complex").map((b) =>
      b.kind === "complex" ? b.reason : "",
    );
    expect(reasons).toEqual(["cross_lane", "disconnected"]);
    expectEveryNodeOnce(model, nodes);
  });

  it("parallel fan-out from a non-branching node → complex region, prose stops honestly", () => {
    const nodes = [trigger("t"), node("a"), node("b"), node("c")];
    const edges = [edge("t", "a"), edge("a", "b"), edge("a", "c")];
    const model = project({ nodes, edges });
    expect(model.tier).toBe("B");
    expect(model.blocks[0]).toMatchObject({ kind: "sentence", nodeId: "t" });
    expect(model.blocks[1]).toMatchObject({ kind: "sentence", nodeId: "a" });
    expect(model.blocks[2]).toMatchObject({ kind: "complex", reason: "parallel_fan_out" });
    expectEveryNodeOnce(model, nodes);
  });

  it("labeled edges out of a NON-branching node degrade (labels are engine routing)", () => {
    const nodes = [trigger("t"), node("a"), node("b")];
    const edges = [edge("t", "a"), edge("a", "b", "yes")];
    const model = project({ nodes, edges });
    expect(model.tier).toBe("B");
    expect(model.blocks.find((b) => b.kind === "complex")).toMatchObject({
      reason: "labeled_edge_non_branching",
    });
    expectEveryNodeOnce(model, nodes);
  });

  it("cycle → Tier C fallback; never rendered as executable prose", () => {
    const nodes = [trigger("t"), node("a"), node("b")];
    const edges = [edge("t", "a"), edge("a", "b"), edge("b", "a")];
    const model = project({ nodes, edges });
    expect(model.tier).toBe("C");
    expect(model.blocks).toHaveLength(1);
    expect(model.blocks[0]).toMatchObject({ kind: "complex", reason: "cycle" });
    expectEveryNodeOnce(model, nodes);
  });

  it("multiple triggers → Tier C fallback", () => {
    const nodes = [trigger("t1"), trigger("t2"), node("a")];
    const edges = [edge("t1", "a")];
    const model = project({ nodes, edges });
    expect(model.tier).toBe("C");
    expect(model.blocks[0]).toMatchObject({ kind: "complex", reason: "multiple_triggers" });
    expectEveryNodeOnce(model, nodes);
  });

  it("disconnected nodes are listed honestly, never dropped", () => {
    const nodes = [trigger("t"), node("a"), node("x"), node("y")];
    const edges = [edge("t", "a"), edge("x", "y")];
    const model = project({ nodes, edges });
    expect(model.tier).toBe("B");
    const complex = model.blocks.find((b) => b.kind === "complex");
    if (complex?.kind !== "complex") throw new Error("expected complex");
    expect(complex.reason).toBe("disconnected");
    expect([...complex.nodeIds].sort()).toEqual(["x", "y"]);
    expectEveryNodeOnce(model, nodes);
  });

  it("no trigger → starts from the single source with a warning", () => {
    const nodes = [node("a"), node("b")];
    const edges = [edge("a", "b")];
    const model = project({ nodes, edges });
    expect(model.warnings.some((w) => w.code === "no_trigger")).toBe(true);
    expect(model.blocks.map((b) => (b.kind === "sentence" ? b.nodeId : b.kind))).toEqual([
      "a",
      "b",
    ]);
    expectEveryNodeOnce(model, nodes);
  });

  it("malformed-but-tolerable input: edges to missing nodes skipped, duplicate ids merged", () => {
    const nodes = [trigger("t"), node("a"), node("a")];
    const edges = [edge("t", "a"), edge("a", "ghost"), edge("ghost", "a")];
    const model = project({ nodes, edges });
    expect(model.warnings.some((w) => w.code === "duplicate_node_id")).toBe(true);
    expect(model.warnings.some((w) => w.code === "invalid_edge_skipped")).toBe(true);
    expect(representedIds(model.blocks).sort()).toEqual(["a", "t"]);
  });
});

// ---- metadata-driven chips ----------------------------------------------------

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

describe("projectDefinitionToDocument — metadata chips", () => {
  it("configured values become value chips; empty required fields become blank chips", () => {
    const nodes = [trigger("t"), node("a", { config: { text: "New lead: {{trigger.name}}" } })];
    const edges = [edge("t", "a")];
    const model = project({ nodes, edges, requiredFieldsByType, summaryFieldsByType });
    const sentence = model.blocks[1];
    if (sentence?.kind !== "sentence") throw new Error("expected sentence");
    expect(sentence.title).toBe("Send Channel Message");
    expect(sentence.valueChips).toEqual([
      { name: "text", label: "Message", display: "from the trigger", kind: "dynamic" },
    ]);
    expect(sentence.blankChips).toEqual([{ name: "channel", label: "Channel" }]);
  });

  it("unknown provider:type (metadata provided, no entry) → single-node region, walk continues", () => {
    const nodes = [trigger("t"), node("mys", { provider: "mystery", type: "zap" }), node("a")];
    const edges = [edge("t", "mys"), edge("mys", "a")];
    const model = project({ nodes, edges, requiredFieldsByType, summaryFieldsByType });
    expect(model.tier).toBe("B");
    expect(model.blocks[1]).toMatchObject({
      kind: "complex",
      reason: "unknown_node_type",
      nodeIds: ["mys"],
    });
    expect(model.blocks[2]).toMatchObject({ kind: "sentence", nodeId: "a" });
    expectEveryNodeOnce(model, nodes);
  });

  it("an untyped node renders as a normal sentence (draft state, not unknown)", () => {
    const nodes = [trigger("t"), node("u", { type: "" })];
    const edges = [edge("t", "u")];
    const model = project({ nodes, edges, requiredFieldsByType, summaryFieldsByType });
    expect(model.blocks[1]).toMatchObject({ kind: "sentence", nodeId: "u", untyped: true });
  });

  it("fork blank chips use the same required-field rule", () => {
    const nodes = [trigger("t"), ifNode("if", { config: { onFalse: "branch" } }), node("a"), node("b")];
    const edges = [
      edge("t", "if"),
      edge("if", "a", "true"),
      edge("if", "b", "false"),
    ];
    const model = project({ nodes, edges, requiredFieldsByType, summaryFieldsByType });
    const fork = model.blocks[1];
    if (fork?.kind !== "fork") throw new Error("expected fork");
    expect(fork.blankChips.map((c) => c.name).sort()).toEqual(["input", "operator"]);
    expect(fork.conditionSummary).toBe("Condition not set up yet");
  });
});

// ---- invariants ----------------------------------------------------------------

describe("projectDefinitionToDocument — invariants", () => {
  const FIXTURES: Array<{ name: string; input: DocumentProjectionInput }> = [
    { name: "empty", input: { nodes: [], edges: [] } },
    { name: "linear", input: { nodes: [trigger("t"), node("a")], edges: [edge("t", "a")] } },
    {
      name: "if-then rejoin",
      input: {
        nodes: [trigger("t"), ifNode("if"), node("a"), node("b"), node("r")],
        edges: [
          edge("t", "if"),
          edge("if", "a", "true"),
          edge("if", "b", "false"),
          edge("a", "r"),
          edge("b", "r"),
        ],
      },
    },
    {
      name: "cycle",
      input: {
        nodes: [trigger("t"), node("a")],
        edges: [edge("t", "a"), edge("a", "t")],
      },
    },
    {
      name: "fan-out",
      input: {
        nodes: [trigger("t"), node("a"), node("b"), node("c")],
        edges: [edge("t", "a"), edge("a", "b"), edge("a", "c")],
      },
    },
  ];

  it.each(FIXTURES)("deterministic + non-mutating: $name", ({ input }) => {
    const snapshotBefore = JSON.stringify({ nodes: input.nodes, edges: input.edges });
    const first = project(input);
    const second = project(input);
    expect(JSON.stringify(first)).toEqual(JSON.stringify(second));
    expect(JSON.stringify({ nodes: input.nodes, edges: input.edges })).toEqual(snapshotBefore);
  });

  it("lanes are determined by edge labels, never by node positions", () => {
    const base = {
      nodes: [trigger("t"), ifNode("if"), node("a"), node("b"), node("r")],
      edges: [
        edge("t", "if"),
        edge("if", "a", "true"),
        edge("if", "b", "false"),
        edge("a", "r"),
        edge("b", "r"),
      ],
    };
    const moved = {
      ...base,
      nodes: base.nodes.map((n, i) => ({
        ...n,
        position: { x: 1000 - i * 313, y: (i * 977) % 541 },
      })),
    };
    expect(JSON.stringify(project(base).blocks)).toEqual(JSON.stringify(project(moved).blocks));
  });

  it("never throws for arbitrary WorkflowDefinition-shaped junk", () => {
    const junkInputs: DocumentProjectionInput[] = [
      { nodes: [node("a", { config: null as unknown as Record<string, unknown> })], edges: [] },
      { nodes: [trigger("t")], edges: [edge("t", "t")] }, // self-loop
      {
        nodes: [trigger("t"), routerNode("rt", ["x"])],
        edges: [edge("t", "rt"), edge("rt", "t", "x")], // labeled cycle back to trigger
      },
    ];
    for (const input of junkInputs) {
      expect(() => projectDefinitionToDocument(input)).not.toThrow();
    }
  });
});
