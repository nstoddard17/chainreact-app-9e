/**
 * Tests for features/workflow-builder/validation/collectBuilderValidationIssues.
 *
 * Pure helper (Slice 4.BUILDER-VALIDATION-1). Conservative issue
 * coverage: no_trigger, unconfigured_node, router_routes_invalid.
 * Re-uses the existing `_routesValidator` for router config — no
 * second source of truth.
 */
import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import {
  collectBuilderValidationIssues,
  countBuilderValidationIssues,
  isRequiredValueMissing,
  missingRequiredFields,
  type RequiredFieldsByType,
} from "@/features/workflow-builder/validation/collectBuilderValidationIssues";

// BUILDER-READINESS — minimal lookup mirroring native:http_request metadata.
const HTTP_REQUIRED: RequiredFieldsByType = {
  "native:http_request": {
    displayName: "HTTP Request",
    requiredFields: [
      { name: "method", label: "Method" },
      { name: "url", label: "URL" },
    ],
  },
};

function httpNode(config: Record<string, unknown>): WorkflowNode {
  return {
    id: "h1",
    kind: "action",
    provider: "native",
    type: "http_request",
    config,
    position: { x: 0, y: 0 },
  };
}

function makeNode(partial: Partial<WorkflowNode> & Pick<WorkflowNode, "id" | "kind">): WorkflowNode {
  return {
    id: partial.id,
    kind: partial.kind,
    provider: partial.provider ?? "slack",
    type: partial.type ?? "",
    config: partial.config ?? {},
    position: partial.position ?? { x: 0, y: 0 },
  };
}

const NO_EDGES: readonly WorkflowEdge[] = [];

describe("collectBuilderValidationIssues — no_trigger", () => {
  it("returns a no_trigger error when the workflow has no nodes", () => {
    const issues = collectBuilderValidationIssues({
      pendingNodes: [],
      pendingEdges: NO_EDGES,
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "no_trigger",
      severity: "error",
    });
    expect(issues[0]!.nodeId).toBeUndefined();
  });

  it("returns a no_trigger error when only actions exist", () => {
    const issues = collectBuilderValidationIssues({
      pendingNodes: [
        makeNode({ id: "a1", kind: "action", type: "slack:send_message" }),
      ],
      pendingEdges: NO_EDGES,
    });
    const codes = issues.map((i) => i.code);
    expect(codes).toContain("no_trigger");
  });

  it("does NOT return no_trigger when a trigger node exists (even unconfigured)", () => {
    const issues = collectBuilderValidationIssues({
      pendingNodes: [makeNode({ id: "t1", kind: "trigger", type: "" })],
      pendingEdges: NO_EDGES,
    });
    const codes = issues.map((i) => i.code);
    expect(codes).not.toContain("no_trigger");
  });
});

describe("collectBuilderValidationIssues — unconfigured_node", () => {
  it("emits an unconfigured_node error for every node with empty type", () => {
    const issues = collectBuilderValidationIssues({
      pendingNodes: [
        makeNode({ id: "t1", kind: "trigger", type: "" }),
        makeNode({ id: "a1", kind: "action", type: "" }),
      ],
      pendingEdges: NO_EDGES,
    });
    const unconfigured = issues.filter((i) => i.code === "unconfigured_node");
    expect(unconfigured).toHaveLength(2);
    expect(unconfigured.map((i) => i.nodeId)).toEqual(["t1", "a1"]);
  });

  it("uses different copy for trigger vs action unconfigured nodes", () => {
    const issues = collectBuilderValidationIssues({
      pendingNodes: [
        makeNode({ id: "t1", kind: "trigger", type: "" }),
        makeNode({ id: "a1", kind: "action", type: "" }),
      ],
      pendingEdges: NO_EDGES,
    });
    const triggerIssue = issues.find(
      (i) => i.code === "unconfigured_node" && i.nodeId === "t1",
    );
    const actionIssue = issues.find(
      (i) => i.code === "unconfigured_node" && i.nodeId === "a1",
    );
    expect(triggerIssue?.message).toMatch(/trigger/i);
    expect(actionIssue?.message).toMatch(/action/i);
  });

  it("does NOT emit unconfigured_node when type is set (even when other issues exist)", () => {
    const issues = collectBuilderValidationIssues({
      pendingNodes: [
        makeNode({ id: "t1", kind: "trigger", type: "slack:message" }),
      ],
      pendingEdges: NO_EDGES,
    });
    const codes = issues.map((i) => i.code);
    expect(codes).not.toContain("unconfigured_node");
  });
});

describe("collectBuilderValidationIssues — router_routes_invalid", () => {
  it("flags a router node with no routes value", () => {
    const issues = collectBuilderValidationIssues({
      pendingNodes: [
        makeNode({
          id: "r1",
          kind: "action",
          provider: "native",
          type: "native:router",
          config: {},
        }),
      ],
      pendingEdges: NO_EDGES,
    });
    const routerIssue = issues.find((i) => i.code === "router_routes_invalid");
    expect(routerIssue).toBeDefined();
    expect(routerIssue?.severity).toBe("error");
    expect(routerIssue?.nodeId).toBe("r1");
    expect(routerIssue?.fieldName).toBe("routes");
  });

  it("flags a router with duplicate route labels (delegates to _routesValidator)", () => {
    const issues = collectBuilderValidationIssues({
      pendingNodes: [
        makeNode({
          id: "r1",
          kind: "action",
          provider: "native",
          type: "native:router",
          config: {
            routes: [
              {
                label: "yes",
                condition: { input: "x", operator: "equals", value: 1 },
              },
              {
                label: "yes",
                condition: { input: "x", operator: "equals", value: 2 },
              },
            ],
          },
        }),
      ],
      pendingEdges: NO_EDGES,
    });
    const routerIssue = issues.find((i) => i.code === "router_routes_invalid");
    expect(routerIssue).toBeDefined();
  });

  it("does NOT emit router_routes_invalid when routes are valid", () => {
    const issues = collectBuilderValidationIssues({
      pendingNodes: [
        makeNode({
          id: "t1",
          kind: "trigger",
          provider: "slack",
          type: "slack:message",
        }),
        makeNode({
          id: "r1",
          kind: "action",
          provider: "native",
          type: "native:router",
          config: {
            routes: [
              {
                label: "match",
                condition: { input: "x", operator: "equals", value: 1 },
              },
            ],
          },
        }),
      ],
      pendingEdges: NO_EDGES,
    });
    expect(
      issues.find((i) => i.code === "router_routes_invalid"),
    ).toBeUndefined();
  });

  it("does NOT validate routes on a non-router node, even if the config has a routes field", () => {
    const issues = collectBuilderValidationIssues({
      pendingNodes: [
        makeNode({
          id: "t1",
          kind: "trigger",
          provider: "slack",
          type: "slack:message",
        }),
        makeNode({
          id: "a1",
          kind: "action",
          provider: "slack",
          type: "slack:send_message",
          config: { routes: "garbage" },
        }),
      ],
      pendingEdges: NO_EDGES,
    });
    expect(
      issues.find((i) => i.code === "router_routes_invalid"),
    ).toBeUndefined();
  });

  it("skips router validation when the router node itself is unconfigured (type empty)", () => {
    // Node added by `+ Add action` with provider `native` but never
    // picked the specific router action — type is "". Don't try to
    // validate its routes; the unconfigured_node error is the
    // actionable signal.
    const issues = collectBuilderValidationIssues({
      pendingNodes: [
        makeNode({
          id: "t1",
          kind: "trigger",
          provider: "slack",
          type: "slack:message",
        }),
        makeNode({
          id: "r1",
          kind: "action",
          provider: "native",
          type: "",
        }),
      ],
      pendingEdges: NO_EDGES,
    });
    expect(
      issues.find((i) => i.code === "router_routes_invalid"),
    ).toBeUndefined();
    expect(
      issues.find((i) => i.code === "unconfigured_node" && i.nodeId === "r1"),
    ).toBeDefined();
  });
});

describe("collectBuilderValidationIssues — stable ids + provider-agnostic", () => {
  it("emits stable ids that distinguish issues on the same node", () => {
    const issues = collectBuilderValidationIssues({
      pendingNodes: [
        makeNode({
          id: "t1",
          kind: "trigger",
          provider: "slack",
          type: "slack:message",
        }),
        makeNode({
          id: "r1",
          kind: "action",
          provider: "native",
          type: "native:router",
          config: {},
        }),
      ],
      pendingEdges: NO_EDGES,
    });
    const ids = issues.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("router_routes_invalid:r1");
  });

  it("does not branch on provider strings other than the documented native router type", () => {
    // Sanity check: feeding a fictional provider with a non-router type
    // returns no provider-specific issues — only the generic checks fire.
    const issues = collectBuilderValidationIssues({
      pendingNodes: [
        makeNode({
          id: "t1",
          kind: "trigger",
          provider: "fictional-provider",
          type: "fictional:trigger",
        }),
        makeNode({
          id: "a1",
          kind: "action",
          provider: "fictional-provider",
          type: "fictional:action",
        }),
      ],
      // Connected so the action isn't flagged unreachable — this test is about
      // provider-string branching, not connectivity.
      pendingEdges: [{ id: "e1", from: "t1", to: "a1" }],
    });
    expect(issues).toHaveLength(0);
  });
});

describe("collectBuilderValidationIssues — graph integrity (B)", () => {
  const trig = () => makeNode({ id: "t1", kind: "trigger", type: "slack:message" });
  const act = (id: string) => makeNode({ id, kind: "action", type: "slack:send_message" });

  it("flags an unreachable action (no edge from the trigger)", () => {
    const issues = collectBuilderValidationIssues({
      pendingNodes: [trig(), act("a1")],
      pendingEdges: NO_EDGES,
    });
    const u = issues.find((i) => i.code === "unreachable_node");
    expect(u).toBeDefined();
    expect(u?.nodeId).toBe("a1");
    expect(u?.severity).toBe("error");
  });

  it("does NOT flag a connected action", () => {
    const issues = collectBuilderValidationIssues({
      pendingNodes: [trig(), act("a1")],
      pendingEdges: [{ id: "e1", from: "t1", to: "a1" }],
    });
    expect(issues.some((i) => i.code === "unreachable_node")).toBe(false);
  });

  it("rewired middle-node delete (Trigger → A2) stays valid", () => {
    // After deleting A1 from Trigger → A1 → A2 the graph is Trigger → A2.
    const issues = collectBuilderValidationIssues({
      pendingNodes: [trig(), act("a2")],
      pendingEdges: [{ id: "e", from: "t1", to: "a2" }],
    });
    expect(issues).toHaveLength(0);
  });

  it("flags a stale edge referencing a missing node", () => {
    const issues = collectBuilderValidationIssues({
      pendingNodes: [trig(), act("a1")],
      pendingEdges: [
        { id: "e1", from: "t1", to: "a1" },
        { id: "e-stale", from: "a1", to: "ghost" },
      ],
    });
    const s = issues.find((i) => i.code === "stale_edge");
    expect(s).toBeDefined();
    expect(s?.id).toBe("stale_edge:e-stale");
  });

  it("flags multiple triggers", () => {
    const issues = collectBuilderValidationIssues({
      pendingNodes: [
        makeNode({ id: "t1", kind: "trigger", type: "slack:message" }),
        makeNode({ id: "t2", kind: "trigger", type: "slack:message" }),
      ],
      pendingEdges: NO_EDGES,
    });
    expect(issues.some((i) => i.code === "multiple_triggers")).toBe(true);
  });

  it("suppresses unreachable for an unconfigured (type empty) node — one signal per node", () => {
    const issues = collectBuilderValidationIssues({
      pendingNodes: [
        makeNode({ id: "t1", kind: "trigger", type: "slack:message" }),
        makeNode({ id: "a1", kind: "action", type: "" }),
      ],
      pendingEdges: NO_EDGES,
    });
    expect(
      issues.some((i) => i.code === "unconfigured_node" && i.nodeId === "a1"),
    ).toBe(true);
    expect(
      issues.some((i) => i.code === "unreachable_node" && i.nodeId === "a1"),
    ).toBe(false);
  });
});

describe("countBuilderValidationIssues", () => {
  it("counts errors and warnings separately", () => {
    const counts = countBuilderValidationIssues([
      {
        id: "x",
        code: "no_trigger",
        severity: "error",
        message: "x",
      },
      {
        id: "y",
        code: "router_routes_invalid",
        severity: "error",
        message: "y",
      },
    ]);
    expect(counts).toEqual({ errorCount: 2, warningCount: 0, totalCount: 2 });
  });

  it("returns zeroes for an empty issue list", () => {
    expect(countBuilderValidationIssues([])).toEqual({
      errorCount: 0,
      warningCount: 0,
      totalCount: 0,
    });
  });
});

describe("collectBuilderValidationIssues — missing_required_field (BUILDER-READINESS)", () => {
  it("flags HTTP Request missing Method (not ready)", () => {
    const issues = collectBuilderValidationIssues({
      pendingNodes: [httpNode({ url: "https://x.test" })],
      pendingEdges: NO_EDGES,
      requiredFieldsByType: HTTP_REQUIRED,
    });
    const m = issues.find(
      (i) => i.code === "missing_required_field" && i.fieldName === "method",
    );
    expect(m).toBeDefined();
    expect(m?.severity).toBe("error");
    expect(m?.nodeId).toBe("h1");
    expect(m?.message).toBe("HTTP Request needs a Method.");
  });

  it("flags HTTP Request missing URL (not ready)", () => {
    const issues = collectBuilderValidationIssues({
      pendingNodes: [httpNode({ method: "GET" })],
      pendingEdges: NO_EDGES,
      requiredFieldsByType: HTTP_REQUIRED,
    });
    const m = issues.find(
      (i) => i.code === "missing_required_field" && i.fieldName === "url",
    );
    expect(m?.message).toBe("HTTP Request needs a URL.");
  });

  it("flags BOTH when method and url are empty", () => {
    const issues = collectBuilderValidationIssues({
      pendingNodes: [httpNode({})],
      pendingEdges: NO_EDGES,
      requiredFieldsByType: HTTP_REQUIRED,
    });
    const missing = issues.filter((i) => i.code === "missing_required_field");
    expect(missing.map((i) => i.fieldName).sort()).toEqual(["method", "url"]);
  });

  it("is READY when method + url are filled (no missing_required_field)", () => {
    const issues = collectBuilderValidationIssues({
      pendingNodes: [httpNode({ method: "POST", url: "https://x.test" })],
      pendingEdges: NO_EDGES,
      requiredFieldsByType: HTTP_REQUIRED,
    });
    expect(issues.some((i) => i.code === "missing_required_field")).toBe(false);
  });

  it("emits NO required-field issues when no lookup is supplied (back-compat)", () => {
    const issues = collectBuilderValidationIssues({
      pendingNodes: [httpNode({})],
      pendingEdges: NO_EDGES,
    });
    expect(issues.some((i) => i.code === "missing_required_field")).toBe(false);
  });

  it("treats undefined / null / empty-string / empty-array as missing; 0 and false as present", () => {
    expect(isRequiredValueMissing(undefined)).toBe(true);
    expect(isRequiredValueMissing(null)).toBe(true);
    expect(isRequiredValueMissing("")).toBe(true);
    expect(isRequiredValueMissing("   ")).toBe(true);
    expect(isRequiredValueMissing([])).toBe(true);
    expect(isRequiredValueMissing(0)).toBe(false);
    expect(isRequiredValueMissing(false)).toBe(false);
    expect(isRequiredValueMissing("GET")).toBe(false);
  });

  it("missingRequiredFields helper agrees with the collector (single source)", () => {
    expect(missingRequiredFields(httpNode({ method: "GET" }), HTTP_REQUIRED)).toEqual([
      { name: "url", label: "URL" },
    ]);
    expect(
      missingRequiredFields(httpNode({ method: "GET", url: "https://x.test" }), HTTP_REQUIRED),
    ).toEqual([]);
  });

  it("does not double-validate the native router (its routes have a dedicated check)", () => {
    const routerLookup: RequiredFieldsByType = {
      "native:router": { displayName: "Router", requiredFields: [{ name: "routes", label: "Routes" }] },
    };
    const issues = collectBuilderValidationIssues({
      pendingNodes: [
        {
          id: "r1",
          kind: "action",
          provider: "native",
          type: "native:router",
          config: {},
          position: { x: 0, y: 0 },
        },
      ],
      pendingEdges: NO_EDGES,
      requiredFieldsByType: routerLookup,
    });
    // router_routes_invalid (the dedicated validator) — NOT missing_required_field.
    expect(issues.some((i) => i.code === "missing_required_field")).toBe(false);
    expect(issues.some((i) => i.code === "router_routes_invalid")).toBe(true);
  });
});
