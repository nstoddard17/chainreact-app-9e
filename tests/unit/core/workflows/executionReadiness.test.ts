import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import type { RequiredFieldsByType } from "@/core/workflows/requiredFields";
import {
  evaluateExecutionReadiness,
  findGraphIssues,
  toReadinessError,
} from "@/core/workflows/executionReadiness";

const HTTP_REQUIRED: RequiredFieldsByType = {
  "native:http_request": {
    displayName: "HTTP Request",
    requiredFields: [
      { name: "method", label: "Method" },
      { name: "url", label: "URL" },
    ],
  },
};

function trigger(id = "t1"): WorkflowNode {
  return { id, kind: "trigger", provider: "native", type: "manual.run", config: {}, position: { x: 0, y: 0 } };
}
function http(id: string, config: Record<string, unknown>): WorkflowNode {
  return { id, kind: "action", provider: "native", type: "http_request", config, position: { x: 0, y: 0 } };
}
function edge(id: string, from: string, to: string): WorkflowEdge {
  return { id, from, to };
}
function labeledEdge(id: string, from: string, to: string, label: string): WorkflowEdge {
  return { id, from, to, label };
}
// RECONV-1 S1 — real branching node types so findGraphIssues' branch-wiring
// pass (findBranchWiringIssues) sees a label vocabulary.
function ifThen(id: string, config: Record<string, unknown> = {}): WorkflowNode {
  return { id, kind: "action", provider: "native", type: "if_then_condition", config, position: { x: 0, y: 0 } };
}
function router(id: string, config: Record<string, unknown>): WorkflowNode {
  return { id, kind: "action", provider: "native", type: "router", config, position: { x: 0, y: 0 } };
}

describe("findGraphIssues", () => {
  it("no_trigger when there are zero triggers", () => {
    const issues = findGraphIssues([http("a1", {})], []);
    expect(issues.map((i) => i.code)).toContain("no_trigger");
  });

  it("multiple_triggers flags every extra trigger", () => {
    const issues = findGraphIssues([trigger("t1"), trigger("t2"), trigger("t3")], []);
    const multi = issues.filter((i) => i.code === "multiple_triggers");
    expect(multi.map((i) => i.nodeId)).toEqual(["t2", "t3"]);
  });

  it("stale_edge when an edge references a missing node", () => {
    const issues = findGraphIssues(
      [trigger(), http("a1", {})],
      [edge("e1", "t1", "a1"), edge("e2", "a1", "ghost")],
    );
    const stale = issues.find((i) => i.code === "stale_edge");
    expect(stale?.edgeId).toBe("e2");
    expect(stale?.to).toBe("ghost");
  });

  it("self_loop_edge when an edge connects a node to itself (CS-1)", () => {
    const issues = findGraphIssues(
      [trigger(), http("a1", {})],
      [edge("e1", "t1", "a1"), edge("e2", "a1", "a1")],
    );
    const sl = issues.find((i) => i.code === "self_loop_edge");
    expect(sl?.edgeId).toBe("e2");
    expect(sl?.nodeId).toBe("a1");
    // A self-loop on an EXISTING node is not mis-reported as a stale (dangling) edge.
    expect(issues.some((i) => i.code === "stale_edge")).toBe(false);
  });

  it("unreachable_node for an action with no path from the trigger", () => {
    const issues = findGraphIssues([trigger(), http("a1", {})], []);
    const u = issues.find((i) => i.code === "unreachable_node");
    expect(u?.nodeId).toBe("a1");
  });

  it("a connected linear graph (Trigger → A) has no issues", () => {
    expect(findGraphIssues([trigger(), http("a1", {})], [edge("e1", "t1", "a1")])).toEqual([]);
  });

  it("rewired middle-node delete (Trigger → A2) has no issues", () => {
    expect(findGraphIssues([trigger(), http("a2", {})], [edge("e", "t1", "a2")])).toEqual([]);
  });

  it("a stale edge does not 'rescue' an otherwise-orphan node", () => {
    // Only edge into a1 comes from a missing node → a1 still unreachable.
    const issues = findGraphIssues([trigger(), http("a1", {})], [edge("e", "ghost", "a1")]);
    expect(issues.some((i) => i.code === "unreachable_node" && i.nodeId === "a1")).toBe(true);
    expect(issues.some((i) => i.code === "stale_edge")).toBe(true);
  });
});

// ─── RECONV-1 S1 — divergence/reconvergence graph acceptance ────────────────
//
// Reconverging (diamond) graphs are first-class: none of the shared graph
// checks (stale/self-loop/branch-wiring/reachability) may flag a well-formed
// rejoin, and adding a genuinely-broken edge to a diamond still reports it.
describe("findGraphIssues — RECONV-1 divergence/reconvergence", () => {
  it("If/Then diamond (true→A→S, false→B→S, S→tail) has no issues", () => {
    const nodes = [trigger(), ifThen("b"), http("a", {}), http("bb", {}), http("s", {}), http("tail", {})];
    const edges = [
      edge("e1", "t1", "b"),
      labeledEdge("e2", "b", "a", "true"),
      labeledEdge("e3", "b", "bb", "false"),
      edge("e4", "a", "s"),
      edge("e5", "bb", "s"),
      edge("e6", "s", "tail"),
    ];
    expect(findGraphIssues(nodes, edges)).toEqual([]);
  });

  it("direct rejoin (true→S and false→S straight from the branch node) has no issues", () => {
    const nodes = [trigger(), ifThen("b"), http("s", {})];
    const edges = [
      edge("e1", "t1", "b"),
      labeledEdge("e2", "b", "s", "true"),
      labeledEdge("e3", "b", "s", "false"),
    ];
    expect(findGraphIssues(nodes, edges)).toEqual([]);
  });

  it("three-lane Router rejoin (routes a/b + defaultRoute d, all lanes → S) has no issues", () => {
    const nodes = [
      trigger(),
      router("r", { routes: [{ label: "a" }, { label: "b" }], defaultRoute: "d" }),
      http("la", {}),
      http("lb", {}),
      http("ld", {}),
      http("s", {}),
    ];
    const edges = [
      edge("e1", "t1", "r"),
      labeledEdge("e2", "r", "la", "a"),
      labeledEdge("e3", "r", "lb", "b"),
      labeledEdge("e4", "r", "ld", "d"),
      edge("e5", "la", "s"),
      edge("e6", "lb", "s"),
      edge("e7", "ld", "s"),
    ];
    expect(findGraphIssues(nodes, edges)).toEqual([]);
  });

  it("one-terminal-branch encoding (onFalse='skip', only true→A→S wired) has no issues", () => {
    const nodes = [trigger(), ifThen("b", { onFalse: "skip" }), http("a", {}), http("s", {})];
    const edges = [
      edge("e1", "t1", "b"),
      labeledEdge("e2", "b", "a", "true"),
      edge("e3", "a", "s"),
    ];
    expect(findGraphIssues(nodes, edges)).toEqual([]);
  });

  it("a diamond PLUS a self-loop edge still reports self_loop_edge (and nothing else)", () => {
    const nodes = [trigger(), ifThen("b"), http("a", {}), http("bb", {}), http("s", {})];
    const edges = [
      edge("e1", "t1", "b"),
      labeledEdge("e2", "b", "a", "true"),
      labeledEdge("e3", "b", "bb", "false"),
      edge("e4", "a", "s"),
      edge("e5", "bb", "s"),
      edge("e-loop", "s", "s"),
    ];
    const issues = findGraphIssues(nodes, edges);
    expect(issues.map((i) => i.code)).toEqual(["self_loop_edge"]);
    expect(issues[0]?.edgeId).toBe("e-loop");
    expect(issues[0]?.nodeId).toBe("s");
  });

  it("a diamond with a stale labeled edge (onFalse='skip' leftover False lane) still reports stale_branch_edge", () => {
    // The branch switched to skip-on-false but the old False lane edges remain:
    // the 'false' edge can never activate → stale_branch_edge, nothing else.
    const nodes = [trigger(), ifThen("b", { onFalse: "skip" }), http("a", {}), http("bb", {}), http("s", {})];
    const edges = [
      edge("e1", "t1", "b"),
      labeledEdge("e2", "b", "a", "true"),
      labeledEdge("e3", "b", "bb", "false"),
      edge("e4", "a", "s"),
      edge("e5", "bb", "s"),
    ];
    const issues = findGraphIssues(nodes, edges);
    expect(issues.map((i) => i.code)).toEqual(["stale_branch_edge"]);
    expect(issues[0]?.edgeId).toBe("e3");
    expect(issues[0]?.branchLabel).toBe("false");
    expect(issues[0]?.nodeId).toBe("b");
  });
});

describe("evaluateExecutionReadiness + toReadinessError", () => {
  const connected = [trigger(), http("a1", { method: "GET", url: "https://example.com" })];
  const connectedEdges = [edge("e1", "t1", "a1")];

  it("ok for a connected, fully-configured workflow → toReadinessError null", () => {
    const result = evaluateExecutionReadiness({
      nodes: connected,
      edges: connectedEdges,
      requiredFieldsByType: HTTP_REQUIRED,
    });
    expect(result.ok).toBe(true);
    expect(toReadinessError(result)).toBeNull();
  });

  it("MISSING_REQUIRED_FIELDS with A's exact message when only config is missing", () => {
    const result = evaluateExecutionReadiness({
      nodes: [trigger(), http("a1", {})],
      edges: connectedEdges,
      requiredFieldsByType: HTTP_REQUIRED,
    });
    const err = toReadinessError(result);
    expect(err?.error).toBe("MISSING_REQUIRED_FIELDS");
    expect(err?.message).toBe("HTTP Request is missing required fields: Method, URL.");
    expect(err && "nodes" in err && err.nodes[0]?.missingFields).toEqual(["Method", "URL"]);
  });

  it("INVALID_WORKFLOW_GRAPH for a self-loop edge — now a shared runtime block (CS-1)", () => {
    const result = evaluateExecutionReadiness({
      nodes: connected,
      edges: [...connectedEdges, edge("e-loop", "a1", "a1")],
      requiredFieldsByType: HTTP_REQUIRED,
    });
    expect(result.ok).toBe(false);
    const err = toReadinessError(result);
    expect(err?.error).toBe("INVALID_WORKFLOW_GRAPH");
    expect(err && "graph" in err && err.graph.some((g) => g.code === "self_loop_edge")).toBe(true);
  });

  it("INVALID_WORKFLOW_GRAPH for an orphan action (graph takes precedence over field gaps)", () => {
    // a1 is both unreachable AND missing fields → graph wins.
    const result = evaluateExecutionReadiness({
      nodes: [trigger(), http("a1", {})],
      edges: [],
      requiredFieldsByType: HTTP_REQUIRED,
    });
    const err = toReadinessError(result);
    expect(err?.error).toBe("INVALID_WORKFLOW_GRAPH");
    expect(err && "graph" in err && err.graph.some((g) => g.code === "unreachable_node")).toBe(true);
  });

  it("a required field with a metadata default is satisfied even when config omits it (read_rows majorDimension)", () => {
    // Mirrors google-sheets:read_rows — `majorDimension` is required but
    // declares defaultValue "ROWS" (hasDefault). A config that supplies the
    // non-defaulted required fields but omits the defaulted one is READY: the
    // default fills it (deriveDefaultConfig at build-time / Zod .default() at
    // runtime). Without this, the workflow failed pre-execution with
    // "Read Rows is missing required fields: Major dimension."
    const lookup: RequiredFieldsByType = {
      "google-sheets:read_rows": {
        displayName: "Read Rows",
        requiredFields: [
          { name: "spreadsheetId", label: "Spreadsheet", hasDefault: false },
          { name: "range", label: "Range", hasDefault: false },
          { name: "majorDimension", label: "Major dimension", hasDefault: true },
        ],
      },
    };
    const node: WorkflowNode = {
      id: "a1", kind: "action", provider: "google-sheets", type: "read_rows",
      config: { spreadsheetId: "ss-1", range: "Sheet1!A1:D5" }, // majorDimension omitted
      position: { x: 0, y: 0 },
    };
    const result = evaluateExecutionReadiness({
      nodes: [trigger(), node],
      edges: [edge("e1", "t1", "a1")],
      requiredFieldsByType: lookup,
    });
    expect(result.fieldGaps).toEqual([]);
    expect(result.ok).toBe(true);
    expect(toReadinessError(result)).toBeNull();
  });

  it("a required field with an empty-string value is satisfied when it declares a default (notion search query)", () => {
    // Mirrors notion:search — `query` is required but empty "" means "search
    // all accessible objects" and the field declares defaultValue "". An empty
    // value on a defaulted field is NOT a gap (would otherwise fail with
    // "Search is missing required fields: Search query.").
    const lookup: RequiredFieldsByType = {
      "notion:search": {
        displayName: "Search",
        requiredFields: [{ name: "query", label: "Search query", hasDefault: true }],
      },
    };
    const node: WorkflowNode = {
      id: "a1", kind: "action", provider: "notion", type: "search",
      config: { query: "" }, position: { x: 0, y: 0 },
    };
    const result = evaluateExecutionReadiness({
      nodes: [trigger(), node],
      edges: [edge("e1", "t1", "a1")],
      requiredFieldsByType: lookup,
    });
    expect(result.fieldGaps).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("a required field WITHOUT a default is still flagged when missing (no over-relaxation)", () => {
    // Guard: the hasDefault relaxation must not leak to non-defaulted fields.
    const lookup: RequiredFieldsByType = {
      "google-sheets:read_rows": {
        displayName: "Read Rows",
        requiredFields: [
          { name: "spreadsheetId", label: "Spreadsheet", hasDefault: false },
          { name: "majorDimension", label: "Major dimension", hasDefault: true },
        ],
      },
    };
    const node: WorkflowNode = {
      id: "a1", kind: "action", provider: "google-sheets", type: "read_rows",
      config: { majorDimension: "ROWS" }, // spreadsheetId (no default) missing
      position: { x: 0, y: 0 },
    };
    const result = evaluateExecutionReadiness({
      nodes: [trigger(), node],
      edges: [edge("e1", "t1", "a1")],
      requiredFieldsByType: lookup,
    });
    expect(result.fieldGaps[0]?.missingFields).toEqual(["Spreadsheet"]);
  });

  it("0 and false are valid required values (not missing)", () => {
    const lookup: RequiredFieldsByType = {
      "native:x": { displayName: "X", requiredFields: [{ name: "n", label: "N" }, { name: "b", label: "B" }] },
    };
    const node: WorkflowNode = {
      id: "a1", kind: "action", provider: "native", type: "x",
      config: { n: 0, b: false }, position: { x: 0, y: 0 },
    };
    const result = evaluateExecutionReadiness({
      nodes: [trigger(), node],
      edges: [edge("e1", "t1", "a1")],
      requiredFieldsByType: lookup,
    });
    expect(result.fieldGaps).toEqual([]);
  });
});
