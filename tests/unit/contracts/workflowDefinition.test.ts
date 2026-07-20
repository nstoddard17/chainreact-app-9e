import {
  EMPTY_WORKFLOW_DEFINITION,
  WorkflowDefinitionSchema,
  WorkflowEdgeSchema,
  WorkflowNodeSchema,
} from "@/contracts/workflowDefinition";

describe("WorkflowNodeSchema", () => {
  const valid = {
    id: "n1",
    kind: "trigger",
    provider: "slack",
    type: "message_received",
    config: { channelId: "C123" },
    position: { x: 0, y: 0 },
  };

  it("accepts a fully-specified node", () => {
    expect(WorkflowNodeSchema.safeParse(valid).success).toBe(true);
  });

  it("defaults config + position when omitted", () => {
    const r = WorkflowNodeSchema.parse({
      id: "n1",
      kind: "action",
      provider: "slack",
      type: "send_channel_message",
    });
    expect(r.config).toEqual({});
    expect(r.position).toEqual({ x: 0, y: 0 });
  });

  it("allows empty `type` (transient — node added but action not yet picked)", () => {
    expect(
      WorkflowNodeSchema.safeParse({
        id: "n1",
        kind: "action",
        provider: "slack",
        type: "",
      }).success,
    ).toBe(true);
  });

  it("rejects unknown node kinds (logic deferred to a later slice)", () => {
    expect(
      WorkflowNodeSchema.safeParse({ ...valid, kind: "logic" }).success,
    ).toBe(false);
  });

  it("rejects an empty id", () => {
    expect(WorkflowNodeSchema.safeParse({ ...valid, id: "" }).success).toBe(false);
  });

  it("rejects a non-finite position coordinate", () => {
    expect(
      WorkflowNodeSchema.safeParse({
        ...valid,
        position: { x: Number.POSITIVE_INFINITY, y: 0 },
      }).success,
    ).toBe(false);
  });
});

describe("WorkflowEdgeSchema", () => {
  it("accepts a valid edge", () => {
    expect(
      WorkflowEdgeSchema.safeParse({ id: "e1", from: "n1", to: "n2" }).success,
    ).toBe(true);
  });

  it("rejects an edge with an empty endpoint", () => {
    expect(
      WorkflowEdgeSchema.safeParse({ id: "e1", from: "", to: "n2" }).success,
    ).toBe(false);
  });

  // Engine-branching Commit 1 — WorkflowEdge.label? contract additions.
  // See docs/slices/parity/engine-branching-plan.md §3.1.

  it("accepts a valid label (non-empty, ≤64 chars)", () => {
    expect(
      WorkflowEdgeSchema.safeParse({
        id: "e1",
        from: "n1",
        to: "n2",
        label: "yes",
      }).success,
    ).toBe(true);
    expect(
      WorkflowEdgeSchema.safeParse({
        id: "e1",
        from: "n1",
        to: "n2",
        label: "match-path-42_underscored",
      }).success,
    ).toBe(true);
  });

  it("rejects an empty label", () => {
    expect(
      WorkflowEdgeSchema.safeParse({
        id: "e1",
        from: "n1",
        to: "n2",
        label: "",
      }).success,
    ).toBe(false);
  });

  it("rejects a label longer than 64 chars", () => {
    expect(
      WorkflowEdgeSchema.safeParse({
        id: "e1",
        from: "n1",
        to: "n2",
        label: "a".repeat(65),
      }).success,
    ).toBe(false);
    // Exactly 64 is fine.
    expect(
      WorkflowEdgeSchema.safeParse({
        id: "e1",
        from: "n1",
        to: "n2",
        label: "a".repeat(64),
      }).success,
    ).toBe(true);
  });

  it("treats missing label as unlabeled (legacy behavior preserved)", () => {
    const r = WorkflowEdgeSchema.parse({ id: "e1", from: "n1", to: "n2" });
    expect(r.label).toBeUndefined();
  });
});

describe("WorkflowDefinitionSchema", () => {
  function trigger(id: string) {
    return {
      id,
      kind: "trigger" as const,
      provider: "slack",
      type: "message_received",
      config: {},
      position: { x: 0, y: 0 },
    };
  }
  function action(id: string) {
    return {
      id,
      kind: "action" as const,
      provider: "slack",
      type: "send_channel_message",
      config: {},
      position: { x: 0, y: 100 },
    };
  }

  it("EMPTY_WORKFLOW_DEFINITION parses cleanly", () => {
    expect(WorkflowDefinitionSchema.safeParse(EMPTY_WORKFLOW_DEFINITION).success).toBe(true);
  });

  it("accepts a definition with one trigger and a chain of actions", () => {
    const def = {
      nodes: [trigger("n1"), action("n2"), action("n3")],
      edges: [
        { id: "e1", from: "n1", to: "n2" },
        { id: "e2", from: "n2", to: "n3" },
      ],
    };
    expect(WorkflowDefinitionSchema.safeParse(def).success).toBe(true);
  });

  it("rejects more than one trigger node", () => {
    const def = {
      nodes: [trigger("n1"), trigger("n2")],
      edges: [],
    };
    const result = WorkflowDefinitionSchema.safeParse(def);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/at most one trigger/);
    }
  });

  it("rejects edges that reference unknown nodes", () => {
    const def = {
      nodes: [trigger("n1")],
      edges: [{ id: "e1", from: "n1", to: "ghost" }],
    };
    const result = WorkflowDefinitionSchema.safeParse(def);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes("unknown node 'ghost'"))).toBe(true);
    }
  });

  it("rejects self-loop edges", () => {
    const def = {
      nodes: [trigger("n1")],
      edges: [{ id: "e1", from: "n1", to: "n1" }],
    };
    const result = WorkflowDefinitionSchema.safeParse(def);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes("self-loop"))).toBe(true);
    }
  });

  it("rejects duplicate edges between the same node pair (both unlabeled)", () => {
    const def = {
      nodes: [trigger("n1"), action("n2")],
      edges: [
        { id: "e1", from: "n1", to: "n2" },
        { id: "e2", from: "n1", to: "n2" },
      ],
    };
    const result = WorkflowDefinitionSchema.safeParse(def);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.message.includes("Duplicate edge")),
      ).toBe(true);
    }
  });

  // Engine-branching Commit 1 — duplicate-edge dedup keyed on
  // (from, to, label ?? ""). See engine-branching-plan.md §3.5.

  it("rejects duplicate edges with the same from/to and the same label", () => {
    const def = {
      nodes: [trigger("n1"), action("n2")],
      edges: [
        { id: "e1", from: "n1", to: "n2", label: "yes" },
        { id: "e2", from: "n1", to: "n2", label: "yes" },
      ],
    };
    const result = WorkflowDefinitionSchema.safeParse(def);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) =>
          i.message.includes("label 'yes'"),
        ),
      ).toBe(true);
    }
  });

  it("allows two edges between the same from/to under different labels", () => {
    const def = {
      nodes: [trigger("n1"), action("n2")],
      edges: [
        { id: "e1", from: "n1", to: "n2", label: "yes" },
        { id: "e2", from: "n1", to: "n2", label: "no" },
      ],
    };
    expect(WorkflowDefinitionSchema.safeParse(def).success).toBe(true);
  });

  it("allows one labeled + one unlabeled edge between the same from/to (different dedup keys)", () => {
    const def = {
      nodes: [trigger("n1"), action("n2")],
      edges: [
        { id: "e1", from: "n1", to: "n2", label: "yes" },
        { id: "e2", from: "n1", to: "n2" },
      ],
    };
    expect(WorkflowDefinitionSchema.safeParse(def).success).toBe(true);
  });

  it("allows same-labeled edges from one source to different targets (router fan-out)", () => {
    const def = {
      nodes: [trigger("n1"), action("n2"), action("n3")],
      edges: [
        { id: "e1", from: "n1", to: "n2", label: "match" },
        { id: "e2", from: "n1", to: "n3", label: "match" },
      ],
    };
    expect(WorkflowDefinitionSchema.safeParse(def).success).toBe(true);
  });

  it("rejects duplicate node ids", () => {
    const def = {
      nodes: [trigger("n1"), action("n1")],
      edges: [],
    };
    const result = WorkflowDefinitionSchema.safeParse(def);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.message.includes("Duplicate node id")),
      ).toBe(true);
    }
  });

  // RECONV-1 S1 — divergence/reconvergence definitions are schema-legal. The
  // dedup key is `${from}->${to}::${label ?? ""}`, so rejoining edges (distinct
  // from-nodes into one shared target, or one source with distinct labels) are
  // never mistaken for duplicates.
  describe("RECONV-1 divergence/reconvergence", () => {
    // branch n2 → (true → n3, false → n4) → shared n5.
    const diamondEdges = [
      { id: "e1", from: "n1", to: "n2" },
      { id: "e2", from: "n2", to: "n3", label: "true" },
      { id: "e3", from: "n2", to: "n4", label: "false" },
      { id: "e4", from: "n3", to: "n5" },
      { id: "e5", from: "n4", to: "n5" },
    ];
    const diamondNodes = [trigger("n1"), action("n2"), action("n3"), action("n4"), action("n5")];

    it("accepts a full diamond (2 labeled edges out of the branch, 2 edges into the shared node)", () => {
      expect(
        WorkflowDefinitionSchema.safeParse({ nodes: diamondNodes, edges: diamondEdges }).success,
      ).toBe(true);
    });

    it("accepts a direct rejoin — true→S and false→S from the same branch node", () => {
      const def = {
        nodes: [trigger("n1"), action("n2"), action("n3")],
        edges: [
          { id: "e1", from: "n1", to: "n2" },
          { id: "e2", from: "n2", to: "n3", label: "true" },
          { id: "e3", from: "n2", to: "n3", label: "false" },
        ],
      };
      expect(WorkflowDefinitionSchema.safeParse(def).success).toBe(true);
    });

    it("rejects a diamond containing an identically-duplicated labeled edge (same from/to/label)", () => {
      const def = {
        nodes: diamondNodes,
        edges: [...diamondEdges, { id: "e2-dup", from: "n2", to: "n3", label: "true" }],
      };
      const result = WorkflowDefinitionSchema.safeParse(def);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some(
            (i) => i.message.includes("Duplicate edge") && i.message.includes("label 'true'"),
          ),
        ).toBe(true);
      }
    });
  });
});
