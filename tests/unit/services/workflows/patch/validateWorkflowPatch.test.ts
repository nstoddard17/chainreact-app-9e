/**
 * @jest-environment node
 *
 * Tests for the deterministic WorkflowPatch validator (Slice 4.AI-3).
 * Runs against the REAL discovery registry + COST-2 estimator, so every key
 * is genuinely registered. A deductTasks mock proves no billing side effect.
 */

const mockDeductTasks = jest.fn();
jest.mock("@/repositories/accountBilling", () => ({
  deductTasks: (...a: unknown[]) => mockDeductTasks(...a),
  getUsage: jest.fn(),
}));

import type { WorkflowDefinition, WorkflowNode } from "@/contracts/workflowDefinition";
import { validateWorkflowPatch } from "@/services/workflows/patch/validateWorkflowPatch";
import type {
  PatchOperation,
  WorkflowPatch,
} from "@/services/workflows/patch/types";

beforeEach(() => mockDeductTasks.mockReset());

function node(id: string, kind: "trigger" | "action", provider: string, type: string, config: Record<string, unknown> = {}): WorkflowNode {
  return { id, kind, provider, type, config, position: { x: 0, y: 0 } };
}

function patch(operations: PatchOperation[], extra: Partial<WorkflowPatch> = {}): WorkflowPatch {
  return {
    patchId: "p1",
    workflowId: "wf1",
    baseRevision: "rev-1",
    operations,
    summary: "s",
    rationale: "r",
    ...extra,
  };
}

const trig = node("t", "trigger", "gmail", "new_email");
const baseDef: WorkflowDefinition = {
  nodes: [trig, node("a1", "action", "gmail", "send_email", { to: "x@y.com" })],
  edges: [{ id: "e1", from: "t", to: "a1" }],
};

describe("validateWorkflowPatch — envelope / operations", () => {
  it("a well-formed low-risk patch validates ok", () => {
    const res = validateWorkflowPatch(
      patch([{ op: "moveNode", nodeId: "a1", position: { x: 1, y: 2 } }]),
      baseDef,
    );
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
    expect(res.candidateDefinition).toBeDefined();
  });

  it("rejects an unknown operation as UNSUPPORTED_OPERATION", () => {
    const bad = patch([{ op: "teleportNode", nodeId: "a1" } as unknown as PatchOperation]);
    const res = validateWorkflowPatch(bad, baseDef);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.code === "UNSUPPORTED_OPERATION")).toBe(true);
  });

  it("rejects an empty baseRevision (BASE_REVISION_MISSING)", () => {
    const res = validateWorkflowPatch(
      patch([{ op: "moveNode", nodeId: "a1", position: { x: 1, y: 1 } }], { baseRevision: "" }),
      baseDef,
    );
    expect(res.errors.some((e) => e.code === "BASE_REVISION_MISSING")).toBe(true);
  });

  it("rejects a stale base revision (PATCH_CONFLICT)", () => {
    const res = validateWorkflowPatch(
      patch([{ op: "moveNode", nodeId: "a1", position: { x: 1, y: 1 } }], { baseRevision: "old" }),
      baseDef,
      { currentRevision: "new" },
    );
    expect(res.errors.some((e) => e.code === "PATCH_CONFLICT")).toBe(true);
  });

  it("does not mutate the input definition", () => {
    const snapshot = JSON.stringify(baseDef);
    validateWorkflowPatch(patch([{ op: "removeNode", nodeId: "a1" }]), baseDef);
    expect(JSON.stringify(baseDef)).toBe(snapshot);
  });

  it("an op referencing a missing node yields UNKNOWN_NODE and no candidate", () => {
    const res = validateWorkflowPatch(patch([{ op: "moveNode", nodeId: "ghost", position: { x: 0, y: 0 } }]), baseDef);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.code === "UNKNOWN_NODE")).toBe(true);
    expect(res.candidateDefinition).toBeUndefined();
  });
});

describe("validateWorkflowPatch — registry grounding", () => {
  it("accepts a known provider action", () => {
    const res = validateWorkflowPatch(
      patch([
        { op: "addNode", node: node("a2", "action", "slack", "send_channel_message", { channel: "C1", text: "hi" }) },
        { op: "addEdge", edge: { id: "e2", from: "a1", to: "a2" } },
      ]),
      baseDef,
    );
    expect(res.errors.some((e) => e.code === "UNKNOWN_ACTION")).toBe(false);
  });

  it("rejects an unknown provider/action (UNKNOWN_ACTION)", () => {
    const res = validateWorkflowPatch(
      patch([{ op: "addNode", node: node("a2", "action", "acme", "do_thing") }]),
      baseDef,
    );
    expect(res.errors.some((e) => e.code === "UNKNOWN_ACTION")).toBe(true);
  });

  it("rejects an unknown trigger (UNKNOWN_TRIGGER)", () => {
    const res = validateWorkflowPatch(
      patch([{ op: "replaceTrigger", node: node("t2", "trigger", "acme", "on_thing") }]),
      baseDef,
    );
    expect(res.errors.some((e) => e.code === "UNKNOWN_TRIGGER")).toBe(true);
  });

  it("validates a registered native node", () => {
    const res = validateWorkflowPatch(
      patch([
        { op: "addNode", node: node("h", "action", "native", "http_request", { url: "https://x", method: "GET" }) },
        { op: "addEdge", edge: { id: "e2", from: "a1", to: "h" } },
      ]),
      baseDef,
    );
    expect(res.errors.some((e) => e.code === "UNKNOWN_ACTION")).toBe(false);
  });
});

describe("validateWorkflowPatch — config validation (FieldMeta-guided)", () => {
  it("rejects a missing required field (MISSING_REQUIRED_FIELD)", () => {
    // gmail:send_email requires `to`; omit it.
    const res = validateWorkflowPatch(
      patch([{ op: "addNode", node: node("a2", "action", "gmail", "send_email", { subject: "Hi" }) }]),
      baseDef,
    );
    expect(res.errors.some((e) => e.code === "MISSING_REQUIRED_FIELD" && e.path === "to")).toBe(true);
  });

  it("rejects a wrong-typed field (INVALID_CONFIG)", () => {
    // native:http_request `method` is a select (string); give it a number.
    const res = validateWorkflowPatch(
      patch([{ op: "addNode", node: node("h", "action", "native", "http_request", { url: "https://x", method: 42 }) }]),
      baseDef,
    );
    expect(res.errors.some((e) => e.code === "INVALID_CONFIG" && e.path === "method")).toBe(true);
  });

  it("accepts a valid config", () => {
    const res = validateWorkflowPatch(
      patch([{ op: "updateNodeConfig", nodeId: "a1", config: { to: "ok@y.com", subject: "Hi" } }]),
      baseDef,
    );
    expect(res.errors.some((e) => e.code === "INVALID_CONFIG" || e.code === "MISSING_REQUIRED_FIELD")).toBe(false);
  });

  it("flags an undeclared field as a WARNING, not a hard error", () => {
    const res = validateWorkflowPatch(
      patch([{ op: "updateNodeConfig", nodeId: "a1", config: { to: "ok@y.com", inventedField: "x" } }]),
      baseDef,
    );
    expect(res.warnings.some((w) => w.code === "UNKNOWN_CONFIG_FIELD")).toBe(true);
    expect(res.errors.some((e) => e.code === "INVALID_CONFIG")).toBe(false);
  });
});

describe("validateWorkflowPatch — variable references", () => {
  it("accepts an upstream reference to a real output path", () => {
    const res = validateWorkflowPatch(
      patch([{ op: "updateNodeConfig", nodeId: "a1", config: { to: "ok@y.com", subject: "{{trigger.from}}" } }]),
      baseDef,
    );
    expect(res.errors.some((e) => e.code.includes("VARIABLE") || e.code === "MISSING_OUTPUT_PATH")).toBe(false);
  });

  it("rejects a reference to a missing node (INVALID_VARIABLE_REFERENCE)", () => {
    const res = validateWorkflowPatch(
      patch([{ op: "updateNodeConfig", nodeId: "a1", config: { to: "ok@y.com", subject: "{{ghost.value}}" } }]),
      baseDef,
    );
    expect(res.errors.some((e) => e.code === "INVALID_VARIABLE_REFERENCE")).toBe(true);
  });

  it("rejects a downstream reference (DOWNSTREAM_VARIABLE_REFERENCE)", () => {
    // a1 references a2, but a2 is downstream of a1 (a1 → a2).
    const def: WorkflowDefinition = {
      nodes: [trig, node("a1", "action", "gmail", "send_email", { to: "x@y.com" }), node("a2", "action", "gmail", "create_draft", {})],
      edges: [{ id: "e1", from: "t", to: "a1" }, { id: "e2", from: "a1", to: "a2" }],
    };
    const res = validateWorkflowPatch(
      patch([{ op: "updateNodeConfig", nodeId: "a1", config: { to: "ok@y.com", subject: "{{a2.id}}" } }]),
      def,
    );
    expect(res.errors.some((e) => e.code === "DOWNSTREAM_VARIABLE_REFERENCE")).toBe(true);
  });

  it("rejects a missing output path (MISSING_OUTPUT_PATH)", () => {
    const res = validateWorkflowPatch(
      patch([{ op: "updateNodeConfig", nodeId: "a1", config: { to: "ok@y.com", subject: "{{trigger.bogusField}}" } }]),
      baseDef,
    );
    expect(res.errors.some((e) => e.code === "MISSING_OUTPUT_PATH")).toBe(true);
  });

  it("does NOT treat AI_FIELD as a missing variable", () => {
    const res = validateWorkflowPatch(
      patch([{ op: "updateNodeConfig", nodeId: "a1", config: { to: "ok@y.com", subject: "{{AI_FIELD:subject}}" } }]),
      baseDef,
    );
    expect(res.errors.some((e) => e.code.includes("VARIABLE") || e.code === "MISSING_OUTPUT_PATH")).toBe(false);
  });

  it("rejects a malformed reference token", () => {
    const res = validateWorkflowPatch(
      patch([{ op: "updateNodeConfig", nodeId: "a1", config: { to: "ok@y.com", subject: "{{.broken}}" } }]),
      baseDef,
    );
    expect(res.errors.some((e) => e.code === "INVALID_VARIABLE_REFERENCE")).toBe(true);
  });
});

describe("validateWorkflowPatch — structural / edges / triggers", () => {
  it("rejects an edge to a missing node (INVALID_EDGE)", () => {
    const res = validateWorkflowPatch(
      patch([{ op: "addEdge", edge: { id: "e9", from: "a1", to: "ghost" } }]),
      baseDef,
    );
    expect(res.errors.some((e) => e.code === "INVALID_EDGE")).toBe(true);
  });

  it("rejects a duplicate node id (DUPLICATE_NODE_ID)", () => {
    const res = validateWorkflowPatch(
      patch([{ op: "addNode", node: node("a1", "action", "gmail", "create_draft", {}) }]),
      baseDef,
    );
    expect(res.errors.some((e) => e.code === "DUPLICATE_NODE_ID")).toBe(true);
  });

  it("rejects a duplicate edge id (DUPLICATE_EDGE_ID)", () => {
    const res = validateWorkflowPatch(
      patch([{ op: "addNode", node: node("a2", "action", "slack", "send_channel_message", { channel: "C", text: "t" }) }, { op: "addEdge", edge: { id: "e1", from: "a1", to: "a2" } }]),
      baseDef,
    );
    expect(res.errors.some((e) => e.code === "DUPLICATE_EDGE_ID")).toBe(true);
  });

  it("rejects more than one trigger (MULTIPLE_TRIGGERS)", () => {
    const res = validateWorkflowPatch(
      patch([{ op: "addNode", node: node("t2", "trigger", "native", "manual.run") }]),
      baseDef,
    );
    expect(res.errors.some((e) => e.code === "MULTIPLE_TRIGGERS")).toBe(true);
  });

  it("replaceTrigger preserves the one-trigger rule", () => {
    const res = validateWorkflowPatch(
      patch([{ op: "replaceTrigger", node: node("t2", "trigger", "native", "manual.run") }]),
      baseDef,
    );
    expect(res.errors.some((e) => e.code === "MULTIPLE_TRIGGERS")).toBe(false);
    expect(res.candidateDefinition!.nodes.filter((n) => n.kind === "trigger")).toHaveLength(1);
  });
});

describe("validateWorkflowPatch — deterministic risk", () => {
  it("adding a destructive action requires confirmation + high risk", () => {
    const res = validateWorkflowPatch(
      patch([
        { op: "addNode", node: node("r", "action", "stripe", "create_refund", { chargeId: "ch_1" }) },
        { op: "addEdge", edge: { id: "e2", from: "a1", to: "r" } },
      ]),
      baseDef,
    );
    expect(res.riskLevel).toBe("high");
    expect(res.requiresConfirmation).toBe(true);
    expect(res.riskReasons.some((r) => r.code === "destructive_action" || r.code === "confirmation_required_action")).toBe(true);
  });

  it("removing a node with downstream surfaces risk + confirmation", () => {
    const def: WorkflowDefinition = {
      nodes: [trig, node("a1", "action", "gmail", "send_email", { to: "x" }), node("a2", "action", "gmail", "create_draft", {})],
      edges: [{ id: "e1", from: "t", to: "a1" }, { id: "e2", from: "a1", to: "a2" }],
    };
    const res = validateWorkflowPatch(patch([{ op: "removeNode", nodeId: "a1" }]), def);
    expect(res.warnings.some((w) => w.code === "DELETES_USER_WORK")).toBe(true);
    expect(res.requiresConfirmation).toBe(true);
    expect(["medium", "high"]).toContain(res.riskLevel);
  });

  it("a low-risk layout patch does not require confirmation", () => {
    const res = validateWorkflowPatch(
      patch([{ op: "moveNode", nodeId: "a1", position: { x: 5, y: 5 } }]),
      baseDef,
    );
    expect(res.requiresConfirmation).toBe(false);
    expect(res.riskLevel).toBe("low");
  });

  it("model-provided low risk CANNOT downgrade deterministic high risk", () => {
    const res = validateWorkflowPatch(
      patch(
        [{ op: "addNode", node: node("r", "action", "stripe", "create_refund", { chargeId: "ch_1" }) }],
        { riskLevel: "low", requiresConfirmation: false },
      ),
      baseDef,
    );
    expect(res.riskLevel).toBe("high");
    expect(res.requiresConfirmation).toBe(true);
  });
});

describe("validateWorkflowPatch — task-cost estimate (COST-2)", () => {
  it("includes the estimator output", () => {
    const res = validateWorkflowPatch(
      patch([{ op: "moveNode", nodeId: "a1", position: { x: 1, y: 1 } }]),
      baseDef,
    );
    expect(res.taskCostEstimate).toBeDefined();
    expect(res.taskCostEstimate!.policyVersion).toBeTruthy();
  });

  it("adding 3 provider actions estimates 3 tasks/run", () => {
    const empty: WorkflowDefinition = { nodes: [node("t", "trigger", "native", "manual.run")], edges: [] };
    const res = validateWorkflowPatch(
      patch([
        { op: "addNode", node: node("a1", "action", "gmail", "send_email", { to: "x@y.com" }) },
        { op: "addNode", node: node("a2", "action", "gmail", "create_draft", {}) },
        { op: "addNode", node: node("a3", "action", "slack", "send_channel_message", { channel: "C", text: "t" }) },
      ]),
      empty,
    );
    expect(res.taskCostEstimate!.estimatedTasksPerRun).toBe(3);
  });

  it("adding native control-flow does not increase estimated cost", () => {
    const res = validateWorkflowPatch(
      patch([{ op: "addNode", node: node("r", "action", "native", "router", { routes: [] }) }, { op: "addEdge", edge: { id: "e2", from: "a1", to: "r" } }]),
      baseDef,
    );
    // baseDef already has 1 billable action (a1) → still 1.
    expect(res.taskCostEstimate!.estimatedTasksPerRun).toBe(1);
  });

  it("adding native:http_request increases estimated cost", () => {
    const res = validateWorkflowPatch(
      patch([{ op: "addNode", node: node("h", "action", "native", "http_request", { url: "https://x", method: "GET" }) }, { op: "addEdge", edge: { id: "e2", from: "a1", to: "h" } }]),
      baseDef,
    );
    expect(res.taskCostEstimate!.estimatedTasksPerRun).toBe(2); // a1 + http_request
  });

  it("performs no billing deduction", () => {
    validateWorkflowPatch(patch([{ op: "moveNode", nodeId: "a1", position: { x: 0, y: 0 } }]), baseDef);
    expect(mockDeductTasks).not.toHaveBeenCalled();
  });
});

describe("validateWorkflowPatch — no secret leakage", () => {
  it("never echoes secrets / raw config values into errors or warnings", () => {
    const secrets = {
      accessToken: "ACCESS-aaa",
      refreshToken: "REFRESH-bbb",
      apiSecret: "APISECRET-ccc",
      clientSecret: "CLIENTSECRET-ddd",
      webhookSecret: "WEBHOOKSECRET-eee",
      botToken: "BOTTOKEN-fff",
      Authorization: "Bearer SECRET-ggg",
    };
    const res = validateWorkflowPatch(
      patch([
        // Unknown action + secret-laden config → forces errors + warnings.
        { op: "addNode", node: node("x", "action", "acme", "do_thing", { ...secrets, subject: "{{ghost.value}}" }) },
      ]),
      baseDef,
    );
    const serialized = JSON.stringify({ errors: res.errors, warnings: res.warnings, previewSummary: res.previewSummary });
    for (const v of Object.values(secrets)) {
      expect(serialized).not.toContain(v);
    }
  });
});
