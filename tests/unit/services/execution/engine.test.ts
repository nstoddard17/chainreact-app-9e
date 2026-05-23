/**
 * @jest-environment node
 *
 * Tests for services/execution/engine.ts.
 *
 * The engine is built with dependency-injected resolveStrict + a hand-
 * maintained handler registry. Tests:
 *   - Mock workflowsRepo.getByIdServiceRole to seed the workflow.
 *   - Mock the handler registry to inject test handlers.
 *   - Inject a stub resolveStrict so this slice can ship before 1K.1's
 *     resolver lands.
 */

const mockGetByIdServiceRole = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getByIdServiceRole: (...args: unknown[]) => mockGetByIdServiceRole(...args),
}));

const mockGetActionHandler = jest.fn();
jest.mock("@/services/execution/handlers/_registry", () => ({
  getActionHandler: (...args: unknown[]) => mockGetActionHandler(...args),
}));

const mockRecordRun = jest.fn();
jest.mock("@/repositories/workflowRuns", () => ({
  recordRun: (...args: unknown[]) => mockRecordRun(...args),
}));

const mockBillingGate = jest.fn();
jest.mock("@/services/billing/executionBillingGate", () => ({
  executionBillingGate: (...args: unknown[]) => mockBillingGate(...args),
}));

const mockNotifyWorkflowFailure = jest.fn();
jest.mock("@/services/notifications/notifyWorkflowFailure", () => ({
  notifyWorkflowFailure: (...args: unknown[]) => mockNotifyWorkflowFailure(...args),
}));

// Slice 3.SEC-2 — the engine's test-mode gate consults `getActionMeta` from
// the discovery registry. Mock it so the SEC-2 engine tests can use
// synthetic action types ("slack:step_one" etc.) without depending on
// whatever real metas happen to live in the registry.
const mockGetActionMeta = jest.fn();
jest.mock("@/services/discovery/_registry", () => ({
  getActionMeta: (...args: unknown[]) => mockGetActionMeta(...args),
}));

import { WorkflowEngine } from "@/services/execution/engine";
import { MissingVariableError } from "@/workflow-engine/variables/resolveValue";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { WorkflowNode, WorkflowEdge } from "@/contracts/workflow";

const triggerEvent: TriggerEvent = {
  provider: "slack",
  eventType: "message",
  eventId: "Ev1",
  occurredAt: "2026-05-07T00:00:00Z",
  accountId: "T0001",
  payload: { text: "hello", channel: "C123" },
};

function trigger(id: string): WorkflowNode {
  return {
    id,
    kind: "trigger",
    provider: "slack",
    type: "message",
    config: {},
    position: { x: 0, y: 0 },
  };
}

function action(id: string, type: string, config: Record<string, unknown> = {}): WorkflowNode {
  return {
    id,
    kind: "action",
    provider: "slack",
    type,
    config,
    position: { x: 0, y: 100 },
  };
}

function edge(id: string, from: string, to: string): WorkflowEdge {
  return { id, from, to };
}

/** Labeled-edge helper for the engine-branching test block. */
function labeledEdge(
  id: string,
  from: string,
  to: string,
  label: string,
): WorkflowEdge {
  return { id, from, to, label };
}

const baseWorkflow = {
  id: "wf-1",
  userId: "user-1",
  name: "Test",
  state: "active" as const,
  disabledReason: null,
  disabledContext: null,
  activeRevisionId: null,
  draftDefinition: { nodes: [trigger("t1")], edges: [] },
  deletedAt: null,
  createdAt: "2026-05-07T00:00:00Z",
  updatedAt: "2026-05-07T00:00:00Z",
};

beforeEach(() => {
  mockGetByIdServiceRole.mockReset();
  mockGetActionHandler.mockReset();
  mockRecordRun.mockReset();
  mockRecordRun.mockResolvedValue(undefined);
  // Default: gate allows. Individual tests override for the refusal path.
  mockBillingGate.mockReset();
  mockBillingGate.mockResolvedValue({ ok: true, used: 1, limit: 100 });
  mockNotifyWorkflowFailure.mockReset();
  mockNotifyWorkflowFailure.mockResolvedValue({ claimed: true, results: [] });
  // SEC-2: default the meta lookup to "not registered" so the gate fails
  // closed unless a test explicitly registers a meta for its action type.
  // Test-mode tests must seed their own meta resolutions; non-test-mode
  // tests don't consult the gate at all so the default never matters.
  mockGetActionMeta.mockReset();
  mockGetActionMeta.mockReturnValue(undefined);
});

// Slice 3.SEC-2 — helper for the test-mode test block. Builds a minimally-
// valid synthetic ActionMeta keyed on `${provider}:${type}`. Tests pass
// the risk-related overrides; everything else defaults to safe values.
function makeMetaResolver(
  metas: ReadonlyArray<{
    provider: string;
    type: string;
    riskLevel?: "low" | "medium" | "high";
    isDestructive?: boolean;
    requiresConfirmation?: boolean;
    requiresIntegration?: boolean;
  }>,
): (key: string) => unknown {
  const byKey = new Map<string, unknown>(
    metas.map((m) => [
      `${m.provider}:${m.type}`,
      {
        key: `${m.provider}:${m.type}`,
        provider: m.provider,
        type: m.type,
        displayName: m.type,
        description: m.type,
        category: "other",
        requiresIntegration: m.requiresIntegration ?? false,
        fields: [],
        outputs: [],
        producesFileRef: false,
        consumesFileRef: false,
        displayOrder: null,
        isDestructive: m.isDestructive ?? false,
        requiresConfirmation: m.requiresConfirmation ?? false,
        riskLevel: m.riskLevel ?? "low",
      },
    ]),
  );
  return (key: string) => byKey.get(key);
}

describe("WorkflowEngine — fatal errors", () => {
  it("returns WORKFLOW_NOT_FOUND when getByIdServiceRole returns null", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce(null);
    const engine = new WorkflowEngine({ resolveStrict: (v) => v });
    const result = await engine.runWorkflow({
      workflowId: "missing",
      triggerNodeId: "t1",
      triggerEvent,
    });
    expect(result.status).toBe("failed");
    expect(result.fatalError?.code).toBe("WORKFLOW_NOT_FOUND");
    expect(result.steps).toEqual([]);
  });

  it("returns TRIGGER_NODE_NOT_FOUND when the dispatched node id is not in the definition", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce(baseWorkflow);
    const engine = new WorkflowEngine({ resolveStrict: (v) => v });
    const result = await engine.runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "ghost",
      triggerEvent,
    });
    expect(result.fatalError?.code).toBe("TRIGGER_NODE_NOT_FOUND");
  });
});

describe("WorkflowEngine — happy path (linear chain)", () => {
  it("executes trigger → action1 → action2 in BFS order, threading outputs through variables", async () => {
    const t = trigger("t1");
    const a1 = action("a1", "step_one");
    const a2 = action("a2", "step_two");
    const definition = {
      nodes: [t, a1, a2],
      edges: [edge("e1", "t1", "a1"), edge("e2", "a1", "a2")],
    };
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: definition,
    });

    const handlerOne = jest.fn(async () => ({ output: { messageId: "m1" } }));
    const handlerTwo = jest.fn(async () => ({ output: { messageId: "m2" } }));
    mockGetActionHandler.mockImplementation((p: string, t: string) => {
      if (p === "slack" && t === "step_one") return handlerOne;
      if (p === "slack" && t === "step_two") return handlerTwo;
      return undefined;
    });

    const resolveStrict = jest.fn((v: unknown, _ctx?: unknown) => v);
    const engine = new WorkflowEngine({ resolveStrict });
    const result = await engine.runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
    });

    expect(result.status).toBe("succeeded");
    expect(result.steps.map((s) => s.nodeId)).toEqual(["t1", "a1", "a2"]);
    expect(handlerOne).toHaveBeenCalledTimes(1);
    expect(handlerTwo).toHaveBeenCalledTimes(1);

    // Variable propagation: when a2's resolveStrict ran, the context
    // should have included a1's output. Verify via the call args.
    const a2Call = resolveStrict.mock.calls.find(
      (c) => (c[0] as Record<string, unknown>) === a2.config,
    );
    expect(a2Call).toBeDefined();
    const a2Context = a2Call![1] as { variables: Record<string, unknown> };
    expect(a2Context.variables.a1).toEqual({ messageId: "m1" });
    expect(a2Context.variables.trigger).toBe(triggerEvent);
  });

  it("exposes the trigger event under both 'trigger' and the trigger node's id", async () => {
    const t = trigger("custom_trigger");
    const a1 = action("a1", "noop");
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: { nodes: [t, a1], edges: [edge("e1", "custom_trigger", "a1")] },
    });
    mockGetActionHandler.mockReturnValueOnce(async () => ({ output: {} }));

    const resolveStrict = jest.fn((v: unknown, _ctx?: unknown) => v);
    await new WorkflowEngine({ resolveStrict }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "custom_trigger",
      triggerEvent,
    });

    const ctx = resolveStrict.mock.calls[0]![1] as { variables: Record<string, unknown> };
    expect(ctx.variables.trigger).toBe(triggerEvent);
    expect(ctx.variables.custom_trigger).toBe(triggerEvent);
  });
});

describe("WorkflowEngine — failure modes (rule §Engine pre-resolution)", () => {
  it("MissingVariableError aborts the run with a MISSING_VARIABLE step + path/reason details", async () => {
    const a1 = action("a1", "step_one", { channel: "{{trigger.unknown}}" });
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: {
        nodes: [trigger("t1"), a1],
        edges: [edge("e1", "t1", "a1")],
      },
    });
    const handler = jest.fn();
    mockGetActionHandler.mockReturnValueOnce(handler);

    const resolveStrict = jest.fn(() => {
      throw new MissingVariableError("trigger.unknown", "missing_field");
    });
    const result = await new WorkflowEngine({ resolveStrict }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
    });

    expect(result.status).toBe("failed");
    expect(handler).not.toHaveBeenCalled();
    const failed = result.steps.find((s) => s.status === "failed");
    expect(failed).toMatchObject({
      nodeId: "a1",
      error: {
        code: "MISSING_VARIABLE",
        details: { path: "trigger.unknown", reason: "missing_field" },
      },
    });
  });

  it("MISSING_HANDLER when the registry has no handler for (provider, type)", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: {
        nodes: [trigger("t1"), action("a1", "unknown_action")],
        edges: [edge("e1", "t1", "a1")],
      },
    });
    mockGetActionHandler.mockReturnValueOnce(undefined);

    const result = await new WorkflowEngine({
      resolveStrict: (v) => v,
    }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
    });
    expect(result.status).toBe("failed");
    const failed = result.steps.find((s) => s.status === "failed");
    expect(failed?.error?.code).toBe("MISSING_HANDLER");
  });

  it("HANDLER_FAILED when the handler throws", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: {
        nodes: [trigger("t1"), action("a1", "step_one")],
        edges: [edge("e1", "t1", "a1")],
      },
    });
    mockGetActionHandler.mockReturnValueOnce(async () => {
      throw new Error("Slack rate limited");
    });

    const result = await new WorkflowEngine({
      resolveStrict: (v) => v,
    }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
    });

    expect(result.status).toBe("failed");
    expect(result.steps[1]).toMatchObject({
      status: "failed",
      error: { code: "HANDLER_FAILED", message: "Slack rate limited" },
    });
  });

  it("stops on first failure — downstream steps are not executed", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: {
        nodes: [trigger("t1"), action("a1", "fail"), action("a2", "should_not_run")],
        edges: [edge("e1", "t1", "a1"), edge("e2", "a1", "a2")],
      },
    });
    const failingHandler = jest.fn(async () => {
      throw new Error("boom");
    });
    const downstreamHandler = jest.fn();
    mockGetActionHandler.mockImplementation((_p: string, t: string) =>
      t === "fail" ? failingHandler : downstreamHandler,
    );

    const result = await new WorkflowEngine({
      resolveStrict: (v) => v,
    }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
    });

    expect(result.status).toBe("failed");
    expect(failingHandler).toHaveBeenCalledTimes(1);
    expect(downstreamHandler).not.toHaveBeenCalled();
    expect(result.steps).toHaveLength(2); // trigger + a1; a2 skipped
  });
});

describe("WorkflowEngine — graph traversal", () => {
  it("visited-set prevents infinite loops on cyclic graphs (visits each node once)", async () => {
    // Cycle: t1 → a1 → a2 → a1 (back to a1).
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: {
        nodes: [trigger("t1"), action("a1", "step"), action("a2", "step")],
        edges: [
          edge("e1", "t1", "a1"),
          edge("e2", "a1", "a2"),
          edge("e3", "a2", "a1"),
        ],
      },
    });
    const handler = jest.fn(async () => ({ output: {} }));
    mockGetActionHandler.mockReturnValue(handler);

    const result = await new WorkflowEngine({
      resolveStrict: (v) => v,
    }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
    });
    // Each action visited once despite the back-edge.
    expect(handler).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("succeeded");
  });

  it("manual-only workflow (zero non-trigger nodes) succeeds with one step", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: { nodes: [trigger("t1")], edges: [] },
    });
    const result = await new WorkflowEngine({
      resolveStrict: (v) => v,
    }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
    });
    expect(result.status).toBe("succeeded");
    expect(result.steps).toEqual([
      expect.objectContaining({ nodeId: "t1", status: "succeeded" }),
    ]);
  });
});

describe("WorkflowEngine — run persistence (Slice 1M)", () => {
  it("records a 'succeeded' run row with steps + null error_classification", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: {
        nodes: [trigger("t1"), action("a1", "step")],
        edges: [edge("e1", "t1", "a1")],
      },
    });
    mockGetActionHandler.mockReturnValueOnce(async () => ({ output: { ok: true } }));

    const result = await new WorkflowEngine({ resolveStrict: (v) => v }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
    });

    expect(mockRecordRun).toHaveBeenCalledTimes(1);
    expect(mockRecordRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: result.runId,
        workflowId: "wf-1",
        userId: "user-1",
        status: "succeeded",
        triggerNodeId: "t1",
        triggerEvent,
        errorClassification: null,
        fatalError: null,
      }),
    );
  });

  it("records a 'failed' run with humanized error_classification derived from the first failed step", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: {
        nodes: [trigger("t1"), action("a1", "step", { channel: "{{trigger.unknown}}" })],
        edges: [edge("e1", "t1", "a1")],
      },
    });
    mockGetActionHandler.mockReturnValueOnce(jest.fn());

    const resolveStrict = jest.fn(() => {
      throw new MissingVariableError("trigger.unknown", "missing_field");
    });

    await new WorkflowEngine({ resolveStrict }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
    });

    expect(mockRecordRun).toHaveBeenCalledTimes(1);
    const call = mockRecordRun.mock.calls[0]![0] as {
      status: string;
      errorClassification: { title: string; action?: string; severity: string };
    };
    expect(call.status).toBe("failed");
    expect(call.errorClassification.title).toMatch(/variable/i);
    expect(call.errorClassification.action).toBe("open_node");
  });

  it("records a 'failed' run with classification derived from fatalError when no steps ran", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: { nodes: [trigger("t1")], edges: [] },
    });

    await new WorkflowEngine({ resolveStrict: (v) => v }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "ghost", // not in definition → TRIGGER_NODE_NOT_FOUND
      triggerEvent,
    });

    expect(mockRecordRun).toHaveBeenCalledTimes(1);
    const call = mockRecordRun.mock.calls[0]![0] as {
      status: string;
      fatalError: { code: string };
      errorClassification: { title: string };
    };
    expect(call.fatalError.code).toBe("TRIGGER_NODE_NOT_FOUND");
    expect(call.errorClassification.title).toMatch(/trigger node missing/i);
  });

  it("does NOT record a run when the workflow itself is missing (no userId to attribute)", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce(null);
    await new WorkflowEngine({ resolveStrict: (v) => v }).runWorkflow({
      workflowId: "missing",
      triggerNodeId: "t1",
      triggerEvent,
    });
    expect(mockRecordRun).not.toHaveBeenCalled();
  });

  it("swallows recordRun errors so the engine completes the run regardless", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: { nodes: [trigger("t1")], edges: [] },
    });
    mockRecordRun.mockRejectedValueOnce(new Error("DB write failed"));

    const result = await new WorkflowEngine({ resolveStrict: (v) => v }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
    });

    // Engine still returns a result; recordRun failure logged + swallowed.
    expect(result.status).toBe("succeeded");
  });
});

describe("WorkflowEngine — billing gate (Slice 1N)", () => {
  it("aborts the run with BILLING_EXHAUSTED when the gate refuses, BEFORE invoking any handler", async () => {
    const t = trigger("t1");
    const a1 = action("a1", "step_one");
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: { nodes: [t, a1], edges: [edge("e1", "t1", "a1")] },
    });
    const handler = jest.fn();
    mockGetActionHandler.mockReturnValueOnce(handler);
    mockBillingGate.mockResolvedValueOnce({
      ok: false,
      reason: "limit_reached",
      used: 100,
      limit: 100,
    });

    const result = await new WorkflowEngine({ resolveStrict: (v) => v }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
    });

    expect(result.status).toBe("failed");
    expect(result.fatalError?.code).toBe("BILLING_EXHAUSTED");
    expect(result.fatalError?.message).toMatch(/100\/100/);
    expect(result.steps).toEqual([]);
    expect(handler).not.toHaveBeenCalled();
    expect(mockBillingGate).toHaveBeenCalledWith("user-1");
  });

  it("persists the failed run with humanized BILLING_EXHAUSTED classification (action=upgrade_plan)", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: { nodes: [trigger("t1")], edges: [] },
    });
    mockBillingGate.mockResolvedValueOnce({
      ok: false,
      reason: "limit_reached",
      used: 100,
      limit: 100,
    });

    await new WorkflowEngine({ resolveStrict: (v) => v }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
    });

    expect(mockRecordRun).toHaveBeenCalledTimes(1);
    const call = mockRecordRun.mock.calls[0]![0] as {
      status: string;
      fatalError: { code: string };
      errorClassification: { title: string; action?: string; severity: string };
    };
    expect(call.status).toBe("failed");
    expect(call.fatalError.code).toBe("BILLING_EXHAUSTED");
    expect(call.errorClassification.action).toBe("upgrade_plan");
    expect(call.errorClassification.severity).toBe("warning");
  });

  it("proceeds with the run when the gate returns ok=true", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: {
        nodes: [trigger("t1"), action("a1", "step_one")],
        edges: [edge("e1", "t1", "a1")],
      },
    });
    const handler = jest.fn(async () => ({ output: { ok: true } }));
    mockGetActionHandler.mockReturnValueOnce(handler);
    mockBillingGate.mockResolvedValueOnce({ ok: true, used: 5, limit: 100 });

    const result = await new WorkflowEngine({ resolveStrict: (v) => v }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
    });

    expect(result.status).toBe("succeeded");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does NOT call the gate when the workflow itself is missing (no userId to attribute)", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce(null);
    await new WorkflowEngine({ resolveStrict: (v) => v }).runWorkflow({
      workflowId: "missing",
      triggerNodeId: "t1",
      triggerEvent,
    });
    expect(mockBillingGate).not.toHaveBeenCalled();
  });

  it("does NOT call the gate when the trigger node is missing (structural failure unrelated to quota)", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: { nodes: [trigger("t1")], edges: [] },
    });
    await new WorkflowEngine({ resolveStrict: (v) => v }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "ghost",
      triggerEvent,
    });
    expect(mockBillingGate).not.toHaveBeenCalled();
  });
});

describe("WorkflowEngine — failure notifications (Slice 1)", () => {
  it("inserts a workflow_failed notification on failed runs with humanized title forwarded", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: {
        nodes: [trigger("t1"), action("a1", "step", { channel: "{{trigger.unknown}}" })],
        edges: [edge("e1", "t1", "a1")],
      },
    });
    mockGetActionHandler.mockReturnValueOnce(jest.fn());
    const resolveStrict = jest.fn(() => {
      throw new MissingVariableError("trigger.unknown", "missing_field");
    });

    await new WorkflowEngine({ resolveStrict }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
    });

    expect(mockNotifyWorkflowFailure).toHaveBeenCalledTimes(1);
    const call = mockNotifyWorkflowFailure.mock.calls[0]![0] as {
      userId: string;
      workflowId: string;
      runId: string;
      errorClassification: { title: string; severity: string };
    };
    expect(call.userId).toBe("user-1");
    expect(call.workflowId).toBe("wf-1");
    expect(call.errorClassification.title).toMatch(/variable/i);
    expect(call.errorClassification.severity).toBe("error");
  });

  it("does NOT notify on successful runs (only failure surfaces are notification-worthy in Slice 1)", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: {
        nodes: [trigger("t1"), action("a1", "step")],
        edges: [edge("e1", "t1", "a1")],
      },
    });
    mockGetActionHandler.mockReturnValueOnce(async () => ({ output: { ok: true } }));
    await new WorkflowEngine({ resolveStrict: (v) => v }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
    });
    expect(mockNotifyWorkflowFailure).not.toHaveBeenCalled();
  });

  it("does NOT notify when there is no userId to attribute (workflow missing)", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce(null);
    await new WorkflowEngine({ resolveStrict: (v) => v }).runWorkflow({
      workflowId: "missing",
      triggerNodeId: "t1",
      triggerEvent,
    });
    expect(mockNotifyWorkflowFailure).not.toHaveBeenCalled();
  });

  it("notification failure is swallowed — engine still completes the run", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: { nodes: [trigger("t1")], edges: [] },
    });
    // Trigger-node-not-found → fatal → notification path runs
    mockNotifyWorkflowFailure.mockRejectedValueOnce(new Error("notif DB down"));
    const result = await new WorkflowEngine({ resolveStrict: (v) => v }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "ghost",
      triggerEvent,
    });
    expect(result.fatalError?.code).toBe("TRIGGER_NODE_NOT_FOUND");
    // Engine returned cleanly despite the notification crash.
  });

  it("notifies on BILLING_EXHAUSTED fatal too (gate refusal is still a failed run users should know about)", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: { nodes: [trigger("t1")], edges: [] },
    });
    mockBillingGate.mockResolvedValueOnce({
      ok: false,
      reason: "limit_reached",
      used: 100,
      limit: 100,
    });
    await new WorkflowEngine({ resolveStrict: (v) => v }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
    });
    expect(mockNotifyWorkflowFailure).toHaveBeenCalledTimes(1);
    const call = mockNotifyWorkflowFailure.mock.calls[0]![0] as {
      errorClassification: { action?: string; severity: string };
    };
    expect(call.errorClassification.action).toBe("upgrade_plan");
  });
});

/**
 * Engine-branching Commit 3 — label-aware traversal coverage.
 * See docs/slices/parity/engine-branching-plan.md §8.
 *
 * These tests pair with the pure-helper tests in
 * tests/unit/services/execution/branching.test.ts (which exercise
 * selectActivatedEdges in isolation). The tests below assert end-to-end
 * behavior through runWorkflow: step ordering, handler call counts,
 * variable propagation, run status, and persistence-shaped output.
 */
describe("WorkflowEngine — label-aware branching (Engine Branching Commit 2 logic)", () => {
  it("legacy unlabeled traversal: no branchTaken, no labels — every reachable node runs and outputs thread (regression guard)", async () => {
    // Same shape as the existing happy-path test, asserted under the new
    // engine to lock the backward-compat guarantee.
    const t = trigger("t1");
    const a1 = action("a1", "step_one");
    const a2 = action("a2", "step_two");
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: {
        nodes: [t, a1, a2],
        edges: [edge("e1", "t1", "a1"), edge("e2", "a1", "a2")],
      },
    });
    const h1 = jest.fn(async () => ({ output: { id: "m1" } }));
    const h2 = jest.fn(async () => ({ output: { id: "m2" } }));
    mockGetActionHandler.mockImplementation((_p: string, type: string) =>
      type === "step_one" ? h1 : type === "step_two" ? h2 : undefined,
    );

    const resolveStrict = jest.fn((v: unknown) => v);
    const result = await new WorkflowEngine({ resolveStrict }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
    });
    expect(result.status).toBe("succeeded");
    expect(result.steps.map((s) => `${s.nodeId}:${s.status}`)).toEqual([
      "t1:succeeded",
      "a1:succeeded",
      "a2:succeeded",
    ]);
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  it("branch selected: branchTaken='yes' activates the 'yes' edge and skips the 'no' edge", async () => {
    const t = trigger("t1");
    const router = action("router", "route");
    const yesAction = action("a_yes", "yes_handler");
    const noAction = action("a_no", "no_handler");
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: {
        nodes: [t, router, yesAction, noAction],
        edges: [
          edge("e1", "t1", "router"),
          labeledEdge("e2", "router", "a_yes", "yes"),
          labeledEdge("e3", "router", "a_no", "no"),
        ],
      },
    });

    const routerHandler = jest.fn(async () => ({
      output: { picked: "yes" },
      branchTaken: "yes",
    }));
    const yesHandler = jest.fn(async () => ({ output: { ran: "yes" } }));
    const noHandler = jest.fn(async () => ({ output: { ran: "no" } }));
    mockGetActionHandler.mockImplementation((_p: string, type: string) =>
      type === "route"
        ? routerHandler
        : type === "yes_handler"
          ? yesHandler
          : type === "no_handler"
            ? noHandler
            : undefined,
    );

    const result = await new WorkflowEngine({
      resolveStrict: (v) => v,
    }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
    });

    expect(result.status).toBe("succeeded");
    const statusMap = Object.fromEntries(
      result.steps.map((s) => [s.nodeId, s.status]),
    );
    expect(statusMap).toEqual({
      t1: "succeeded",
      router: "succeeded",
      a_yes: "succeeded",
      a_no: "skipped",
    });
    expect(routerHandler).toHaveBeenCalledTimes(1);
    expect(yesHandler).toHaveBeenCalledTimes(1);
    expect(noHandler).not.toHaveBeenCalled();
  });

  it("alternate branch selected: branchTaken='no' activates the 'no' edge and skips the 'yes' edge", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: {
        nodes: [trigger("t1"), action("router", "route"), action("a_yes", "yes_handler"), action("a_no", "no_handler")],
        edges: [
          edge("e1", "t1", "router"),
          labeledEdge("e2", "router", "a_yes", "yes"),
          labeledEdge("e3", "router", "a_no", "no"),
        ],
      },
    });
    const yesHandler = jest.fn(async () => ({ output: {} }));
    const noHandler = jest.fn(async () => ({ output: {} }));
    mockGetActionHandler.mockImplementation((_p: string, type: string) =>
      type === "route"
        ? async () => ({ output: {}, branchTaken: "no" })
        : type === "yes_handler"
          ? yesHandler
          : type === "no_handler"
            ? noHandler
            : undefined,
    );

    const result = await new WorkflowEngine({
      resolveStrict: (v) => v,
    }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
    });

    expect(result.status).toBe("succeeded");
    expect(yesHandler).not.toHaveBeenCalled();
    expect(noHandler).toHaveBeenCalledTimes(1);
    const statusMap = Object.fromEntries(
      result.steps.map((s) => [s.nodeId, s.status]),
    );
    expect(statusMap["a_no"]).toBe("succeeded");
    expect(statusMap["a_yes"]).toBe("skipped");
  });

  it("branchTaken: null — labeled edges skipped, unlabeled still activates (post-branch always-run)", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: {
        nodes: [
          trigger("t1"),
          action("router", "route"),
          action("a_yes", "yes_handler"),
          action("a_no", "no_handler"),
          action("cleanup", "cleanup_handler"),
        ],
        edges: [
          edge("e1", "t1", "router"),
          labeledEdge("e2", "router", "a_yes", "yes"),
          labeledEdge("e3", "router", "a_no", "no"),
          edge("e4", "router", "cleanup"), // unlabeled — must still run
        ],
      },
    });
    const yesHandler = jest.fn();
    const noHandler = jest.fn();
    const cleanupHandler = jest.fn(async () => ({ output: { cleaned: true } }));
    mockGetActionHandler.mockImplementation((_p: string, type: string) =>
      type === "route"
        ? async () => ({ output: {}, branchTaken: null })
        : type === "yes_handler"
          ? yesHandler
          : type === "no_handler"
            ? noHandler
            : type === "cleanup_handler"
              ? cleanupHandler
              : undefined,
    );

    const result = await new WorkflowEngine({
      resolveStrict: (v) => v,
    }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
    });

    expect(result.status).toBe("succeeded");
    expect(yesHandler).not.toHaveBeenCalled();
    expect(noHandler).not.toHaveBeenCalled();
    expect(cleanupHandler).toHaveBeenCalledTimes(1);
    const statusMap = Object.fromEntries(
      result.steps.map((s) => [s.nodeId, s.status]),
    );
    expect(statusMap).toEqual({
      t1: "succeeded",
      router: "succeeded",
      a_yes: "skipped",
      a_no: "skipped",
      cleanup: "succeeded",
    });
  });

  it("branchTaken: undefined — labeled edges skipped (§6.2.a permissive); unlabeled still runs; no failure", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: {
        nodes: [
          trigger("t1"),
          action("hub", "hub_handler"),
          action("labeled", "labeled_handler"),
          action("plain", "plain_handler"),
        ],
        edges: [
          edge("e1", "t1", "hub"),
          labeledEdge("e2", "hub", "labeled", "X"),
          edge("e3", "hub", "plain"),
        ],
      },
    });
    const labeledHandler = jest.fn();
    const plainHandler = jest.fn(async () => ({ output: {} }));
    // hub_handler returns NO branchTaken — the legacy/provider shape.
    mockGetActionHandler.mockImplementation((_p: string, type: string) =>
      type === "hub_handler"
        ? async () => ({ output: { ran: true } })
        : type === "labeled_handler"
          ? labeledHandler
          : type === "plain_handler"
            ? plainHandler
            : undefined,
    );

    const result = await new WorkflowEngine({
      resolveStrict: (v) => v,
    }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
    });

    expect(result.status).toBe("succeeded");
    expect(labeledHandler).not.toHaveBeenCalled();
    expect(plainHandler).toHaveBeenCalledTimes(1);
    const statusMap = Object.fromEntries(
      result.steps.map((s) => [s.nodeId, s.status]),
    );
    expect(statusMap["labeled"]).toBe("skipped");
    expect(statusMap["plain"]).toBe("succeeded");
  });

  it("INVALID_BRANCH: branchTaken string with no matching outgoing label fails the node and halts the run", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: {
        nodes: [
          trigger("t1"),
          action("router", "route"),
          action("a_yes", "yes_handler"),
          action("downstream", "downstream_handler"),
        ],
        edges: [
          edge("e1", "t1", "router"),
          labeledEdge("e2", "router", "a_yes", "yes"),
          edge("e3", "a_yes", "downstream"),
        ],
      },
    });
    const yesHandler = jest.fn();
    const downstreamHandler = jest.fn();
    mockGetActionHandler.mockImplementation((_p: string, type: string) =>
      type === "route"
        ? async () => ({ output: { tried: "missing-label" }, branchTaken: "missing-label" })
        : type === "yes_handler"
          ? yesHandler
          : type === "downstream_handler"
            ? downstreamHandler
            : undefined,
    );

    const result = await new WorkflowEngine({
      resolveStrict: (v) => v,
    }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
    });

    expect(result.status).toBe("failed");
    expect(yesHandler).not.toHaveBeenCalled();
    expect(downstreamHandler).not.toHaveBeenCalled();
    const failedStep = result.steps.find((s) => s.nodeId === "router");
    expect(failedStep?.status).toBe("failed");
    expect(failedStep?.error?.code).toBe("INVALID_BRANCH");
    expect(failedStep?.error?.message).toContain("missing-label");
    expect(failedStep?.error?.details).toEqual({ branchTaken: "missing-label" });
  });

  it("INVALID_BRANCH persists the failed run with a humanized 'Branch label not found' classification (action=open_node)", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: {
        nodes: [
          trigger("t1"),
          action("router", "route"),
          action("a_yes", "yes_handler"),
        ],
        edges: [
          edge("e1", "t1", "router"),
          labeledEdge("e2", "router", "a_yes", "yes"),
        ],
      },
    });
    mockGetActionHandler.mockImplementation((_p: string, type: string) =>
      type === "route"
        ? async () => ({ output: {}, branchTaken: "maybe" })
        : type === "yes_handler"
          ? jest.fn()
          : undefined,
    );

    await new WorkflowEngine({ resolveStrict: (v) => v }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
    });

    expect(mockRecordRun).toHaveBeenCalledTimes(1);
    const call = mockRecordRun.mock.calls[0]![0] as {
      status: string;
      errorClassification: { title: string; action?: string; severity: string };
    };
    expect(call.status).toBe("failed");
    expect(call.errorClassification.title).toMatch(/branch label/i);
    expect(call.errorClassification.action).toBe("open_node");
    expect(call.errorClassification.severity).toBe("error");
    expect(mockNotifyWorkflowFailure).toHaveBeenCalledTimes(1);
  });

  it("OR-merge: a node with two incoming edges (one activated, one skipped) executes via the activated one", async () => {
    // Topology: t1 → router → (label='left' → A → M, label='right' → B → M)
    // router picks 'left'; A runs, B skipped, M still runs (activated via A's
    // unlabeled outgoing edge).
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: {
        nodes: [
          trigger("t1"),
          action("router", "route"),
          action("A", "a_handler"),
          action("B", "b_handler"),
          action("M", "merge_handler"),
        ],
        edges: [
          edge("e1", "t1", "router"),
          labeledEdge("e2", "router", "A", "left"),
          labeledEdge("e3", "router", "B", "right"),
          edge("e4", "A", "M"),
          edge("e5", "B", "M"),
        ],
      },
    });
    const aHandler = jest.fn(async () => ({ output: { which: "A" } }));
    const bHandler = jest.fn();
    const mergeHandler = jest.fn(async () => ({ output: { merged: true } }));
    mockGetActionHandler.mockImplementation((_p: string, type: string) =>
      type === "route"
        ? async () => ({ output: {}, branchTaken: "left" })
        : type === "a_handler"
          ? aHandler
          : type === "b_handler"
            ? bHandler
            : type === "merge_handler"
              ? mergeHandler
              : undefined,
    );

    const result = await new WorkflowEngine({
      resolveStrict: (v) => v,
    }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
    });

    expect(result.status).toBe("succeeded");
    expect(aHandler).toHaveBeenCalledTimes(1);
    expect(bHandler).not.toHaveBeenCalled();
    expect(mergeHandler).toHaveBeenCalledTimes(1);
    const statusMap = Object.fromEntries(
      result.steps.map((s) => [s.nodeId, s.status]),
    );
    expect(statusMap).toEqual({
      t1: "succeeded",
      router: "succeeded",
      A: "succeeded",
      B: "skipped",
      M: "succeeded",
    });
  });

  it("skipped-node variable reference: downstream config that references a skipped node surfaces MISSING_VARIABLE", async () => {
    // Topology: t1 → router → (label='taken' → A → C, label='not-taken' → B).
    // C.config references {{B.field}}; B is skipped because branchTaken='taken',
    // so the resolver throws MissingVariableError when running C.
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: {
        nodes: [
          trigger("t1"),
          action("router", "route"),
          action("A", "a_handler"),
          action("B", "b_handler"),
          action("C", "c_handler", { needsB: "{{B.field}}" }),
        ],
        edges: [
          edge("e1", "t1", "router"),
          labeledEdge("e2", "router", "A", "taken"),
          labeledEdge("e3", "router", "B", "not-taken"),
          edge("e4", "A", "C"),
        ],
      },
    });
    const aHandler = jest.fn(async () => ({ output: { ok: true } }));
    const bHandler = jest.fn();
    const cHandler = jest.fn();
    mockGetActionHandler.mockImplementation((_p: string, type: string) =>
      type === "route"
        ? async () => ({ output: {}, branchTaken: "taken" })
        : type === "a_handler"
          ? aHandler
          : type === "b_handler"
            ? bHandler
            : type === "c_handler"
              ? cHandler
              : undefined,
    );

    const resolveStrict = jest.fn((value: unknown, ctx: unknown) => {
      const variables = (ctx as { variables: Record<string, unknown> }).variables;
      // Crude template substitution: only the C node references {{B.field}}.
      if (
        value &&
        typeof value === "object" &&
        "needsB" in (value as Record<string, unknown>)
      ) {
        if (!("B" in variables)) {
          throw new MissingVariableError("B.field", "missing_node");
        }
      }
      return value;
    });

    const result = await new WorkflowEngine({ resolveStrict }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
    });

    expect(result.status).toBe("failed");
    expect(bHandler).not.toHaveBeenCalled();
    expect(cHandler).not.toHaveBeenCalled();
    const failedStep = result.steps.find((s) => s.nodeId === "C");
    expect(failedStep?.status).toBe("failed");
    expect(failedStep?.error?.code).toBe("MISSING_VARIABLE");
    expect(failedStep?.error?.details).toEqual({
      path: "B.field",
      reason: "missing_node",
    });
  });

  it("mixed labeled/unlabeled outgoing: unlabeled always runs, only the matched labeled path runs", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: {
        nodes: [
          trigger("t1"),
          action("router", "route"),
          action("path1", "path1_handler"),
          action("path2", "path2_handler"),
          action("always", "always_handler"),
        ],
        edges: [
          edge("e1", "t1", "router"),
          labeledEdge("e2", "router", "path1", "p1"),
          labeledEdge("e3", "router", "path2", "p2"),
          edge("e4", "router", "always"),
        ],
      },
    });
    const path1 = jest.fn(async () => ({ output: {} }));
    const path2 = jest.fn();
    const always = jest.fn(async () => ({ output: {} }));
    mockGetActionHandler.mockImplementation((_p: string, type: string) =>
      type === "route"
        ? async () => ({ output: {}, branchTaken: "p1" })
        : type === "path1_handler"
          ? path1
          : type === "path2_handler"
            ? path2
            : type === "always_handler"
              ? always
              : undefined,
    );
    const result = await new WorkflowEngine({
      resolveStrict: (v) => v,
    }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
    });
    expect(result.status).toBe("succeeded");
    expect(path1).toHaveBeenCalledTimes(1);
    expect(path2).not.toHaveBeenCalled();
    expect(always).toHaveBeenCalledTimes(1);
  });

  it("fan-out: same selected label activates multiple edges to different targets — all matching targets run", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: {
        nodes: [
          trigger("t1"),
          action("router", "route"),
          action("A", "a_handler"),
          action("B", "b_handler"),
          action("C", "c_handler"),
        ],
        edges: [
          edge("e1", "t1", "router"),
          labeledEdge("e2", "router", "A", "match"),
          labeledEdge("e3", "router", "B", "match"),
          labeledEdge("e4", "router", "C", "other"),
        ],
      },
    });
    const aHandler = jest.fn(async () => ({ output: {} }));
    const bHandler = jest.fn(async () => ({ output: {} }));
    const cHandler = jest.fn();
    mockGetActionHandler.mockImplementation((_p: string, type: string) =>
      type === "route"
        ? async () => ({ output: {}, branchTaken: "match" })
        : type === "a_handler"
          ? aHandler
          : type === "b_handler"
            ? bHandler
            : type === "c_handler"
              ? cHandler
              : undefined,
    );
    const result = await new WorkflowEngine({
      resolveStrict: (v) => v,
    }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
    });
    expect(result.status).toBe("succeeded");
    expect(aHandler).toHaveBeenCalledTimes(1);
    expect(bHandler).toHaveBeenCalledTimes(1);
    expect(cHandler).not.toHaveBeenCalled();
  });

  it("cycle: visited-set still bounds traversal even with labeled edges (no infinite loop, each node ≤ 1 invocation)", async () => {
    // Cycle: t1 → a1 (unlabeled) → a2 (labeled='go') → a1 (labeled='back').
    // a2 returns branchTaken='back' to walk the cycle; visited-set on
    // bfsExecutionOrder prevents a1 from appearing twice in `order`.
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: {
        nodes: [trigger("t1"), action("a1", "step"), action("a2", "loop")],
        edges: [
          edge("e1", "t1", "a1"),
          labeledEdge("e2", "a1", "a2", "go"),
          labeledEdge("e3", "a2", "a1", "back"),
        ],
      },
    });
    const a1Handler = jest.fn(async () => ({
      output: {},
      branchTaken: "go",
    }));
    const a2Handler = jest.fn(async () => ({
      output: {},
      branchTaken: "back",
    }));
    mockGetActionHandler.mockImplementation((_p: string, type: string) =>
      type === "step" ? a1Handler : type === "loop" ? a2Handler : undefined,
    );
    const result = await new WorkflowEngine({
      resolveStrict: (v) => v,
    }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
    });
    // Each non-trigger node visited at most once despite the back-edge.
    expect(a1Handler).toHaveBeenCalledTimes(1);
    expect(a2Handler).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("succeeded");
  });

  it("trigger branching: unlabeled trigger out-edges activate; labeled trigger out-edges do NOT activate (trigger emits no branchTaken)", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: {
        nodes: [
          trigger("t1"),
          action("unlabeled_child", "u_handler"),
          action("labeled_child", "l_handler"),
        ],
        edges: [
          edge("e1", "t1", "unlabeled_child"),
          labeledEdge("e2", "t1", "labeled_child", "yes"),
        ],
      },
    });
    const uHandler = jest.fn(async () => ({ output: {} }));
    const lHandler = jest.fn();
    mockGetActionHandler.mockImplementation((_p: string, type: string) =>
      type === "u_handler" ? uHandler : type === "l_handler" ? lHandler : undefined,
    );
    const result = await new WorkflowEngine({
      resolveStrict: (v) => v,
    }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
    });
    expect(result.status).toBe("succeeded");
    expect(uHandler).toHaveBeenCalledTimes(1);
    expect(lHandler).not.toHaveBeenCalled();
    const statusMap = Object.fromEntries(
      result.steps.map((s) => [s.nodeId, s.status]),
    );
    expect(statusMap["unlabeled_child"]).toBe("succeeded");
    expect(statusMap["labeled_child"]).toBe("skipped");
  });

  it("skipped nodes do not pass the resolver — resolveStrict is never called for them", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: {
        nodes: [
          trigger("t1"),
          action("router", "route"),
          action("skipped", "skipped_handler", { ref: "{{router.never_set}}" }),
        ],
        edges: [
          edge("e1", "t1", "router"),
          labeledEdge("e2", "router", "skipped", "no"),
        ],
      },
    });
    const skippedHandler = jest.fn();
    mockGetActionHandler.mockImplementation((_p: string, type: string) =>
      type === "route"
        ? async () => ({ output: {}, branchTaken: null })
        : type === "skipped_handler"
          ? skippedHandler
          : undefined,
    );
    const resolveStrict = jest.fn((v: unknown) => v);
    const result = await new WorkflowEngine({ resolveStrict }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
    });

    expect(result.status).toBe("succeeded");
    expect(skippedHandler).not.toHaveBeenCalled();
    // resolveStrict should have been called for `router` (the only executing
    // action), NEVER with the `skipped` node's config.
    const calledWithSkippedConfig = resolveStrict.mock.calls.some((c) => {
      const arg = c[0] as Record<string, unknown> | undefined;
      return (
        arg !== null &&
        typeof arg === "object" &&
        arg !== undefined &&
        "ref" in arg
      );
    });
    expect(calledWithSkippedConfig).toBe(false);
  });
});

// ─── Slice 3.SEC-2 — engine test-mode gate ──────────────────────────────────
//
// Verifies the engine consults the testModeGate BEFORE invoking handlers
// when `testMode: true` is supplied, and lets real runs (testMode omitted
// or false) execute handlers as before. The gate decision itself is unit-
// tested in `testModeGate.test.ts` — these tests verify the engine wiring.
describe("WorkflowEngine — test mode (Slice 3.SEC-2)", () => {
  it("does NOT invoke a destructive Stripe handler in test mode (create_refund)", async () => {
    mockGetActionMeta.mockImplementation(
      makeMetaResolver([
        {
          provider: "stripe",
          type: "create_refund",
          requiresIntegration: true,
          isDestructive: true,
          requiresConfirmation: true,
          riskLevel: "high",
        },
      ]),
    );

    const t = trigger("t1");
    const refundNode: WorkflowNode = {
      id: "refund",
      kind: "action",
      provider: "stripe",
      type: "create_refund",
      config: { chargeId: "ch_1" },
      position: { x: 0, y: 100 },
    };
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: { nodes: [t, refundNode], edges: [edge("e1", "t1", "refund")] },
    });

    const handler = jest.fn();
    mockGetActionHandler.mockReturnValue(handler);

    const result = await new WorkflowEngine({ resolveStrict: (v) => v }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
      testMode: true,
      triggeredBy: "test",
    });

    expect(handler).not.toHaveBeenCalled();
    expect(result.status).toBe("succeeded");
    expect(result.isTest).toBe(true);
    expect(result.triggeredBy).toBe("test");
    const refundStep = result.steps.find((s) => s.nodeId === "refund");
    expect(refundStep?.status).toBe("succeeded");
    expect(refundStep?.output).toEqual({
      testMode: true,
      actionSkipped: true,
      reason: "TEST_MODE_DESTRUCTIVE_BLOCKED",
      provider: "stripe",
      type: "create_refund",
    });
  });

  it("blocks a high-risk non-destructive Stripe action in test mode (create_payment_intent — safety regression)", async () => {
    // This is the explicit guard from the user's spec: even though
    // create_payment_intent is NOT marked isDestructive, it must still be
    // blocked in test mode because riskLevel is "high".
    mockGetActionMeta.mockImplementation(
      makeMetaResolver([
        {
          provider: "stripe",
          type: "create_payment_intent",
          requiresIntegration: true,
          isDestructive: false,
          requiresConfirmation: false,
          riskLevel: "high",
        },
      ]),
    );

    const t = trigger("t1");
    const piNode: WorkflowNode = {
      id: "pi",
      kind: "action",
      provider: "stripe",
      type: "create_payment_intent",
      config: { amount: 100, currency: "usd" },
      position: { x: 0, y: 100 },
    };
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: { nodes: [t, piNode], edges: [edge("e1", "t1", "pi")] },
    });

    const handler = jest.fn();
    mockGetActionHandler.mockReturnValue(handler);

    const result = await new WorkflowEngine({ resolveStrict: (v) => v }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
      testMode: true,
    });

    expect(handler).not.toHaveBeenCalled();
    const piStep = result.steps.find((s) => s.nodeId === "pi");
    expect(piStep?.output).toMatchObject({
      reason: "TEST_MODE_HIGH_RISK_BLOCKED",
      provider: "stripe",
      type: "create_payment_intent",
    });
  });

  it("blocks native:http_request in test mode (egress sink)", async () => {
    mockGetActionMeta.mockImplementation(
      makeMetaResolver([
        {
          provider: "native",
          type: "http_request",
          requiresIntegration: false,
          riskLevel: "high",
        },
      ]),
    );

    const t = trigger("t1");
    const httpNode: WorkflowNode = {
      id: "http",
      kind: "action",
      provider: "native",
      type: "http_request",
      config: { url: "https://attacker.example" },
      position: { x: 0, y: 100 },
    };
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: { nodes: [t, httpNode], edges: [edge("e1", "t1", "http")] },
    });

    const handler = jest.fn();
    mockGetActionHandler.mockReturnValue(handler);

    const result = await new WorkflowEngine({ resolveStrict: (v) => v }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
      testMode: true,
    });

    expect(handler).not.toHaveBeenCalled();
    expect(result.steps.find((s) => s.nodeId === "http")?.output).toMatchObject({
      reason: "TEST_MODE_HIGH_RISK_BLOCKED",
    });
  });

  it("allows native:format_transformer to execute in test mode (pure transform)", async () => {
    mockGetActionMeta.mockImplementation(
      makeMetaResolver([
        {
          provider: "native",
          type: "format_transformer",
          requiresIntegration: false,
          riskLevel: "low",
        },
      ]),
    );

    const t = trigger("t1");
    const transformNode: WorkflowNode = {
      id: "fmt",
      kind: "action",
      provider: "native",
      type: "format_transformer",
      config: {},
      position: { x: 0, y: 100 },
    };
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: { nodes: [t, transformNode], edges: [edge("e1", "t1", "fmt")] },
    });

    const transformHandler = jest.fn(async () => ({ output: { formatted: "ok" } }));
    mockGetActionHandler.mockReturnValue(transformHandler);

    const result = await new WorkflowEngine({ resolveStrict: (v) => v }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
      testMode: true,
    });

    expect(transformHandler).toHaveBeenCalledTimes(1);
    // Handler should see testMode: true threaded into its input.
    const handlerInput = transformHandler.mock.calls[0] as unknown as [
      Record<string, unknown>,
    ];
    expect(handlerInput[0]).toMatchObject({ testMode: true });
    expect(result.steps.find((s) => s.nodeId === "fmt")?.output).toEqual({
      formatted: "ok",
    });
  });

  it("allows native:if_then_condition and native:router in test mode", async () => {
    mockGetActionMeta.mockImplementation(
      makeMetaResolver([
        { provider: "native", type: "if_then_condition", riskLevel: "low" },
        { provider: "native", type: "router", riskLevel: "low" },
      ]),
    );

    const t = trigger("t1");
    const ifNode: WorkflowNode = {
      id: "if",
      kind: "action",
      provider: "native",
      type: "if_then_condition",
      config: {},
      position: { x: 0, y: 100 },
    };
    const routerNode: WorkflowNode = {
      id: "router",
      kind: "action",
      provider: "native",
      type: "router",
      config: {},
      position: { x: 0, y: 200 },
    };
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: {
        nodes: [t, ifNode, routerNode],
        edges: [edge("e1", "t1", "if"), edge("e2", "if", "router")],
      },
    });

    const ifHandler = jest.fn(async () => ({ output: { matched: true } }));
    const routerHandler = jest.fn(async () => ({ output: { routed: "a" } }));
    mockGetActionHandler.mockImplementation((p: string, t: string) => {
      if (p === "native" && t === "if_then_condition") return ifHandler;
      if (p === "native" && t === "router") return routerHandler;
      return undefined;
    });

    await new WorkflowEngine({ resolveStrict: (v) => v }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
      testMode: true,
    });

    expect(ifHandler).toHaveBeenCalledTimes(1);
    expect(routerHandler).toHaveBeenCalledTimes(1);
  });

  it("FAIL-CLOSED: blocks an action with no registered meta in test mode", async () => {
    // No metas seeded — the default mockGetActionMeta returns undefined,
    // and the gate's fail-closed branch fires.
    const t = trigger("t1");
    const ghost: WorkflowNode = {
      id: "ghost",
      kind: "action",
      provider: "unknown_provider",
      type: "unknown_type",
      config: {},
      position: { x: 0, y: 100 },
    };
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: { nodes: [t, ghost], edges: [edge("e1", "t1", "ghost")] },
    });

    const handler = jest.fn();
    mockGetActionHandler.mockReturnValue(handler);

    const result = await new WorkflowEngine({ resolveStrict: (v) => v }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
      testMode: true,
    });

    expect(handler).not.toHaveBeenCalled();
    expect(result.steps.find((s) => s.nodeId === "ghost")?.output).toMatchObject({
      reason: "TEST_MODE_UNKNOWN_ACTION_BLOCKED",
    });
  });

  it("real mode (testMode omitted) invokes the handler for high-risk actions", async () => {
    // Real runs ignore the gate entirely — even Stripe refunds execute.
    // mockGetActionMeta would never be called; default return is harmless.
    const t = trigger("t1");
    const refundNode: WorkflowNode = {
      id: "refund",
      kind: "action",
      provider: "stripe",
      type: "create_refund",
      config: { chargeId: "ch_1" },
      position: { x: 0, y: 100 },
    };
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: { nodes: [t, refundNode], edges: [edge("e1", "t1", "refund")] },
    });

    const handler = jest.fn(async () => ({ output: { refundId: "re_1" } }));
    mockGetActionHandler.mockReturnValue(handler);

    const result = await new WorkflowEngine({ resolveStrict: (v) => v }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
      triggeredBy: "manual",
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.isTest).toBe(false);
    expect(result.triggeredBy).toBe("manual");
    expect(result.steps.find((s) => s.nodeId === "refund")?.output).toEqual({
      refundId: "re_1",
    });
  });

  it("explicit testMode: false also runs handlers (does not silently promote)", async () => {
    // Defensive check: passing testMode: false is identical to omitting it.
    const t = trigger("t1");
    const refundNode: WorkflowNode = {
      id: "refund",
      kind: "action",
      provider: "stripe",
      type: "create_refund",
      config: { chargeId: "ch_1" },
      position: { x: 0, y: 100 },
    };
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: { nodes: [t, refundNode], edges: [edge("e1", "t1", "refund")] },
    });

    const handler = jest.fn(async () => ({ output: { refundId: "re_1" } }));
    mockGetActionHandler.mockReturnValue(handler);

    await new WorkflowEngine({ resolveStrict: (v) => v }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
      testMode: false,
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("persists is_test=true and triggered_by='test' on a test run", async () => {
    mockGetActionMeta.mockImplementation(
      makeMetaResolver([
        { provider: "native", type: "format_transformer", riskLevel: "low" },
      ]),
    );

    const t = trigger("t1");
    const node: WorkflowNode = {
      id: "fmt",
      kind: "action",
      provider: "native",
      type: "format_transformer",
      config: {},
      position: { x: 0, y: 100 },
    };
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: { nodes: [t, node], edges: [edge("e1", "t1", "fmt")] },
    });
    mockGetActionHandler.mockReturnValue(async () => ({ output: {} }));

    await new WorkflowEngine({ resolveStrict: (v) => v }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
      testMode: true,
      triggeredBy: "test",
    });

    expect(mockRecordRun).toHaveBeenCalledTimes(1);
    expect(mockRecordRun.mock.calls[0]![0]).toMatchObject({
      isTest: true,
      triggeredBy: "test",
    });
  });

  it("persists is_test=false and triggered_by='manual' on a real run", async () => {
    const t = trigger("t1");
    const node: WorkflowNode = {
      id: "fmt",
      kind: "action",
      provider: "native",
      type: "format_transformer",
      config: {},
      position: { x: 0, y: 100 },
    };
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: { nodes: [t, node], edges: [edge("e1", "t1", "fmt")] },
    });
    mockGetActionHandler.mockReturnValue(async () => ({ output: {} }));

    await new WorkflowEngine({ resolveStrict: (v) => v }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
      triggeredBy: "manual",
    });

    expect(mockRecordRun).toHaveBeenCalledTimes(1);
    expect(mockRecordRun.mock.calls[0]![0]).toMatchObject({
      isTest: false,
      triggeredBy: "manual",
    });
  });

  it("persists triggered_by='unknown' when caller omits the field", async () => {
    const t = trigger("t1");
    const node: WorkflowNode = {
      id: "fmt",
      kind: "action",
      provider: "native",
      type: "format_transformer",
      config: {},
      position: { x: 0, y: 100 },
    };
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: { nodes: [t, node], edges: [edge("e1", "t1", "fmt")] },
    });
    mockGetActionHandler.mockReturnValue(async () => ({ output: {} }));

    await new WorkflowEngine({ resolveStrict: (v) => v }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
    });

    expect(mockRecordRun.mock.calls[0]![0]).toMatchObject({
      triggeredBy: "unknown",
    });
  });

  it("downstream node sees the test-mode mock output as its upstream variable", async () => {
    // Verifies the engine threads `variables[blockedNodeId] = mockOutput`
    // so downstream resolution doesn't crash with MISSING_VARIABLE for
    // `{{blockedNode.testMode}}` references.
    mockGetActionMeta.mockImplementation(
      makeMetaResolver([
        {
          provider: "stripe",
          type: "create_refund",
          requiresIntegration: true,
          isDestructive: true,
          requiresConfirmation: true,
          riskLevel: "high",
        },
        { provider: "native", type: "format_transformer", riskLevel: "low" },
      ]),
    );

    const t = trigger("t1");
    const refund: WorkflowNode = {
      id: "refund",
      kind: "action",
      provider: "stripe",
      type: "create_refund",
      config: {},
      position: { x: 0, y: 100 },
    };
    const fmt: WorkflowNode = {
      id: "fmt",
      kind: "action",
      provider: "native",
      type: "format_transformer",
      config: { template: "{{refund.testMode}}" },
      position: { x: 0, y: 200 },
    };
    mockGetByIdServiceRole.mockResolvedValueOnce({
      ...baseWorkflow,
      draftDefinition: {
        nodes: [t, refund, fmt],
        edges: [edge("e1", "t1", "refund"), edge("e2", "refund", "fmt")],
      },
    });

    // The refund handler is REGISTERED (so the MISSING_HANDLER path
    // doesn't pre-empt the gate) but the gate must short-circuit before
    // it gets invoked — verified via the `not.toHaveBeenCalled` assertion.
    const refundHandler = jest.fn(async () => ({ output: { refundId: "should-not-fire" } }));
    const fmtHandler = jest.fn(async () => ({ output: { done: true } }));
    mockGetActionHandler.mockImplementation((p: string, type: string) => {
      if (p === "stripe" && type === "create_refund") return refundHandler;
      if (p === "native" && type === "format_transformer") return fmtHandler;
      return undefined;
    });

    const resolveStrict = jest.fn((v: unknown, _ctx?: unknown) => v);
    await new WorkflowEngine({ resolveStrict }).runWorkflow({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      triggerEvent,
      testMode: true,
    });

    expect(refundHandler).not.toHaveBeenCalled();

    // The fmt node's resolveStrict call must have seen the mock refund
    // output in its variables context.
    const fmtCall = resolveStrict.mock.calls.find(
      (c) => (c[0] as Record<string, unknown>) === fmt.config,
    );
    expect(fmtCall).toBeDefined();
    const ctx = fmtCall![1] as { variables: Record<string, unknown> };
    expect(ctx.variables.refund).toMatchObject({
      testMode: true,
      actionSkipped: true,
      provider: "stripe",
      type: "create_refund",
    });
  });
});
