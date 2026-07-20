/**
 * @jest-environment node
 *
 * RECONV-1 S4 — background-execution reconvergence.
 *
 * The engine's OR-merge reconvergence is unit-proven in engine.test.ts
 * (RECONV-1 S1) via direct `runWorkflow` calls. This suite proves the SAME
 * diamond semantics hold when a run reaches the engine through the REAL
 * background pipeline — the path every webhook/polling event takes:
 *
 *   provider event → dispatchTriggerEvent (dedup → trigger_resources lookup →
 *   active-state gate → enqueueRun durable 'queued' row) → processQueuedRuns
 *   (cron drain) → WorkflowEngine claim + execute → finalize.
 *
 * All four services are REAL (`services/triggers/dispatch`,
 * `services/execution/enqueue`, `services/execution/runQueueProcessor`,
 * `services/execution/engine`), the variable resolver is REAL
 * (`resolveStrict` — the processor wires it), and the two native handlers the
 * diamond executes are the REAL registered handlers
 * (`native:if_then_condition`, `native:format_transformer` — pure functions,
 * no provider network). Mocked: the DB repositories (in-memory
 * `workflow_runs` store so the durable queued→running→terminal lifecycle is
 * honestly exercised) and the engine's billing/notification collaborators —
 * the same boundary idiom as engine.test.ts + durable-queue-e2e.test.ts.
 * There is NO external provider boundary in this graph (native nodes only),
 * per docs/rules/testing-strategy.md.
 *
 * Asserts, for each selected route (true / false):
 *   - the dispatcher enqueues a durable 'queued' row without running the
 *     engine inline;
 *   - the drain claims THAT row (no INSERT fallback) and the run succeeds;
 *   - the selected branch action ran, the unselected route PERSISTED as
 *     `skipped` (no output) in the terminal row's steps;
 *   - the shared reconvergence node executed EXACTLY once (one handler call,
 *     one step entry) and its output is present;
 *   - every node appears exactly once in steps (no double execution).
 */

// ── dispatcher boundary (DB repos) ──────────────────────────────────────────

const mockMarkSeen = jest.fn(async (..._a: unknown[]) => ({ fresh: true }));
jest.mock("@/repositories/webhookEventDedup", () => ({
  markSeen: (...a: unknown[]) => mockMarkSeen(...a),
}));

const mockListForDispatch = jest.fn();
jest.mock("@/repositories/triggerResources", () => ({
  listForDispatch: (...a: unknown[]) => mockListForDispatch(...a),
}));

const mockGetByIdServiceRole = jest.fn();
const mockGetStateForDispatch = jest.fn(async (..._a: unknown[]) => "active");
jest.mock("@/repositories/workflows", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetByIdServiceRole(...a),
  getStateForDispatch: (...a: unknown[]) => mockGetStateForDispatch(...a),
}));

jest.mock("@/services/accounts/accountFreeze", () => ({
  isAccountFrozen: jest.fn(async () => false),
}));

// ── durable run-queue repo — functional in-memory store ─────────────────────
//
// Not per-call canned returns: the store honestly enforces the queued →
// running (claim) → terminal (finalize) lifecycle so the test proves the
// dispatcher's enqueued row is the SAME row the engine claims and finalizes.

const mockRunsStore = new Map<string, Record<string, unknown>>();
const mockRecordRun = jest.fn(async (..._a: unknown[]) => undefined);
const mockCreateWorkflowRunStart = jest.fn(async (..._a: unknown[]) => ({ created: true }));

function mockEnvelope(row: Record<string, unknown>) {
  return {
    runId: row.runId,
    workflowId: row.workflowId,
    triggerNodeId: row.triggerNodeId,
    triggerEvent: row.triggerEvent,
    isTest: row.isTest,
    triggeredBy: row.triggeredBy,
    triggeredByUserId: row.triggeredByUserId ?? null,
    triggeredByApiKeyId: null,
    triggeredByApiKeyPrefix: null,
  };
}

jest.mock("@/repositories/workflowRuns", () => ({
  createQueuedWorkflowRun: async (input: { runId: string }) => {
    if (mockRunsStore.has(input.runId)) return { created: false };
    mockRunsStore.set(input.runId, { ...input, status: "queued" });
    return { created: true };
  },
  listQueuedWorkflowRunsForDispatch: async (_limit: number) =>
    [...mockRunsStore.values()]
      .filter((r) => r.status === "queued")
      .map(mockEnvelope),
  getQueuedRunForDispatch: async (runId: string) => {
    const row = mockRunsStore.get(runId);
    return row && row.status === "queued" ? mockEnvelope(row) : null;
  },
  claimQueuedWorkflowRun: async (input: { runId: string; startedAt: string }) => {
    const row = mockRunsStore.get(input.runId);
    if (!row || row.status !== "queued") return { claimed: false };
    row.status = "running";
    row.startedAt = input.startedAt;
    return { claimed: true };
  },
  finalizeWorkflowRun: async (input: Record<string, unknown> & { runId: string }) => {
    const row = mockRunsStore.get(input.runId);
    if (!row || (row.status !== "running" && row.status !== "queued")) {
      return { finalized: false };
    }
    Object.assign(row, {
      status: input.status,
      steps: input.steps,
      fatalError: input.fatalError,
      errorClassification: input.errorClassification,
      finishedAt: input.finishedAt,
    });
    return { finalized: true };
  },
  failQueuedRunIfStillQueued: async (input: { runId: string }) => {
    const row = mockRunsStore.get(input.runId);
    if (!row || row.status !== "queued") return { failed: false };
    row.status = "failed";
    return { failed: true };
  },
  createWorkflowRunStart: (...a: unknown[]) => mockCreateWorkflowRunStart(...a),
  markWorkflowRunFailedBeforeExecution: async () => ({ updated: true }),
  recordRun: (...a: unknown[]) => mockRecordRun(...a),
}));

// ── engine collaborators (same idiom as engine.test.ts) ─────────────────────

const mockBillingGate = jest.fn();
jest.mock("@/services/billing/executionBillingGate", () => ({
  executionBillingGate: (...a: unknown[]) => mockBillingGate(...a),
}));

const mockBranchingEntitlement = jest.fn();
jest.mock("@/services/billing/advancedBranchingEntitlement", () => ({
  resolveAdvancedBranchingEntitlementServiceRole: (...a: unknown[]) =>
    mockBranchingEntitlement(...a),
}));

jest.mock("@/services/workflows/orchestratorFactory", () => ({
  createLifecycleOrchestrator: () => ({
    disable: jest.fn(async () => ({ state: "disabled" })),
  }),
}));

jest.mock("@/services/notifications/notifyWorkflowFailure", () => ({
  notifyWorkflowFailure: jest.fn(async () => ({ claimed: true, results: [] })),
}));

const mockGetDefinitionForExecution = jest.fn();
jest.mock("@/services/workflows/activeRevision", () => ({
  getDefinitionForExecution: (...a: unknown[]) => mockGetDefinitionForExecution(...a),
}));

jest.mock("@/services/discovery/_registry", () => ({
  getActionMeta: jest.fn(() => undefined),
  // Empty metas ⇒ the pre-dispatch readiness gate validates GRAPH integrity
  // only — required-field metadata is a builder concern covered elsewhere.
  listAllActionMetas: () => [],
  listAllTriggerMetas: () => [],
}));

jest.mock("@/services/billing/taskUsageRecorder", () => ({
  computeRunTaskUsage: jest.fn(() => ({
    estimatedTaskCost: 0,
    actualTaskCost: 0,
    policyVersion: "v1",
    estimateSummary: {
      billableNodeCount: 0,
      nonBillableNodeCount: 0,
      unknownNodeCount: 0,
      warningCount: 0,
    },
    nodeEvents: [],
  })),
  recordRunActuals: jest.fn(async () => undefined),
}));

jest.mock("@/services/billing/reserveReconcileShadowMode", () => ({
  recordShadowComparison: jest.fn(async () => undefined),
}));
jest.mock("@/services/billing/billingShadowComparisons", () => ({
  recordBillingShadowComparison: jest.fn(async () => undefined),
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
  estimateWorkflowTaskCost: jest.fn(() => ({ estimatedTasksPerRun: 3 })),
}));
jest.mock("@/services/integrations/connectionResolution", () => ({
  buildWorkflowCredentialPlan: jest.fn(),
}));
jest.mock("@/services/oauth/credentialResolutionContext", () => ({
  runWithCredentialResolutionContext: (_ctx: unknown, fn: () => unknown) => fn(),
  getCredentialResolutionContext: () => undefined,
}));

// ── handler registry — REAL native handlers, narrowed lookup ────────────────
//
// The full `_handlerInventory` imports every provider's handler modules; this
// diamond only needs the two native ones, so the registry lookup is narrowed
// while the handler IMPLEMENTATIONS stay real (true branchTaken semantics,
// real strict schemas, real transform output).

jest.mock("@/services/execution/handlers/_registry", () => {
  const { ifThenCondition } = jest.requireActual(
    "@/integrations/native/actions/ifThenCondition",
  );
  const { formatTransformer } = jest.requireActual(
    "@/integrations/native/actions/formatTransformer",
  );
  const byKey: Record<string, unknown> = {
    "native:if_then_condition": ifThenCondition,
    "native:format_transformer": formatTransformer,
  };
  return {
    getActionHandler: (provider: string, type: string) => byKey[`${provider}:${type}`],
    listRegisteredHandlers: () => Object.keys(byKey),
  };
});

import { dispatchTriggerEvent } from "@/services/triggers/dispatch";
import { processQueuedRuns } from "@/services/execution/runQueueProcessor";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { WorkflowDefinition } from "@/contracts/workflow";

// ── fixtures ────────────────────────────────────────────────────────────────

const WORKFLOW_ID = "wf-reconv-bg-1";
const ACCOUNT_ID = "acct-reconv-1";

function ft(id: string, content: string, y: number) {
  return {
    id,
    kind: "action" as const,
    provider: "native",
    type: "format_transformer",
    config: { content, sourceFormat: "plain", targetFormat: "plain" },
    position: { x: 0, y },
  };
}

/** Reconverged diamond: trigger → if → (true: A, false: B) → shared. */
const DIAMOND: WorkflowDefinition = {
  nodes: [
    {
      id: "trigger-node",
      kind: "trigger",
      provider: "acme",
      type: "item_created",
      config: {},
      position: { x: 0, y: 0 },
    },
    {
      id: "if-then",
      kind: "action",
      provider: "native",
      type: "if_then_condition",
      config: {
        // Resolved by the REAL resolveStrict against the trigger event payload.
        input: "{{trigger.payload.status}}",
        operator: "equals",
        value: "active",
        onFalse: "branch",
      },
      position: { x: 0, y: 120 },
    },
    ft("ft-true", "TRUE route ran", 240),
    ft("ft-false", "FALSE route ran", 240),
    ft("ft-shared", "SHARED ran", 360),
  ],
  edges: [
    { id: "e0", from: "trigger-node", to: "if-then" },
    { id: "e-true", from: "if-then", to: "ft-true", label: "true" },
    { id: "e-false", from: "if-then", to: "ft-false", label: "false" },
    { id: "e-join-a", from: "ft-true", to: "ft-shared" },
    { id: "e-join-b", from: "ft-false", to: "ft-shared" },
  ],
};

const ACTIVE_WORKFLOW = {
  id: WORKFLOW_ID,
  accountId: ACCOUNT_ID,
  createdByUserId: "user-1",
  name: "Reconvergence background walkthrough",
  state: "active" as const,
  disabledReason: null,
  disabledContext: null,
  activeRevisionId: "rev-1",
  draftDefinition: DIAMOND,
  deletedAt: null,
  createdAt: "2026-07-19T00:00:00Z",
  updatedAt: "2026-07-19T00:00:00Z",
};

function makeEvent(eventId: string, status: string): TriggerEvent {
  return {
    provider: "acme",
    eventType: "item_created",
    eventId,
    occurredAt: "2026-07-19T00:00:00.000Z",
    providerAccountId: "acme-acct-1",
    payload: { status },
  };
}

interface StoredStep {
  nodeId: string;
  status: string;
  output?: Record<string, unknown>;
}

beforeEach(() => {
  mockRunsStore.clear();
  mockMarkSeen.mockClear();
  mockRecordRun.mockClear();
  mockCreateWorkflowRunStart.mockClear();
  mockListForDispatch.mockReset();
  mockListForDispatch.mockResolvedValue([
    {
      id: "tr-1",
      workflowId: WORKFLOW_ID,
      nodeId: "trigger-node",
      provider: "acme",
      eventType: "item_created",
      config: {},
      workflowAccountId: ACCOUNT_ID,
    },
  ]);
  mockGetStateForDispatch.mockClear();
  mockGetByIdServiceRole.mockReset();
  mockGetByIdServiceRole.mockResolvedValue(ACTIVE_WORKFLOW);
  mockBillingGate.mockReset();
  mockBillingGate.mockResolvedValue({ ok: true, used: 1, limit: 100 });
  mockBranchingEntitlement.mockReset();
  mockBranchingEntitlement.mockResolvedValue({
    entitled: true,
    plan: "pro",
    planStatus: "active",
    fallback: false,
  });
  // Background real runs execute the LIVE definition; resolve it to the
  // seeded diamond (the revision snapshot equals the draft here).
  mockGetDefinitionForExecution.mockReset();
  mockGetDefinitionForExecution.mockImplementation(
    async (wf: { draftDefinition: unknown }) => ({
      definition: wf.draftDefinition,
      source: "live",
      revisionId: "rev-1",
    }),
  );
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "debug").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("RECONV-1 S4 — reconverged diamond through the background webhook pipeline", () => {
  const cases = [
    {
      route: "true",
      status: "active",
      ran: "ft-true",
      skipped: "ft-false",
      ranContent: "TRUE route ran",
    },
    {
      route: "false",
      status: "inactive",
      ran: "ft-false",
      skipped: "ft-true",
      ranContent: "FALSE route ran",
    },
  ] as const;

  for (const c of cases) {
    it(`route '${c.route}': webhook dispatch → durable queue → engine; ${c.ran} runs, ${c.skipped} persists skipped, shared executes exactly once`, async () => {
      const event = makeEvent(`evt-${c.route}`, c.status);

      // 1) Background dispatch: dedup → resource match → active gate → enqueue.
      const dispatch = await dispatchTriggerEvent(event);
      expect(dispatch).toEqual({
        matched: 1,
        enqueued: 1,
        duplicate: false,
        dedupOutage: false,
      });

      // The run exists ONLY as a durable 'queued' row — nothing executed inline.
      expect(mockRunsStore.size).toBe(1);
      const queued = [...mockRunsStore.values()][0]!;
      expect(queued.status).toBe("queued");
      expect(queued.workflowId).toBe(WORKFLOW_ID);
      expect(queued.triggerNodeId).toBe("trigger-node");
      expect(queued.triggerEvent).toEqual(event);
      // Webhook dispatch carries no human actor and the default source label.
      expect(queued.triggeredByUserId).toBeNull();
      expect(queued.isTest).toBe(false);

      // 2) The cron drain claims + executes the SAME row through the engine.
      const outcome = await processQueuedRuns({ limit: 10 });
      expect(outcome).toEqual({ fetched: 1, processed: 1, failed: 0 });

      const row = mockRunsStore.get(queued.runId as string)!;
      expect(row.status).toBe("succeeded");
      expect(row.fatalError).toBeNull();
      // Claimed-row path: the engine must not INSERT a fresh run row.
      expect(mockCreateWorkflowRunStart).not.toHaveBeenCalled();
      expect(mockRecordRun).not.toHaveBeenCalled();

      // 3) Persisted step statuses — the reconvergence contract.
      const steps = row.steps as StoredStep[];
      const byNode = new Map(steps.map((s) => [s.nodeId, s]));
      expect(byNode.get("trigger-node")!.status).toBe("succeeded");
      expect(byNode.get("if-then")!.status).toBe("succeeded");
      expect(byNode.get(c.ran)!.status).toBe("succeeded");
      // The unselected route PERSISTED as skipped, with no output.
      expect(byNode.get(c.skipped)!.status).toBe("skipped");
      expect(byNode.get(c.skipped)!.output).toBeUndefined();
      // Shared node executed — exactly ONE step entry (never twice).
      expect(steps.filter((s) => s.nodeId === "ft-shared")).toHaveLength(1);
      expect(byNode.get("ft-shared")!.status).toBe("succeeded");
      // Every node appears exactly once — no node executed/recorded twice.
      expect(steps).toHaveLength(DIAMOND.nodes.length);
      expect(new Set(steps.map((s) => s.nodeId)).size).toBe(steps.length);

      // 4) Real handler outputs threaded through the real resolver.
      const ifOut = byNode.get("if-then")!.output as {
        conditionMet: boolean;
        onFalse: string;
      };
      expect(ifOut.conditionMet).toBe(c.route === "true");
      expect(ifOut.onFalse).toBe("branch");
      const ranOut = byNode.get(c.ran)!.output as { transformedContent: string };
      expect(ranOut.transformedContent).toBe(c.ranContent);
      const sharedOut = byNode.get("ft-shared")!.output as {
        transformedContent: string;
      };
      expect(sharedOut.transformedContent).toBe("SHARED ran");
    });
  }
});
