import { randomUUID } from "node:crypto";
import { MissingVariableError } from "@/workflow-engine/variables/resolveValue";
import * as workflowsRepo from "@/repositories/workflows";
import * as workflowRunsRepo from "@/repositories/workflowRuns";
import {
  executionBillingGate,
  type BillingGateOutcome,
} from "@/services/billing/executionBillingGate";
import {
  computeRunTaskUsage,
  recordRunActuals,
  type RunTaskUsage,
} from "@/services/billing/taskUsageRecorder";
import {
  isReserveReconcileShadowEnabled,
  isReserveReconcileEnabled,
} from "@/services/billing/billingFeatureFlags";
import {
  createBillingReservation,
  reconcileBillingReservation,
} from "@/services/billing/reserveReconcileBilling";
import { estimateWorkflowTaskCost } from "@/services/billing/workflowCostEstimator";
import { recordShadowComparison } from "@/services/billing/reserveReconcileShadowMode";
import { recordBillingShadowComparison } from "@/services/billing/billingShadowComparisons";
import {
  buildOutgoingEdgeMap,
  selectActivatedEdges,
} from "./branching";
import { getActionHandler } from "./handlers/_registry";
import {
  buildTestModeMockOutput,
  decideTestModeBlock,
} from "./testModeGate";
import {
  classifyForPersistence,
  finalizeRun,
  notifyOnFailure,
  persistRun,
} from "./runPersistence";
import { bfsExecutionOrder } from "./executionOrder";
import type {
  EngineDependencies,
  RunFailureCode,
  RunResult,
  RunStepResult,
  RunTriggerSource,
  RunWorkflowInput,
} from "./engineTypes";
// Re-export the engine types so external callers can keep using
// `import { RunResult, ... } from "@/services/execution/engine"` (no
// caller-site change needed). The actual definitions live in
// `engineTypes.ts` for max-lines lint hygiene.
export type {
  EngineDependencies,
  RunFailureCode,
  RunResult,
  RunStepResult,
  RunTriggerSource,
  RunWorkflowInput,
} from "./engineTypes";

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
      await persistRun(fatalResult, workflow.createdByUserId, workflow.name, input, log);
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
        userId: workflow.createdByUserId,
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

    // COST-15C/15H — pre-execution failure helper. Marks the (already-created)
    // pre-run row failed by UPDATE; falls back to a terminal INSERT if the
    // pre-run row wasn't created. Never writes billing_status (the reserve RPC
    // owns that). Used by both the flat and reserve billing-refusal paths so a
    // quota-exhausted user never produces side effects.
    const failBeforeExecution = async (
      code: RunFailureCode,
      message: string,
    ): Promise<RunResult> => {
      const finishedAt = new Date().toISOString();
      const fatalResult: RunResult = {
        runId,
        workflowId: input.workflowId,
        status: "failed",
        steps: [],
        startedAt,
        finishedAt,
        fatalError: { code, message },
        isTest,
        triggeredBy,
      };
      const classification = classifyForPersistence(fatalResult);
      if (preRunRowCreated) {
        try {
          await workflowRunsRepo.markWorkflowRunFailedBeforeExecution({
            runId,
            fatalError: { code, message },
            errorClassification: classification,
            finishedAt,
          });
        } catch (err) {
          log("execution.run.persist_failed", { error: (err as Error).message });
        }
        await notifyOnFailure(fatalResult, workflow.createdByUserId, workflow.name, log, classification);
      } else {
        await persistRun(fatalResult, workflow.createdByUserId, workflow.name, input, log);
      }
      return fatalResult;
    };

    // COST-15H — billing path selection (pre-launch). The global flag
    // ENABLE_RESERVE_RECONCILE_BILLING is the ONLY switch (no allowlist — the
    // app is pre-launch with no external users). Flag off → flat
    // deduct_tasks_if_available (Slice 1N, the rollback path). Flag on (real
    // run) → reserve/reconcile. Test/dry-run runs skip billing in BOTH modes
    // (COST-2A) because reserve mode requires `!isTest`.
    //
    // `gateOutcome` is only set in flat mode (the shadow block reads its
    // counters); `reservationActive` tracks whether a hold was placed so the
    // post-execution block reconciles it.
    const reserveReconcileMode = !isTest && isReserveReconcileEnabled();
    let gateOutcome: BillingGateOutcome | null = null;
    let reservationActive = false;

    if (reserveReconcileMode) {
      // Reserve attaches to the pre-run row (the RPC keys on it). In flat mode a
      // create failure is fail-OPEN; in reserve mode it is fail-CLOSED — never
      // run billable side effects without a confirmed, durable hold.
      if (!preRunRowCreated) {
        log("execution.run.fatal", {
          code: "BILLING_EXHAUSTED",
          reason: "pre_run_row_missing",
        });
        return failBeforeExecution(
          "BILLING_EXHAUSTED",
          "Could not reserve tasks: the run row was not created.",
        );
      }
      const estimatedTasks = estimateWorkflowTaskCost(def).estimatedTasksPerRun;
      const reservation = await createBillingReservation({
        userId: workflow.createdByUserId,
        workflowId: input.workflowId,
        workflowRunId: runId,
        estimatedTasks,
      });
      if (!reservation.ok) {
        // insufficient_tasks / run_not_found / rpc_error → abort BEFORE any
        // handler runs. The reserve RPC already stamped billing_status='failed'
        // on insufficient; failBeforeExecution sets the run status to failed.
        log("execution.run.fatal", {
          code: "BILLING_EXHAUSTED",
          reason: reservation.reason,
          reserved: reservation.reserved,
          limit: reservation.limit,
          ...(reservation.error ? { error: reservation.error } : {}),
        });
        return failBeforeExecution(
          "BILLING_EXHAUSTED",
          reservation.reason === "insufficient_tasks"
            ? `Task quota exhausted: cannot reserve ${estimatedTasks} task(s) for this run.`
            : `Could not reserve tasks for this run (${reservation.reason}).`,
        );
      }
      reservationActive = true;
      log("execution.run.billing_reserved", {
        amount: reservation.amount,
        reserved: reservation.reserved,
        limit: reservation.limit,
        reason: reservation.reason,
      });
    } else {
      // Flat path (Slice 1N) — unchanged. Test/dry-run runs return a skipped
      // outcome without touching the balance (COST-2A).
      gateOutcome = await executionBillingGate(workflow.createdByUserId, {
        testMode: isTest,
      });
      if (!gateOutcome.ok) {
        log("execution.run.fatal", {
          code: "BILLING_EXHAUSTED",
          used: gateOutcome.used,
          limit: gateOutcome.limit,
        });
        return failBeforeExecution(
          "BILLING_EXHAUSTED",
          `Task quota exhausted: ${gateOutcome.used}/${gateOutcome.limit} tasks used this period.`,
        );
      }
      if ("skipped" in gateOutcome) {
        log("execution.run.billing_skipped", { reason: gateOutcome.reason });
      }
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
          userId: workflow.createdByUserId,
          accountId: workflow.accountId,
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

    // COST-15H — reconcile the reservation (reserve mode only), BEFORE finalize
    // so the BALANCE is correct even if finalize later fails. reconcile charges
    // min(actual, reserved) and refunds the rest. `actual` counts only
    // SUCCESSFUL billable nodes, so a partial/total failure refunds the unused
    // portion — and reconcile(0) is the release-equivalent for a run where
    // nothing billable succeeded. Reserve mode always reaches here after a
    // successful reserve (execution always follows), so no separate release is
    // needed in the normal flow; an engine crash between reserve and here is the
    // expiry sweep's job. The service NEVER throws (returns ok:false on RPC
    // error); a failure is logged loudly, not hidden.
    if (reservationActive) {
      const actualTasks = usage ? usage.actualTaskCost : 0;
      const reconcile = await reconcileBillingReservation({
        userId: workflow.createdByUserId,
        workflowRunId: runId,
        actualTasks,
      });
      if (reconcile.ok) {
        log("execution.run.billing_reconciled", {
          charged: reconcile.charged,
          refunded: reconcile.refunded,
          reason: reconcile.reason,
        });
      } else {
        log("execution.run.billing_reconcile_failed", {
          reason: reconcile.reason,
          ...(reconcile.error ? { error: reconcile.error } : {}),
        });
      }
    }

    // COST-15C — finalize by UPDATING the pre-run row (created at start). Falls
    // back to a recordRun INSERT if the pre-run row was never created (create
    // failed earlier) so a run record is never lost. In reserve mode the charge
    // already settled (above); this only writes the run row + cost columns.
    await finalizeRun(
      result,
      workflow.createdByUserId,
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
          userId: workflow.createdByUserId,
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
        userId: workflow.createdByUserId,
        workflowId: input.workflowId,
        workflowRunId: runId,
        workflowDefinition: def,
        flatChargedTasks: FLAT_TASKS_PER_RUN,
        actualUsage: usage,
        // COST-15H — gateOutcome is null in reserve mode; shadow then has no
        // flat counters to fold (flatChargedTasks stays the hypothetical 1).
        gate:
          gateOutcome && "used" in gateOutcome
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
