/**
 * @jest-environment node
 *
 * Branch-lane insertion — EXECUTION PARITY (5.DUAL-BUILDER-1 / CS-2B).
 *
 * A Document lane insertion must change exactly one thing at runtime: the
 * inserted step now runs at the start of that lane. Everything else — which
 * label activates, which lane is skipped, the rejoin, terminal behavior,
 * readiness, and entitlement — must be identical to before.
 *
 * Engine dependencies are mocked exactly as the CS-2 parity suite / engine
 * tests do; the ENGINE ITSELF (traversal, selectActivatedEdges, skip
 * persistence, plan gate) is real.
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

import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { WorkflowDefinition } from "@/contracts/workflow";
import { WorkflowEngine } from "@/services/execution/engine";
import { validateDocumentBranchLaneInsertion } from "@/features/workflow-builder/document/documentCommands";
import { insertActionAtEdge } from "@/features/workflow-builder/utils/insertActionAtEdge";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { checkWorkflowReadiness } from "@/services/workflows/executionReadiness";

const insertedMeta = {
  key: "slack:notify",
  provider: "slack",
  type: "notify",
  displayName: "Notify",
  description: "Notify.",
  category: "messaging",
  requiresIntegration: true,
  displayOrder: 10,
  fields: [],
  outputs: [],
} as unknown as ActionMeta;

/**
 * trigger → If/Then → (true: hot | false: cold) → rejoin.
 *
 * The condition is LITERAL (`input` === the run's kind) so the engine's own
 * branch evaluation decides the lane — no variable-resolver stub in the way.
 */
function baseDefinition(kind: string): WorkflowDefinition {
  return {
  nodes: [
    { id: "t1", kind: "trigger", provider: "slack", type: "message", config: {}, position: { x: 0, y: 0 } },
    {
      id: "if1",
      kind: "action",
      provider: "native",
      type: "if_then_condition",
      config: { input: kind, operator: "equals", value: "hot", onFalse: "branch" },
      position: { x: 0, y: 120 },
    },
    { id: "hot", kind: "action", provider: "slack", type: "notify", config: { text: "hot" }, position: { x: -160, y: 240 } },
    { id: "cold", kind: "action", provider: "slack", type: "notify", config: { text: "cold" }, position: { x: 160, y: 240 } },
    { id: "join", kind: "action", provider: "slack", type: "notify", config: { text: "join" }, position: { x: 0, y: 360 } },
  ],
  edges: [
    { id: "e-t", from: "t1", to: "if1" },
    { id: "e-true", from: "if1", to: "hot", label: "true" },
    { id: "e-false", from: "if1", to: "cold", label: "false" },
    { id: "e-hot-join", from: "hot", to: "join" },
    { id: "e-cold-join", from: "cold", to: "join" },
    ],
  };
}

function triggerEvent(kind: string): TriggerEvent {
  return {
    provider: "slack",
    eventType: "message",
    eventId: `Ev-${kind}`,
    occurredAt: "2026-07-20T00:00:00Z",
    providerAccountId: "T0001",
    payload: { kind },
  };
}

function workflowRecord(definition: WorkflowDefinition) {
  return {
    id: "wf-lane-parity",
    accountId: "acct-1",
    createdByUserId: "user-1",
    name: "Lane parity",
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

/** Run the REAL engine; report per-node status + execution order. */
async function run(definition: WorkflowDefinition, kind: string) {
  mockGetByIdServiceRole.mockResolvedValue(workflowRecord(definition));
  const order: string[] = [];
  mockGetActionHandler.mockImplementation((provider: string, type: string) => {
    if (provider === "native" && type === "if_then_condition") {
      return async (ctx: { config: Record<string, unknown>; nodeId?: string }) => {
        order.push(ctx.nodeId ?? "if");
        return {
          output: {},
          branchTaken: String(ctx.config.input) === String(ctx.config.value) ? "true" : "false",
        };
      };
    }
    return async (ctx: { nodeId?: string }) => {
      order.push(ctx.nodeId ?? "?");
      return { output: {} };
    };
  });

  const engine = new WorkflowEngine({ resolveStrict: (v) => v });
  const result = await engine.runWorkflow({
    workflowId: "wf-lane-parity",
    triggerNodeId: "t1",
    triggerEvent: triggerEvent(kind),
  });
  return {
    status: result.status,
    statusByNode: Object.fromEntries(result.steps.map((s) => [s.nodeId, s.status])),
    order,
  };
}

/** Perform the CS-2B insertion on the TRUE lane through the shared path. */
function insertOnTrueLane(kind: string): { definition: WorkflowDefinition; addedId: string } {
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useGraphSlice
    .getState()
    .hydrate("wf-lane-parity", JSON.parse(JSON.stringify(baseDefinition(kind))));

  const check = validateDocumentBranchLaneInsertion({
    edgeId: "e-true",
    expectedFrom: "if1",
    expectedTo: "hot",
    expectedLabel: "true",
  });
  expect(check).toEqual({ ok: true });
  insertActionAtEdge("e-true", insertedMeta);

  const nodes = useGraphSlice.getState().pendingNodes;
  const addedId = nodes.find((n) => !["t1", "if1", "hot", "cold", "join"].includes(n.id))!.id;
  return {
    definition: { nodes: [...nodes], edges: [...useGraphSlice.getState().pendingEdges] },
    addedId,
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

describe("CS-2B execution parity", () => {
  it("selected lane: the inserted step runs first, then the original lane step, then the rejoin", async () => {
    const before = await run(baseDefinition("hot"), "hot");
    const { definition, addedId } = insertOnTrueLane("hot");
    const after = await run(definition, "hot");

    expect(after.status).toBe("succeeded");
    // The inserted step executes, BEFORE the original lane action.
    expect(after.statusByNode[addedId]).toBe("succeeded");
    expect(after.order.indexOf(addedId)).toBeLessThan(after.order.indexOf("hot"));
    expect(after.statusByNode["hot"]).toBe("succeeded");
    // The other lane is still skipped; the rejoin still runs, exactly once.
    expect(after.statusByNode["cold"]).toBe("skipped");
    expect(after.statusByNode["join"]).toBe("succeeded");
    expect(after.order.filter((id) => id === "join")).toHaveLength(1);
    // Everything except the new node is unchanged vs. the pre-insert run.
    const { [addedId]: _added, ...afterWithoutNew } = after.statusByNode;
    expect(afterWithoutNew).toEqual(before.statusByNode);
  });

  it("other lane: the inserted step is SKIPPED and the alternative lane runs normally", async () => {
    const before = await run(baseDefinition("cold"), "cold");
    const { definition, addedId } = insertOnTrueLane("cold");
    const after = await run(definition, "cold");

    expect(after.status).toBe("succeeded");
    expect(after.statusByNode[addedId]).toBe("skipped");
    expect(after.statusByNode["hot"]).toBe("skipped");
    expect(after.statusByNode["cold"]).toBe("succeeded");
    expect(after.statusByNode["join"]).toBe("succeeded");
    const { [addedId]: _added, ...afterWithoutNew } = after.statusByNode;
    expect(afterWithoutNew).toEqual(before.statusByNode);
  });

  it("readiness is unchanged apart from the new node's own config gap", async () => {
    const { definition, addedId } = insertOnTrueLane("hot");
    const beforeReadiness = await checkWorkflowReadiness(baseDefinition("hot"));
    const afterReadiness = await checkWorkflowReadiness(definition);

    // `checkWorkflowReadiness` returns null when the workflow is ready.
    // The base workflow is ready; the insertion must not make it unready for
    // any reason OTHER than the new node's own configuration gap.
    expect(beforeReadiness).toBeNull();
    if (afterReadiness !== null) {
      expect(JSON.stringify(afterReadiness)).toContain(addedId);
    } else {
      expect(afterReadiness).toBeNull();
    }
  });

  it("entitlement behavior is unchanged (Free still refused before any handler)", async () => {
    const { definition } = insertOnTrueLane("hot");
    mockBranchingEntitlement.mockResolvedValue({
      entitled: false,
      plan: "free",
      planStatus: "active",
      fallback: false,
    });
    const result = await run(definition, "hot");
    expect(result.status).toBe("failed");
    expect(result.order).toEqual([]);
  });
});
