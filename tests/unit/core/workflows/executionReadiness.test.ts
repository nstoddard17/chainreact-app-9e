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
