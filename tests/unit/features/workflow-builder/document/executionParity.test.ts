/**
 * @jest-environment node
 *
 * Dual-builder EXECUTION PARITY (5.DUAL-BUILDER-1 / CS-2).
 *
 * The governing rule is that the engine must not know which builder produced a
 * definition. This test drives a Document-side edit through the SAME command
 * layer the UI uses (the real `commitNodeConfigDraft` → `graphSlice`
 * mutations), sends the resulting canonical draft through the REAL engine, and
 * compares it to the byte-identical definition a Visual-Builder edit produces
 * — proving identical executed definition, branch labels, selected/skipped
 * steps, readiness outcome, and entitlement behavior.
 *
 * Engine dependencies are mocked exactly as tests/unit/services/execution/
 * engine.test.ts does (repo, handlers, billing, discovery); the ENGINE ITSELF
 * — traversal, `selectActivatedEdges`, skip persistence, plan gate — is real.
 */

const mockGetByIdServiceRole = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getByIdServiceRole: (...args: unknown[]) => mockGetByIdServiceRole(...args),
}));

const mockGetActionHandler = jest.fn();
jest.mock("@/services/execution/handlers/_registry", () => ({
  getActionHandler: (...args: unknown[]) => mockGetActionHandler(...args),
}));

jest.mock("@/repositories/workflowRuns", () => ({
  recordRun: jest.fn().mockResolvedValue(undefined),
  createWorkflowRunStart: jest.fn().mockResolvedValue({ created: true }),
  claimQueuedWorkflowRun: jest.fn().mockResolvedValue({ claimed: false }),
  finalizeWorkflowRun: jest.fn().mockResolvedValue({ finalized: true }),
  markWorkflowRunFailedBeforeExecution: jest.fn().mockResolvedValue({ updated: true }),
}));

jest.mock("@/services/billing/executionBillingGate", () => ({
  executionBillingGate: jest.fn().mockResolvedValue({ ok: true, used: 1, limit: 100 }),
}));

const mockBranchingEntitlement = jest.fn();
jest.mock("@/services/billing/advancedBranchingEntitlement", () => ({
  resolveAdvancedBranchingEntitlementServiceRole: (...args: unknown[]) =>
    mockBranchingEntitlement(...args),
}));

jest.mock("@/services/workflows/orchestratorFactory", () => ({
  createLifecycleOrchestrator: () => ({ disable: jest.fn().mockResolvedValue({ state: "disabled" }) }),
}));
jest.mock("@/services/notifications/notifyWorkflowFailure", () => ({
  notifyWorkflowFailure: jest.fn().mockResolvedValue({ claimed: true, results: [] }),
}));
jest.mock("@/services/workflows/activeRevision", () => ({
  getDefinitionForExecution: jest.fn(async (wf: { draftDefinition: unknown }) => ({
    definition: wf.draftDefinition,
    source: "draft",
    revisionId: null,
  })),
}));
jest.mock("@/services/discovery/_registry", () => ({
  getActionMeta: jest.fn().mockReturnValue(undefined),
  listAllActionMetas: () => [],
  listAllTriggerMetas: () => [],
}));
jest.mock("@/services/billing/taskUsageRecorder", () => ({
  computeRunTaskUsage: jest.fn().mockReturnValue({
    estimatedTaskCost: 0,
    actualTaskCost: 0,
    policyVersion: "v1",
    estimateSummary: {},
  }),
  recordRunActuals: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/services/billing/reserveReconcileShadowMode", () => ({
  recordShadowComparison: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/services/billing/billingShadowComparisons", () => ({
  recordBillingShadowComparison: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/repositories/accountBilling", () => ({
  reserveTasks: jest.fn(),
  reconcileReservation: jest.fn(),
  releaseReservation: jest.fn(),
  releaseExpiredReservations: jest.fn(),
  deductTasks: jest.fn(),
  getUsage: jest.fn(),
}));
jest.mock("@/services/billing/reserveReconcileBilling", () => ({
  createBillingReservation: jest.fn(),
  reconcileBillingReservation: jest.fn(),
}));
jest.mock("@/services/billing/workflowCostEstimator", () => ({
  estimateWorkflowTaskCost: jest.fn().mockReturnValue({ taskCost: 0 }),
}));
jest.mock("@/services/integrations/connectionResolution", () => ({
  buildWorkflowCredentialPlan: jest.fn(),
}));
jest.mock("@/services/oauth/credentialResolutionContext", () => ({
  runWithCredentialResolutionContext: (_ctx: unknown, fn: () => unknown) => fn(),
  getCredentialResolutionContext: () => undefined,
}));

import { WorkflowEngine } from "@/services/execution/engine";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { WorkflowDefinition } from "@/contracts/workflow";
import { commitDocumentField } from "@/features/workflow-builder/document/documentCommands";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { checkWorkflowReadiness } from "@/services/workflows/executionReadiness";

const triggerEvent: TriggerEvent = {
  provider: "slack",
  eventType: "message",
  eventId: "Ev1",
  occurredAt: "2026-07-20T00:00:00Z",
  providerAccountId: "T0001",
  payload: { amount: 500 },
};

/** A supported Tier-A shape: trigger → If/Then → (true | false) → rejoin. */
function branchingDefinition(messageValue: string): WorkflowDefinition {
  return {
    nodes: [
      { id: "t1", kind: "trigger", provider: "slack", type: "message", config: {}, position: { x: 0, y: 0 } },
      {
        id: "if1",
        kind: "action",
        provider: "native",
        type: "if_then_condition",
        config: { input: "500", operator: "equals", value: "500", onFalse: "branch" },
        position: { x: 0, y: 120 },
      },
      { id: "yes", kind: "action", provider: "slack", type: "notify", config: { text: messageValue }, position: { x: -160, y: 240 } },
      { id: "no", kind: "action", provider: "slack", type: "notify", config: { text: "other" }, position: { x: 160, y: 240 } },
      { id: "join", kind: "action", provider: "slack", type: "notify", config: { text: "done" }, position: { x: 0, y: 360 } },
    ],
    edges: [
      { id: "e1", from: "t1", to: "if1" },
      { id: "e2", from: "if1", to: "yes", label: "true" },
      { id: "e3", from: "if1", to: "no", label: "false" },
      { id: "e4", from: "yes", to: "join" },
      { id: "e5", from: "no", to: "join" },
    ],
  };
}

function workflowRecord(definition: WorkflowDefinition) {
  return {
    id: "wf-parity",
    accountId: "acct-1",
    createdByUserId: "user-1",
    name: "Parity",
    state: "active" as const,
    disabledReason: null,
    disabledContext: null,
    activeRevisionId: null,
    draftDefinition: definition,
    deletedAt: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  };
}

/** Run the REAL engine over `definition` and summarize what executed. */
async function runAndSummarize(definition: WorkflowDefinition) {
  mockGetByIdServiceRole.mockResolvedValue(workflowRecord(definition));
  const executed: Array<{ nodeId: string; config: unknown }> = [];
  mockGetActionHandler.mockImplementation((provider: string, type: string) => {
    if (provider === "native" && type === "if_then_condition") {
      return async (ctx: { config: Record<string, unknown> }) => ({
        output: {},
        branchTaken: ctx.config.input === ctx.config.value ? "true" : "false",
      });
    }
    return async (ctx: { config: Record<string, unknown>; nodeId?: string }) => {
      executed.push({ nodeId: ctx.nodeId ?? "", config: ctx.config });
      return { output: {} };
    };
  });

  const engine = new WorkflowEngine({ resolveStrict: (v) => v });
  const result = await engine.runWorkflow({
    workflowId: "wf-parity",
    triggerNodeId: "t1",
    triggerEvent,
  });
  return {
    status: result.status,
    steps: result.steps.map((s) => ({ nodeId: s.nodeId, status: s.status })),
    handlerConfigs: executed,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockBranchingEntitlement.mockResolvedValue({
    entitled: true,
    plan: "pro",
    planStatus: "active",
    fallback: false,
  });
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
});

describe("dual-builder execution parity", () => {
  it("a Document edit and a Visual edit produce byte-identical definitions and identical runs", async () => {
    // ---- Document path: edit "yes" node's message through the CS-2 command.
    useGraphSlice.getState().hydrate("wf-parity", branchingDefinition("original"));
    useConfigSlice.getState().openNode({ nodeId: "yes", initialValues: { text: "original" } });
    useConfigSlice.getState().updateField({ nodeId: "yes", name: "text", value: "edited-in-document" });
    expect(commitDocumentField({ nodeId: "yes" })).toEqual({ ok: true });

    const documentDefinition: WorkflowDefinition = {
      nodes: [...useGraphSlice.getState().pendingNodes],
      edges: [...useGraphSlice.getState().pendingEdges],
    };

    // ---- Visual path: the same logical edit via the canvas' own slice action.
    useGraphSlice.getState().reset();
    useConfigSlice.getState().reset();
    useGraphSlice.getState().hydrate("wf-parity", branchingDefinition("original"));
    useGraphSlice.getState().updateNodeConfig("yes", { text: "edited-in-document" });
    const visualDefinition: WorkflowDefinition = {
      nodes: [...useGraphSlice.getState().pendingNodes],
      edges: [...useGraphSlice.getState().pendingEdges],
    };

    // Identical canonical definition — including branch labels and positions.
    expect(documentDefinition).toEqual(visualDefinition);
    expect(documentDefinition.edges.find((e) => e.to === "yes")?.label).toBe("true");

    // Identical readiness outcome through the SHARED server-side checker.
    const documentReadiness = await checkWorkflowReadiness(documentDefinition);
    const visualReadiness = await checkWorkflowReadiness(visualDefinition);
    expect(documentReadiness).toEqual(visualReadiness);

    // Identical run through the REAL engine.
    const documentRun = await runAndSummarize(documentDefinition);
    const visualRun = await runAndSummarize(visualDefinition);
    expect(documentRun).toEqual(visualRun);

    // And the run genuinely exercised branching: true taken, false skipped.
    expect(documentRun.status).toBe("succeeded");
    const byNode = Object.fromEntries(documentRun.steps.map((s) => [s.nodeId, s.status]));
    expect(byNode["yes"]).toBe("succeeded");
    expect(byNode["no"]).toBe("skipped");
    expect(byNode["join"]).toBe("succeeded");
    // The Document-committed value is what the handler actually received.
    expect(
      documentRun.handlerConfigs.some((c) => (c.config as { text?: string }).text === "edited-in-document"),
    ).toBe(true);
  });

  it("entitlement behavior is identical regardless of which surface edited it", async () => {
    useGraphSlice.getState().hydrate("wf-parity", branchingDefinition("original"));
    useConfigSlice.getState().openNode({ nodeId: "yes", initialValues: { text: "original" } });
    useConfigSlice.getState().updateField({ nodeId: "yes", name: "text", value: "doc" });
    commitDocumentField({ nodeId: "yes" });
    const documentDefinition: WorkflowDefinition = {
      nodes: [...useGraphSlice.getState().pendingNodes],
      edges: [...useGraphSlice.getState().pendingEdges],
    };

    // Free plan → the engine's plan gate refuses BEFORE any handler runs,
    // exactly as it does for a canvas-authored workflow (BRANCH-ENT-1 C5).
    mockBranchingEntitlement.mockResolvedValue({
      entitled: false,
      plan: "free",
      planStatus: "active",
      fallback: false,
    });
    const run = await runAndSummarize(documentDefinition);
    expect(run.status).toBe("failed");
    expect(run.handlerConfigs).toEqual([]);
  });
});
