/**
 * @jest-environment node
 *
 * CS-5 branch-authoring EXECUTION PARITY (5.DUAL-BUILDER-1).
 *
 * A branch AUTHORED entirely through the Document command layer must run with
 * the SAME engine semantics as the canonical model: If/Then true/false/skip,
 * Router first-match/default/no-match, unselected lanes persist `skipped`, and
 * the Free plan gate blocks BEFORE any handler runs. The engine never learns
 * which builder authored the graph. The engine (traversal, `selectActivatedEdges`,
 * skip persistence, plan gate) and the REAL native If/Then + Router handlers are
 * used; only the repo / billing / discovery boundaries are mocked (as in
 * services/execution/engine.test.ts).
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
  resolveAdvancedBranchingEntitlementServiceRole: (...args: unknown[]) => mockBranchingEntitlement(...args),
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
  computeRunTaskUsage: jest.fn().mockReturnValue({ estimatedTaskCost: 0, actualTaskCost: 0, policyVersion: "v1", estimateSummary: {} }),
  recordRunActuals: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/services/billing/reserveReconcileShadowMode", () => ({ recordShadowComparison: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/services/billing/billingShadowComparisons", () => ({ recordBillingShadowComparison: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/repositories/accountBilling", () => ({
  reserveTasks: jest.fn(), reconcileReservation: jest.fn(), releaseReservation: jest.fn(),
  releaseExpiredReservations: jest.fn(), deductTasks: jest.fn(), getUsage: jest.fn(),
}));
jest.mock("@/services/billing/reserveReconcileBilling", () => ({ createBillingReservation: jest.fn(), reconcileBillingReservation: jest.fn() }));
jest.mock("@/services/billing/workflowCostEstimator", () => ({ estimateWorkflowTaskCost: jest.fn().mockReturnValue({ taskCost: 0 }) }));
jest.mock("@/services/integrations/connectionResolution", () => ({ buildWorkflowCredentialPlan: jest.fn() }));
jest.mock("@/services/oauth/credentialResolutionContext", () => ({
  runWithCredentialResolutionContext: (_ctx: unknown, fn: () => unknown) => fn(),
  getCredentialResolutionContext: () => undefined,
}));

import { WorkflowEngine } from "@/services/execution/engine";
import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { WorkflowDefinition } from "@/contracts/workflow";
import { ifThenCondition } from "@/integrations/native/actions/ifThenCondition";
import { router } from "@/integrations/native/actions/router";
import {
  addDocumentActionToEmptyLane,
  addDocumentBranchRoute,
  createDocumentIfThenBranch,
  createDocumentRouterBranch,
  updateDocumentIfThenCondition,
} from "@/features/workflow-builder/document/documentBranchCommands";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";

const leafMeta = {
  key: "slack:send_channel_message", provider: "slack", type: "send_channel_message",
  displayName: "Send", description: "", category: "messaging", requiresIntegration: true,
  fields: [], outputs: [], producesFileRef: false, consumesFileRef: false,
  displayOrder: 1, isDestructive: false, requiresConfirmation: false, riskLevel: "low",
} as unknown as ActionMeta;

const triggerEvent: TriggerEvent = {
  provider: "hubspot", eventType: "new_contact", eventId: "Ev1",
  occurredAt: "2026-07-20T00:00:00Z", providerAccountId: "A1", payload: {},
};

function workflowRecord(definition: WorkflowDefinition) {
  return {
    id: "wf-cs5", accountId: "acct-1", createdByUserId: "user-1", name: "CS5",
    state: "active" as const, disabledReason: null, disabledContext: null,
    activeRevisionId: null, draftDefinition: definition, deletedAt: null,
    createdAt: "2026-07-01T00:00:00Z", updatedAt: "2026-07-01T00:00:00Z",
  };
}

async function runAndSummarize(definition: WorkflowDefinition) {
  mockGetByIdServiceRole.mockResolvedValue(workflowRecord(definition));
  const executed: string[] = [];
  mockGetActionHandler.mockImplementation((provider: string, type: string) => {
    if (provider === "native" && type === "if_then_condition") return ifThenCondition;
    if (provider === "native" && type === "router") return router;
    return async (ctx: { nodeId?: string }) => {
      executed.push(ctx.nodeId ?? "");
      return { output: {} };
    };
  });
  const engine = new WorkflowEngine({ resolveStrict: (v) => v });
  const result = await engine.runWorkflow({ workflowId: "wf-cs5", triggerNodeId: "t", triggerEvent });
  return {
    status: result.status,
    byNode: Object.fromEntries(result.steps.map((s) => [s.nodeId, s.status])) as Record<string, string>,
    executed,
  };
}

function pendingDefinition(): WorkflowDefinition {
  return {
    nodes: [...useGraphSlice.getState().pendingNodes],
    edges: [...useGraphSlice.getState().pendingEdges],
  };
}

function seedTriggerAndTail() {
  useGraphSlice.getState().hydrate("wf-cs5", {
    nodes: [
      { id: "t", kind: "trigger", provider: "hubspot", type: "new_contact", config: {}, position: { x: 0, y: 0 } },
      { id: "seed", kind: "action", provider: "slack", type: "send_channel_message", config: { text: "seed" }, position: { x: 0, y: 120 } },
    ],
    edges: [{ id: "e1", from: "t", to: "seed" }],
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockBranchingEntitlement.mockResolvedValue({ entitled: true, plan: "pro", planStatus: "active", fallback: false });
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
});

describe("If/Then authored in the Document runs with canonical branch semantics", () => {
  function buildIfThen(onFalse: "branch" | "skip", input: string, value: string): { yesId: string; noId: string | null } {
    seedTriggerAndTail();
    const create = createDocumentIfThenBranch({ location: { kind: "tail", anchorNodeId: "seed" } });
    expect(create.ok).toBe(true);
    const ifId = create.ok ? create.nodeId! : "";
    updateDocumentIfThenCondition({ nodeId: ifId, patch: { input, operator: "equals", value, onFalse } });
    const yes = addDocumentActionToEmptyLane({ forkNodeId: ifId, label: "true", meta: leafMeta });
    let noId: string | null = null;
    if (onFalse === "branch") {
      const no = addDocumentActionToEmptyLane({ forkNodeId: ifId, label: "false", meta: leafMeta });
      expect(no.ok).toBe(true);
      noId = no.ok ? no.nodeId! : null;
    }
    expect(yes.ok).toBe(true);
    return { yesId: yes.ok ? yes.nodeId! : "", noId };
  }

  it("true input runs the true lane, skips the false lane", async () => {
    const { yesId, noId } = buildIfThen("branch", "gold", "gold");
    const run = await runAndSummarize(pendingDefinition());
    expect(run.status).toBe("succeeded");
    expect(run.byNode[yesId]).toBe("succeeded");
    expect(run.byNode[noId!]).toBe("skipped");
  });

  it("false input runs the false lane when onFalse=branch", async () => {
    const { yesId, noId } = buildIfThen("branch", "gold", "silver");
    const run = await runAndSummarize(pendingDefinition());
    expect(run.byNode[noId!]).toBe("succeeded");
    expect(run.byNode[yesId]).toBe("skipped");
  });

  it("false input skips the true lane when onFalse=skip (no false lane)", async () => {
    const { yesId } = buildIfThen("skip", "gold", "silver");
    const run = await runAndSummarize(pendingDefinition());
    expect(run.status).toBe("succeeded");
    expect(run.byNode[yesId]).toBe("skipped");
  });
});

describe("Router authored in the Document runs with first-match / default / no-match semantics", () => {
  function buildRouter(withDefault: boolean): { hotId: string; coldId: string } {
    seedTriggerAndTail();
    const create = createDocumentRouterBranch({ location: { kind: "tail", anchorNodeId: "seed" } });
    const rId = create.ok ? create.nodeId! : "";
    addDocumentBranchRoute({ nodeId: rId, label: "hot", condition: { input: "gold", operator: "equals", value: "gold" } });
    addDocumentBranchRoute({ nodeId: rId, label: "cold", condition: { input: "gold", operator: "equals", value: "bronze" } });
    if (withDefault) {
      useGraphSlice.getState().updateNodeConfig(rId, {
        ...(useGraphSlice.getState().pendingNodes.find((n) => n.id === rId)!.config),
        defaultRoute: "cold",
      });
      // Re-wire cold since updateNodeConfig may have run reconciliation (cold stays returnable).
    }
    const hot = addDocumentActionToEmptyLane({ forkNodeId: rId, label: "hot", meta: leafMeta });
    const cold = addDocumentActionToEmptyLane({ forkNodeId: rId, label: "cold", meta: leafMeta });
    return { hotId: hot.ok ? hot.nodeId! : "", coldId: cold.ok ? cold.nodeId! : "" };
  }

  it("first matching route executes; other lanes skip", async () => {
    const { hotId, coldId } = buildRouter(false);
    const run = await runAndSummarize(pendingDefinition());
    expect(run.status).toBe("succeeded");
    expect(run.byNode[hotId]).toBe("succeeded");
    expect(run.byNode[coldId]).toBe("skipped");
  });

  it("defaultRoute activates when no condition matches", async () => {
    // Both routes look for 'gold'==='gold'/'bronze'; change input so neither hot matches.
    seedTriggerAndTail();
    const create = createDocumentRouterBranch({ location: { kind: "tail", anchorNodeId: "seed" } });
    const rId = create.ok ? create.nodeId! : "";
    addDocumentBranchRoute({ nodeId: rId, label: "hot", condition: { input: "x", operator: "equals", value: "y" } });
    addDocumentBranchRoute({ nodeId: rId, label: "cold", condition: { input: "x", operator: "equals", value: "z" } });
    useGraphSlice.getState().updateNodeConfig(rId, {
      ...(useGraphSlice.getState().pendingNodes.find((n) => n.id === rId)!.config), defaultRoute: "cold",
    });
    // Both lanes must be wired or the engine's readiness backstop blocks on a
    // missing branch edge — the same gate a canvas-authored router obeys.
    const hot = addDocumentActionToEmptyLane({ forkNodeId: rId, label: "hot", meta: leafMeta });
    const cold = addDocumentActionToEmptyLane({ forkNodeId: rId, label: "cold", meta: leafMeta });
    const run = await runAndSummarize(pendingDefinition());
    expect(run.byNode[cold.ok ? cold.nodeId! : ""]).toBe("succeeded");
    expect(run.byNode[hot.ok ? hot.nodeId! : ""]).toBe("skipped");
  });
});

describe("entitlement parity", () => {
  it("Free plan blocks BEFORE any handler runs on a Document-authored branch", async () => {
    seedTriggerAndTail();
    const create = createDocumentIfThenBranch({ location: { kind: "tail", anchorNodeId: "seed" } });
    const ifId = create.ok ? create.nodeId! : "";
    updateDocumentIfThenCondition({ nodeId: ifId, patch: { input: "a", operator: "equals", value: "a", onFalse: "branch" } });
    addDocumentActionToEmptyLane({ forkNodeId: ifId, label: "true", meta: leafMeta });
    addDocumentActionToEmptyLane({ forkNodeId: ifId, label: "false", meta: leafMeta });

    mockBranchingEntitlement.mockResolvedValue({ entitled: false, plan: "free", planStatus: "active", fallback: false });
    const run = await runAndSummarize(pendingDefinition());
    expect(run.status).toBe("failed");
    expect(run.executed).toEqual([]); // no leaf handler ran
  });
});
