import { randomUUID } from "node:crypto";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type {
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
} from "@/contracts/workflow";
import {
  MissingVariableError,
  type ResolveContext,
} from "@/workflow-engine/variables/resolveValue";
import {
  humanizeActionError,
  type HumanizedError,
} from "@/core/errors/humanizeActionError";
import * as workflowsRepo from "@/repositories/workflows";
import * as workflowRunsRepo from "@/repositories/workflowRuns";
import { executionBillingGate } from "@/services/billing/executionBillingGate";
import {
  computeRunTaskUsage,
  recordRunActuals,
  type RunTaskUsage,
} from "@/services/billing/taskUsageRecorder";
import { isReserveReconcileShadowEnabled } from "@/services/billing/billingFeatureFlags";
import { recordShadowComparison } from "@/services/billing/reserveReconcileShadowMode";
import { recordBillingShadowComparison } from "@/services/billing/billingShadowComparisons";
import { notifyWorkflowFailure } from "@/services/notifications/notifyWorkflowFailure";
import {
  buildOutgoingEdgeMap,
  selectActivatedEdges,
} from "./branching";
import { getActionHandler } from "./handlers/_registry";
import {
  buildTestModeMockOutput,
  decideTestModeBlock,
} from "./testModeGate";

/**
 * Flat tasks charged per real run today (Slice 1N). Used by COST-14 shadow
 * mode to compare flat-vs-proposed billing. NOT a new live-billing constant —
 * the flat gate already deducts exactly this.
 */
const FLAT_TASKS_PER_RUN = 1;

/**
 * Workflow execution engine.
 *
 * Per docs/rules/variable-resolver.md §"Engine pre-resolution (strict)" +
 * webhook-receipt-routes.md §"Async dispatch only":
 *   - The dispatcher already verified state===active and dedup; the engine
 *     trusts that gate and just runs.
 *   - For each non-trigger node in BFS order from the trigger:
 *     1. Resolve config via the injected `resolveStrict`. A
 *        MissingVariableError aborts the run with a config-failure
 *        result for that node — the engine layer owns the catch-and-
 *        convert (rule §"MissingVariableError is thrown by the resolver
 *        and caught at the engine layer").
 *     2. Look up the handler in the registry. Missing → MISSING_HANDLER
 *        run failure.
 *     3. Call the handler with resolved config. Throws → HANDLER_FAILED.
 *     4. Store output in context.variables[nodeId] for downstream nodes.
 *
 * Cycle handling is the visited-set guard inside executionOrder() —
 * workflowDefinition.ts intentionally allows cycles (logic / loop nodes
 * later); for now visited-set prevents infinite loops without rejecting
 * arbitrary graphs.
 *
 * Persistence: at the end of every run that has a workflow loaded, the
 * engine writes one row to workflow_runs with steps + humanized
 * error_classification (Slice 1M). Persistence failures are logged but
 * never propagate — the engine completes the run regardless.
 */

export type RunFailureCode =
  | "WORKFLOW_NOT_FOUND"
  | "TRIGGER_NODE_NOT_FOUND"
  | "BILLING_EXHAUSTED"
  | "MISSING_HANDLER"
  | "MISSING_VARIABLE"
  | "HANDLER_FAILED"
  /**
   * COST-15C — a run row already exists for this runId when the engine tried
   * to create the pre-run row. The dispatch is a duplicate/replay; the engine
   * refuses to re-execute (no double side effects / double billing). Not
   * persisted — the original dispatch owns the row.
   */
  | "DUPLICATE_DISPATCH"
  /**
   * Handler returned `branchTaken: "<label>"` but no outgoing edge on this
   * node has that label. The engine consumes this in Commit 2 (label-aware
   * traversal); Commit 1 only adds the code + humanizer support. See
   * docs/slices/parity/engine-branching-plan.md §3.3 + §6.1.
   */
  | "INVALID_BRANCH";

export interface RunStepResult {
  nodeId: string;
  status: "succeeded" | "failed" | "skipped";
  output?: Readonly<Record<string, unknown>>;
  error?: { code: RunFailureCode; message: string; details?: Record<string, unknown> };
}

export interface RunResult {
  runId: string;
  workflowId: string;
  status: "succeeded" | "failed";
  steps: readonly RunStepResult[];
  startedAt: string;
  finishedAt: string;
  /** Top-level failure when the run never reached the per-step loop. */
  fatalError?: { code: RunFailureCode; message: string };
  /** Slice 3.SEC-2 — true when engine ran in test mode (handlers gated). */
  isTest: boolean;
  /** Slice 3.SEC-2 — how the run was triggered. Persisted to workflow_runs. */
  triggeredBy: RunTriggerSource;
}

/**
 * How a run was started. Persisted into `workflow_runs.triggered_by` so
 * post-mortems can attribute runs without inferring from `trigger_event`.
 *
 * - `manual`    — user clicked Run-now (real execution).
 * - `test`      — user clicked Test (engine `testMode` true; external
 *                 handlers short-circuited).
 * - `webhook`   — provider webhook delivery dispatched the run.
 * - `scheduled` — cron-triggered run.
 * - `retry`     — a failed run was retried.
 * - `unknown`   — pre-SEC-2 rows + any future entry path that hasn't
 *                 declared its source yet.
 *
 * Kept as a TS literal union (not a Zod enum) because this is engine-
 * internal — input validation happens at the route layer. The DB
 * check constraint is the authoritative gate against drift.
 */
export type RunTriggerSource =
  | "manual"
  | "test"
  | "webhook"
  | "scheduled"
  | "retry"
  | "unknown";

export interface RunWorkflowInput {
  workflowId: string;
  triggerNodeId: string;
  triggerEvent: TriggerEvent;
  /** Optional pre-assigned id (the dispatcher's enqueueRun supplies one). */
  runId?: string;
  /**
   * Slice 3.SEC-2 — when true, the engine consults the test-mode gate
   * before invoking each handler and short-circuits external / high-risk
   * actions. Default: `false` (real execution). Callers that want a safe
   * preview MUST pass `true` explicitly — the engine never silently
   * promotes a real run to test mode.
   */
  testMode?: boolean;
  /**
   * Slice 3.SEC-2 — how the run was kicked off. Persisted to
   * `workflow_runs.triggered_by`. Defaults to `"unknown"` when omitted.
   * Callers (run-now route, webhook dispatcher, cron) MUST supply their
   * own source label.
   */
  triggeredBy?: RunTriggerSource;
}

export interface EngineDependencies {
  /** Injected so this slice can ship before Slice 1K.1's resolver lands. */
  resolveStrict: (value: unknown, context: ResolveContext) => unknown;
}

export class WorkflowEngine {
  constructor(private readonly deps: EngineDependencies) {}

  async runWorkflow(input: RunWorkflowInput): Promise<RunResult> {
    const runId = input.runId ?? randomUUID();
    const startedAt = new Date().toISOString();
    // SEC-2: capture both provenance fields up-front so they thread into
    // every exit path uniformly. Defaults match the SQL column defaults.
    const isTest = input.testMode === true;
    const triggeredBy: RunTriggerSource = input.triggeredBy ?? "unknown";
    const log = (event: string, extra: Record<string, unknown> = {}) =>
      console.info(
        JSON.stringify({
          event,
          runId,
          workflowId: input.workflowId,
          isTest,
          triggeredBy,
          ...extra,
        }),
      );

    log("execution.run.started", { triggerNodeId: input.triggerNodeId });

    const workflow = await workflowsRepo.getByIdServiceRole(input.workflowId);
    if (!workflow) {
      const finishedAt = new Date().toISOString();
      log("execution.run.fatal", { code: "WORKFLOW_NOT_FOUND" });
      return {
        runId,
        workflowId: input.workflowId,
        status: "failed",
        steps: [],
        startedAt,
        finishedAt,
        fatalError: {
          code: "WORKFLOW_NOT_FOUND",
          message: `Workflow ${input.workflowId} not found.`,
        },
        isTest,
        triggeredBy,
      };
    }

    const def = workflow.draftDefinition;
    const triggerNode = def.nodes.find((n) => n.id === input.triggerNodeId);
    if (!triggerNode) {
      const finishedAt = new Date().toISOString();
      log("execution.run.fatal", { code: "TRIGGER_NODE_NOT_FOUND" });
      const fatalResult: RunResult = {
        runId,
        workflowId: input.workflowId,
        status: "failed",
        steps: [],
        startedAt,
        finishedAt,
        fatalError: {
          code: "TRIGGER_NODE_NOT_FOUND",
          message: `Trigger node ${input.triggerNodeId} not present in workflow definition.`,
        },
        isTest,
        triggeredBy,
      };
      await persistRun(fatalResult, workflow.userId, workflow.name, input, log);
      return fatalResult;
    }

    // COST-15C — create the run row at the START of execution (status
    // 'running', finished_at NULL) so finalize UPDATEs the SAME row. Flat
    // billing stays authoritative; NO reservation is taken here. Ordering
    // mirrors the COST-15A design (row before billing) so reserve mode
    // (COST-15D) can attach a hold to an existing row. Created AFTER the
    // no-row-needed structural fatals above (WORKFLOW_NOT_FOUND →
    // FK-impossible; TRIGGER_NODE_NOT_FOUND → terminal INSERT via persistRun).
    //
    // Idempotent on runId: a duplicate dispatch (a row already exists for this
    // runId) is refused WITHOUT re-executing — no double side effects, no
    // double billing, and the existing row is not overwritten. Fail-open: an
    // unexpected insert error does NOT abort the run; execution continues and
    // finalize falls back to an INSERT so the record is never lost (no
    // reservation depends on the row in flat mode).
    let preRunRowCreated = false;
    try {
      const startOutcome = await workflowRunsRepo.createWorkflowRunStart({
        runId,
        workflowId: input.workflowId,
        userId: workflow.userId,
        triggerNodeId: input.triggerNodeId,
        triggerEvent: input.triggerEvent,
        startedAt,
        isTest,
        triggeredBy,
      });
      if (!startOutcome.created) {
        log("execution.run.duplicate_dispatch", {});
        return {
          runId,
          workflowId: input.workflowId,
          status: "failed",
          steps: [],
          startedAt,
          finishedAt: new Date().toISOString(),
          fatalError: {
            code: "DUPLICATE_DISPATCH",
            message: `A run row already exists for ${runId}; skipping duplicate execution.`,
          },
          isTest,
          triggeredBy,
        };
      }
      preRunRowCreated = true;
    } catch (err) {
      log("execution.run.pre_run_row_failed", { error: (err as Error).message });
    }

    // Billing gate (Slice 1N). Atomic deduct via deduct_tasks_if_available;
    // refusal aborts before any handler runs so a quota-exhausted user never
    // produces side effects.
    //
    // COST-2A: test/dry-run runs skip deduction (the gate returns a skipped
    // outcome without touching the repo). Real runs keep the flat 1-task
    // charge unchanged.
    const gateOutcome = await executionBillingGate(workflow.userId, {
      testMode: isTest,
    });
    if (!gateOutcome.ok) {
      const finishedAt = new Date().toISOString();
      log("execution.run.fatal", {
        code: "BILLING_EXHAUSTED",
        used: gateOutcome.used,
        limit: gateOutcome.limit,
      });
      const fatalResult: RunResult = {
        runId,
        workflowId: input.workflowId,
        status: "failed",
        steps: [],
        startedAt,
        finishedAt,
        fatalError: {
          code: "BILLING_EXHAUSTED",
          message: `Task quota exhausted: ${gateOutcome.used}/${gateOutcome.limit} tasks used this period.`,
        },
        isTest,
        triggeredBy,
      };
      // COST-15C — the pre-run row already exists, so mark it failed by UPDATE
      // (not a duplicate INSERT). markWorkflowRunFailedBeforeExecution never
      // touches billing_status — no reservation was taken (flat mode). If the
      // pre-run row creation had failed, fall back to the terminal INSERT.
      const exhaustedClassification = classifyForPersistence(fatalResult);
      if (preRunRowCreated) {
        try {
          await workflowRunsRepo.markWorkflowRunFailedBeforeExecution({
            runId,
            fatalError: fatalResult.fatalError!,
            errorClassification: exhaustedClassification,
            finishedAt,
          });
        } catch (err) {
          log("execution.run.persist_failed", { error: (err as Error).message });
        }
        await notifyOnFailure(
          fatalResult,
          workflow.userId,
          workflow.name,
          log,
          exhaustedClassification,
        );
      } else {
        await persistRun(fatalResult, workflow.userId, workflow.name, input, log);
      }
      return fatalResult;
    }
    if ("skipped" in gateOutcome) {
      // COST-2A — test/dry-run run proceeded without consuming a task.
      log("execution.run.billing_skipped", { reason: gateOutcome.reason });
    }

    // The trigger event is exposed under both 'trigger' (canonical alias used
    // by templates like {{trigger.payload.text}}) and the trigger node's id
    // (so {{<triggerNodeId>.payload.text}} also works).
    const variables: Record<string, unknown> = {
      trigger: input.triggerEvent,
      [triggerNode.id]: input.triggerEvent,
    };

    const order = bfsExecutionOrder(triggerNode.id, def);
    // Outgoing-edge index keyed by `from` — used for label-aware activation
    // after each node executes. Built once per run; O(edges).
    const outgoingByNodeId = buildOutgoingEdgeMap(def.edges);
    // Label-aware traversal: a node executes only if it is reachable via at
    // least one ACTIVATED incoming edge. The trigger seeds the set. After
    // each successful execution, outgoing edges are filtered through
    // selectActivatedEdges() and their `to` ids are added. Nodes that
    // appear in `order` but never become reachable are emitted as
    // `status: "skipped"` step entries (no handler call, no variables).
    // See docs/slices/parity/engine-branching-plan.md §4.
    const reachable = new Set<string>([triggerNode.id]);
    const steps: RunStepResult[] = [];
    let runFailed = false;

    for (const node of order) {
      // Skip nodes that no activated edge has reached. The trigger is
      // always seeded as reachable, so the first iteration always runs.
      if (!reachable.has(node.id)) {
        steps.push({ nodeId: node.id, status: "skipped" });
        log("execution.step.skipped", { nodeId: node.id });
        continue;
      }

      if (node.kind === "trigger") {
        // The trigger doesn't execute — its payload is the seed. Record
        // it as succeeded for visibility in run history (Slice 1M).
        steps.push({
          nodeId: node.id,
          status: "succeeded",
          output: { event: input.triggerEvent } as Readonly<Record<string, unknown>>,
        });
        // Triggers have no handler and therefore no branchTaken; activate
        // outgoing edges under the §6.2.a permissive default (unlabeled
        // follow; labeled require explicit branchTaken, which a trigger
        // never emits, so labeled edges out of a trigger never activate).
        // A trigger by definition never produces an INVALID_BRANCH because
        // its synthetic branchTaken is `undefined`, not a string.
        const triggerEdges = outgoingByNodeId.get(node.id) ?? [];
        for (const e of selectActivatedEdges(triggerEdges, undefined).activated) {
          reachable.add(e);
        }
        continue;
      }

      // 1. Resolve config.
      let resolvedConfig: Readonly<Record<string, unknown>>;
      try {
        const resolved = this.deps.resolveStrict(node.config, { variables });
        resolvedConfig = (resolved ?? {}) as Readonly<Record<string, unknown>>;
      } catch (err) {
        if (err instanceof MissingVariableError) {
          steps.push({
            nodeId: node.id,
            status: "failed",
            error: {
              code: "MISSING_VARIABLE",
              message: err.message,
              details: { path: err.path, reason: err.reason },
            },
          });
          log("execution.step.failed", {
            nodeId: node.id,
            code: "MISSING_VARIABLE",
            path: err.path,
          });
          runFailed = true;
          break;
        }
        // Unexpected resolver error — treat as run-fatal.
        steps.push({
          nodeId: node.id,
          status: "failed",
          error: {
            code: "HANDLER_FAILED",
            message: `Resolver crashed: ${(err as Error).message}`,
          },
        });
        log("execution.step.failed", {
          nodeId: node.id,
          code: "HANDLER_FAILED",
          error: (err as Error).message,
        });
        runFailed = true;
        break;
      }

      // 2. Look up handler.
      const handler = getActionHandler(node.provider, node.type);
      if (!handler) {
        steps.push({
          nodeId: node.id,
          status: "failed",
          error: {
            code: "MISSING_HANDLER",
            message: `No handler registered for ${node.provider}:${node.type}.`,
          },
        });
        log("execution.step.failed", {
          nodeId: node.id,
          code: "MISSING_HANDLER",
          provider: node.provider,
          type: node.type,
        });
        runFailed = true;
        break;
      }

      // 3a. Slice 3.SEC-2 — test-mode pre-call gate.
      //
      // When the engine is running in test mode, consult the gate before
      // invoking the handler. Blocked actions are recorded as `succeeded`
      // steps with a deterministic mock output (testMode/actionSkipped/
      // reason/provider/type) and the engine moves on. Downstream nodes
      // see the mock output via `{{nodeId.testMode}}` etc. — if a
      // downstream node tries to read a real field like `{{nodeId.id}}`
      // the strict resolver surfaces MISSING_VARIABLE with the actual
      // path, which is a clearer signal than a fake id would be.
      //
      // Activated edges still propagate (the blocked step's outgoing
      // edges are activated as if it had executed normally); branchTaken
      // for blocked steps is `undefined`, matching the unlabeled-edge
      // semantics §6.2.a.
      const isTestMode = input.testMode === true;
      if (isTestMode) {
        const gateDecision = decideTestModeBlock(node.provider, node.type);
        if (gateDecision.blocked) {
          const mockOutput = buildTestModeMockOutput(
            node.provider,
            node.type,
            gateDecision.reason!,
          );
          const outgoingForBlocked = outgoingByNodeId.get(node.id) ?? [];
          for (const e of selectActivatedEdges(outgoingForBlocked, undefined).activated) {
            reachable.add(e);
          }
          variables[node.id] = mockOutput;
          steps.push({
            nodeId: node.id,
            status: "succeeded",
            output: mockOutput as unknown as Readonly<Record<string, unknown>>,
          });
          log("execution.step.test_mode_skipped", {
            nodeId: node.id,
            provider: node.provider,
            type: node.type,
            reason: gateDecision.reason,
          });
          continue;
        }
      }

      // 3. Invoke handler.
      try {
        const result = await handler({
          workflowId: input.workflowId,
          userId: workflow.userId,
          runId,
          nodeId: node.id,
          config: resolvedConfig,
          triggerEvent: input.triggerEvent,
          testMode: isTestMode,
        });

        // 4. Label-aware activation. Inspect outgoing edges and decide
        // which ones the handler's branchTaken activates. Catches
        // INVALID_BRANCH (handler returned a string label with no
        // matching outgoing edge) BEFORE recording the step as succeeded
        // — a malformed branch decision marks the node as failed.
        // See engine-branching-plan.md §4.1 + §6.1.
        const outgoing = outgoingByNodeId.get(node.id) ?? [];
        const activation = selectActivatedEdges(outgoing, result.branchTaken);
        if (activation.invalidBranch) {
          const message = `Handler returned branchTaken='${result.branchTaken}' but no outgoing edge has that label.`;
          steps.push({
            nodeId: node.id,
            status: "failed",
            error: {
              code: "INVALID_BRANCH",
              message,
              details: { branchTaken: result.branchTaken as string },
            },
          });
          log("execution.step.failed", {
            nodeId: node.id,
            code: "INVALID_BRANCH",
            branchTaken: result.branchTaken,
          });
          runFailed = true;
          break;
        }
        for (const next of activation.activated) {
          reachable.add(next);
        }

        variables[node.id] = result.output;
        steps.push({ nodeId: node.id, status: "succeeded", output: result.output });
        log("execution.step.succeeded", {
          nodeId: node.id,
          provider: node.provider,
          type: node.type,
        });
      } catch (err) {
        steps.push({
          nodeId: node.id,
          status: "failed",
          error: {
            code: "HANDLER_FAILED",
            message: (err as Error).message,
          },
        });
        log("execution.step.failed", {
          nodeId: node.id,
          code: "HANDLER_FAILED",
          error: (err as Error).message,
        });
        runFailed = true;
        break;
      }
    }

    const finishedAt = new Date().toISOString();
    const status: RunResult["status"] = runFailed ? "failed" : "succeeded";
    log("execution.run.finished", { status, stepCount: steps.length });

    const result: RunResult = {
      runId,
      workflowId: input.workflowId,
      status,
      steps,
      startedAt,
      finishedAt,
      isTest,
      triggeredBy,
    };

    // COST-3 (ledger-only): record the COST-2 estimate + actual cost (sum of
    // successful billable action nodes) for real runs. Live billing is
    // UNCHANGED — the flat 1/run gate above already charged. Test/dry-run
    // runs record nothing (usage = null). Recording is fail-open: a ledger
    // failure must never break execution.
    const usage: RunTaskUsage | null = isTest
      ? null
      : computeRunTaskUsage(def, steps);
    // COST-15C — finalize by UPDATING the pre-run row (created at start). Falls
    // back to a recordRun INSERT if the pre-run row was never created (create
    // failed earlier) so a run record is never lost. Flat billing already
    // charged above; this only writes the run row + cost columns.
    await finalizeRun(
      result,
      workflow.userId,
      workflow.name,
      input,
      log,
      usage,
      preRunRowCreated,
    );
    if (usage) {
      try {
        await recordRunActuals({
          runId,
          workflowId: input.workflowId,
          userId: workflow.userId,
          usage,
        });
      } catch (err) {
        log("execution.run.task_usage_record_failed", {
          error: (err as Error).message,
        });
      }
    }

    // COST-14/14C shadow mode (flag-gated, default off). Builds what
    // reserve/reconcile WOULD have billed vs the flat charge, LOGS it, and
    // PERSISTS it to billing_shadow_comparisons (COST-14C). NEVER mutates
    // balances, never calls reserve/reconcile RPCs; uses only the FINAL run
    // data (no pre-run row needed). Orchestration is fail-open inside
    // recordShadowComparison; the outer .catch is belt-and-suspenders so a
    // bug there can never break the run. Test runs have usage===null → never
    // shadow. Gated ONLY by the shadow flag (never the live billing flag).
    if (usage && isReserveReconcileShadowEnabled()) {
      await recordShadowComparison({
        userId: workflow.userId,
        workflowId: input.workflowId,
        workflowRunId: runId,
        workflowDefinition: def,
        flatChargedTasks: FLAT_TASKS_PER_RUN,
        actualUsage: usage,
        gate: "used" in gateOutcome
          ? { used: gateOutcome.used, limit: gateOutcome.limit }
          : {},
        persist: recordBillingShadowComparison,
        log,
      }).catch((err) =>
        log("execution.run.billing_shadow_failed", {
          error: (err as Error).message,
        }),
      );
    }

    return result;
  }
}

/**
 * Write the run row + humanized error_classification. Logs and swallows
 * persistence errors — the engine has done the work; a recordRun crash
 * shouldn't take down the dispatcher.
 *
 * The classification picks the first failed step's error (or the fatal
 * error when there are no steps). One classification per run is enough for
 * the UI's "show what went wrong" surface; per-step error details remain
 * available inside the steps[] payload for deeper diagnostics.
 */
async function persistRun(
  result: RunResult,
  userId: string,
  workflowName: string,
  input: RunWorkflowInput,
  log: (event: string, extra?: Record<string, unknown>) => void,
  usage?: RunTaskUsage | null,
): Promise<void> {
  const errorClassification = classifyForPersistence(result);
  try {
    await workflowRunsRepo.recordRun({
      runId: result.runId,
      workflowId: result.workflowId,
      userId,
      status: result.status,
      triggerNodeId: input.triggerNodeId,
      triggerEvent: input.triggerEvent,
      steps: result.steps,
      fatalError: result.fatalError ?? null,
      errorClassification,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      isTest: result.isTest,
      triggeredBy: result.triggeredBy,
      // COST-3 — null for test runs + fatal-before-execution paths.
      estimatedTaskCost: usage ? usage.estimatedTaskCost : null,
      actualTaskCost: usage ? usage.actualTaskCost : null,
      taskCostPolicyVersion: usage ? usage.policyVersion : null,
    });
  } catch (err) {
    log("execution.run.persist_failed", { error: (err as Error).message });
  }

  await notifyOnFailure(result, userId, workflowName, log, errorClassification);
}

/**
 * COST-15C — finalize a run by UPDATING the pre-run row created at start.
 * Falls back to a `recordRun` INSERT when the pre-run row was never created
 * (createWorkflowRunStart failed earlier) or has unexpectedly vanished, so a
 * run record is never lost. Never writes billing_status / reservation columns
 * (RPC-owned). Then runs the failure-notification fan-out. Fail-open: a
 * persistence error is logged and swallowed.
 */
async function finalizeRun(
  result: RunResult,
  userId: string,
  workflowName: string,
  input: RunWorkflowInput,
  log: (event: string, extra?: Record<string, unknown>) => void,
  usage: RunTaskUsage | null,
  preRunRowCreated: boolean,
): Promise<void> {
  const errorClassification = classifyForPersistence(result);
  try {
    let finalized = false;
    if (preRunRowCreated) {
      const outcome = await workflowRunsRepo.finalizeWorkflowRun({
        runId: result.runId,
        status: result.status,
        steps: result.steps,
        fatalError: result.fatalError ?? null,
        errorClassification,
        finishedAt: result.finishedAt,
        // Only real runs have usage → cost columns. Test runs leave them as the
        // create-time NULL (omitted ⇒ finalize does not overwrite).
        ...(usage
          ? {
              estimatedTaskCost: usage.estimatedTaskCost,
              actualTaskCost: usage.actualTaskCost,
              taskCostPolicyVersion: usage.policyVersion,
            }
          : {}),
      });
      finalized = outcome.finalized;
      if (!finalized) {
        log("execution.run.finalize_no_row", { runId: result.runId });
      }
    }
    if (!finalized) {
      // No pre-run row (create failed) or it vanished — INSERT so the record
      // isn't lost. This is the only path that can also INSERT at finalize.
      await workflowRunsRepo.recordRun({
        runId: result.runId,
        workflowId: result.workflowId,
        userId,
        status: result.status,
        triggerNodeId: input.triggerNodeId,
        triggerEvent: input.triggerEvent,
        steps: result.steps,
        fatalError: result.fatalError ?? null,
        errorClassification,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        isTest: result.isTest,
        triggeredBy: result.triggeredBy,
        estimatedTaskCost: usage ? usage.estimatedTaskCost : null,
        actualTaskCost: usage ? usage.actualTaskCost : null,
        taskCostPolicyVersion: usage ? usage.policyVersion : null,
      });
    }
  } catch (err) {
    log("execution.run.persist_failed", { error: (err as Error).message });
  }
  await notifyOnFailure(result, userId, workflowName, log, errorClassification);
}

/**
 * Workflow-failure notification fan-out — shared by the INSERT (persistRun),
 * UPDATE (finalizeRun), and mark-failed (BILLING_EXHAUSTED) paths. One
 * classified event → atomic dedup claim → enabled channels. Best-effort:
 * orchestrator failures are logged, never propagated (the run already persisted;
 * the user can still see it on the workflow detail page).
 */
async function notifyOnFailure(
  result: RunResult,
  userId: string,
  workflowName: string,
  log: (event: string, extra?: Record<string, unknown>) => void,
  errorClassification: HumanizedError | null,
): Promise<void> {
  if (result.status === "failed" && errorClassification) {
    try {
      const outcome = await notifyWorkflowFailure({
        userId,
        workflowId: result.workflowId,
        workflowName,
        runId: result.runId,
        errorClassification,
      });
      if (!outcome.claimed) {
        log("execution.run.notify_skipped", { reason: outcome.reason });
      }
    } catch (err) {
      log("execution.run.notify_failed", { error: (err as Error).message });
    }
  }
}

function classifyForPersistence(result: RunResult): HumanizedError | null {
  if (result.status === "succeeded") return null;

  // Prefer the first failed step (per-node specificity); fall back to the
  // run-level fatal when no step ran.
  const firstFailed = result.steps.find((s) => s.status === "failed");
  if (firstFailed?.error) {
    return humanizeActionError({
      code: firstFailed.error.code,
      message: firstFailed.error.message,
      ...(firstFailed.error.details !== undefined
        ? { details: firstFailed.error.details }
        : {}),
    });
  }
  if (result.fatalError) {
    return humanizeActionError({
      code: result.fatalError.code,
      message: result.fatalError.message,
    });
  }
  return null;
}

/**
 * Breadth-first execution order starting at the trigger node. The visited
 * set bounds traversal to one visit per node id, so a graph with cycles
 * still terminates (each node executes at most once per run).
 */
function bfsExecutionOrder(
  triggerNodeId: string,
  def: WorkflowDefinition,
): readonly WorkflowNode[] {
  const adjacency = buildAdjacency(def.edges);
  const nodesById = new Map(def.nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const order: WorkflowNode[] = [];
  const queue: string[] = [triggerNodeId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = nodesById.get(id);
    if (node) order.push(node);
    for (const next of adjacency.get(id) ?? []) {
      if (!visited.has(next)) queue.push(next);
    }
  }
  return order;
}

function buildAdjacency(
  edges: readonly WorkflowEdge[],
): ReadonlyMap<string, readonly string[]> {
  const map = new Map<string, string[]>();
  for (const edge of edges) {
    let bucket = map.get(edge.from);
    if (!bucket) {
      bucket = [];
      map.set(edge.from, bucket);
    }
    bucket.push(edge.to);
  }
  return map;
}
