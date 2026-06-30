/**
 * Trigger-smoke harness — native SCHEDULED trigger dispatch path (first slice).
 *
 * Sibling to the action-smoke `workflowRun.ts` orchestrator, but for the trigger
 * side: it proves a `native:schedule.fired` trigger actually fires through the
 * REAL scheduled-trigger dispatch path (activation arms `nextFireAt` → the cron
 * orchestrator `runScheduledTriggers` fires when due → `dispatchTriggerEvent`
 * enqueues a durable run → the run reaches a verifiable terminal state), and that
 * the baseline-first invariant holds (a tick BEFORE `nextFireAt` fires nothing).
 *
 * This is NOT the manual run-now path — manual.run bypasses dispatch. It exercises
 * `dispatchTriggerEvent` via the scheduled cron orchestrator.
 *
 * Every DB / engine / cron touchpoint is behind an injected `ScheduledSmokeDeps`
 * so this orchestrator is fully unit-testable with fakes; the real wiring lives in
 * `scheduledSmokeDeps.ts` and only runs in the gated dev integration test.
 *
 * Safety: the cron orchestrator is GLOBAL (it fires every due scheduled workflow,
 * across accounts). The real deps therefore expose `countOtherDueScheduled(now)`
 * so the live caller can refuse to drive the global orchestrator when any OTHER
 * scheduled workflow would be due at the injected instant — firing only happens
 * when this smoke's row is the sole due row. No provider, no external resource,
 * no send/broadcast: the workflow is `native:schedule.fired → native:if_then_condition`.
 */
import {
  WorkflowDefinitionSchema,
  type WorkflowDefinition,
} from "@/contracts/workflowDefinition";
import {
  SCHEDULED_TRIGGER_EVENT_TYPE,
  SCHEDULED_TRIGGER_PROVIDER,
} from "@/integrations/native/triggers/scheduledTrigger";

export const SCHEDULED_SMOKE_TRIGGER_NODE_ID = "smoke-schedule-trigger";
export const SCHEDULED_SMOKE_ACTION_NODE_ID = "smoke-noop-action";

/** A minute-boundary cron — the soonest recurring fire, so the test is fast. */
export const SCHEDULED_SMOKE_CRON = "* * * * *";

export interface ScheduledSmokeWorkflow {
  readonly definition: WorkflowDefinition;
  readonly triggerNodeId: string;
  readonly actionNodeId: string;
  readonly name: string;
}

/**
 * Build the minimal scheduled-trigger workflow: a `native:schedule.fired` trigger
 * (with a 1-minute cron) wired to a single safe, terminal, side-effect-free
 * `native:if_then_condition` action (a pure unary `is_truthy` eval — engine-safe
 * as a single terminal node, no external call, no provider). Pure +
 * schema-validated so an invalid shape fails here, not deep in the engine.
 */
export function buildScheduledSmokeDefinition(
  cronExpression: string = SCHEDULED_SMOKE_CRON,
): ScheduledSmokeWorkflow {
  const definition = WorkflowDefinitionSchema.parse({
    nodes: [
      {
        id: SCHEDULED_SMOKE_TRIGGER_NODE_ID,
        kind: "trigger",
        provider: SCHEDULED_TRIGGER_PROVIDER,
        type: SCHEDULED_TRIGGER_EVENT_TYPE,
        config: { cronExpression },
        position: { x: 0, y: 0 },
      },
      {
        id: SCHEDULED_SMOKE_ACTION_NODE_ID,
        kind: "action",
        provider: "native",
        type: "if_then_condition",
        // Engine-safe terminal no-op with zero external effect: a unary is_falsy
        // on a TRUTHY literal evaluates FALSE, and onFalse:"skip" makes the engine
        // take the NULL branch (branchTaken=null) — no downstream edge required, so
        // the run terminates 'succeeded'. (is_truthy/onFalse:"branch" would route to
        // a "true" branch that has no edge → INVALID_BRANCH.)
        config: { input: "smoke", operator: "is_falsy", onFalse: "skip" },
        position: { x: 0, y: 160 },
      },
    ],
    edges: [
      {
        id: "smoke-schedule-edge",
        from: SCHEDULED_SMOKE_TRIGGER_NODE_ID,
        to: SCHEDULED_SMOKE_ACTION_NODE_ID,
      },
    ],
  });
  return {
    definition,
    triggerNodeId: SCHEDULED_SMOKE_TRIGGER_NODE_ID,
    actionNodeId: SCHEDULED_SMOKE_ACTION_NODE_ID,
    name: "trigger-smoke:native:schedule.fired",
  };
}

/** Terminal-state projection of a persisted run — SAFE fields only. */
export interface ScheduledSmokeRun {
  readonly runId: string;
  readonly status: "succeeded" | "failed" | "running" | "queued" | null;
}

/** Injected seams. Defaults wired in scheduledSmokeDeps.ts; fakes in tests. */
export interface ScheduledSmokeDeps {
  /**
   * Persist an ACTIVE smoke workflow (state="active", draft_definition set,
   * active_revision_id null → live runs fall back to the draft). Returns its id.
   */
  createActiveSmokeWorkflow(
    workflow: ScheduledSmokeWorkflow,
  ): Promise<{ workflowId: string }>;
  /**
   * Arm the scheduled trigger via the REAL lifecycle (registerWorkflowTriggers →
   * native activation computes the first nextFireAt → trigger_resources upsert).
   * Returns the armed `nextFireAt` as epoch ms (read back from the persisted row).
   */
  armScheduledTrigger(input: {
    workflowId: string;
    triggerNodeId: string;
  }): Promise<{ nextFireAtMs: number }>;
  /**
   * How many OTHER (not this workflow) active `native:schedule.fired` rows would
   * be due at `nowMs` (nextFireAt <= nowMs). Used to keep the GLOBAL orchestrator
   * blast radius at zero before driving it live.
   */
  countOtherDueScheduled(input: {
    nowMs: number;
    excludeWorkflowId: string;
  }): Promise<number>;
  /** Run the real scheduled-trigger cron orchestrator with an injected `now`. */
  runOrchestrator(nowMs: number): Promise<{ fired: number }>;
  /** All runs for the workflow (incl. non-terminal queued/running). */
  listRuns(workflowId: string): Promise<readonly ScheduledSmokeRun[]>;
  /** Drain a queued run to terminal via the real durable-queue processor. */
  drainRun(runId: string): Promise<void>;
  /** Re-read one run's terminal projection. */
  readRun(runId: string): Promise<ScheduledSmokeRun | null>;
  /** Best-effort: unregister triggers + soft-delete the smoke workflow. */
  cleanup(workflowId: string): Promise<void>;
}

export interface ScheduledSmokeResult {
  readonly outcome: "pass" | "fail" | "skip";
  readonly reason: string | null;
  /** Runs for the workflow after the BEFORE-nextFireAt tick (must be 0). */
  readonly baselineRunCount: number;
  /** Runs for the workflow after the AFTER-nextFireAt tick (must be 1). */
  readonly afterRunCount: number;
  /** Terminal status of the single fired run. */
  readonly terminalStatus: ScheduledSmokeRun["status"] | null;
  readonly workflowId: string | null;
  readonly cleaned: boolean;
}

/**
 * Drive the full scheduled-trigger dispatch proof. Never throws — every failure
 * mode becomes a structured result. Cleanup always runs.
 *
 * Steps (mirrors the task contract):
 *   1. create active workflow {schedule.fired → no-op action}.
 *   2. arm via the real lifecycle → read nextFireAt.
 *   3. (safety) refuse to drive the global orchestrator if any OTHER scheduled
 *      row is due at nowAfter → skip (not fake).
 *   4. tick BEFORE nextFireAt → assert 0 runs for this workflow (baseline-first).
 *   5. tick AT nextFireAt → assert exactly 1 run for this workflow.
 *   6. drain it → assert terminal "succeeded".
 *   7. cleanup (unregister + soft-delete).
 */
export async function runScheduledTriggerSmoke(
  deps: ScheduledSmokeDeps,
): Promise<ScheduledSmokeResult> {
  // The created workflow id is surfaced via this ref so cleanup runs even when
  // the core throws after creating the workflow. Single `return` after the
  // try/finally so the finally's `cleaned` actually reaches the caller (a
  // `return` inside `try` captures the value before `finally` runs).
  const ref: { workflowId: string | null } = { workflowId: null };
  let result: ScheduledSmokeResult;
  try {
    result = await runScheduledSmokeCore(deps, ref);
  } catch (err) {
    result = {
      outcome: "fail",
      reason: (err as Error).message,
      baselineRunCount: 0,
      afterRunCount: 0,
      terminalStatus: null,
      workflowId: ref.workflowId,
      cleaned: false,
    };
  } finally {
    if (ref.workflowId) {
      const cleaned = await deps
        .cleanup(ref.workflowId)
        .then(() => true)
        .catch(() => false);
      result = { ...result!, cleaned };
    }
  }
  return result!;
}

async function runScheduledSmokeCore(
  deps: ScheduledSmokeDeps,
  ref: { workflowId: string | null },
): Promise<ScheduledSmokeResult> {
  const fail = (reason: string, extra: Partial<ScheduledSmokeResult> = {}): ScheduledSmokeResult => ({
    outcome: "fail",
    reason,
    baselineRunCount: 0,
    afterRunCount: 0,
    terminalStatus: null,
    workflowId: ref.workflowId,
    cleaned: false,
    ...extra,
  });

  const workflow = buildScheduledSmokeDefinition();
  const { workflowId } = await deps.createActiveSmokeWorkflow(workflow);
  ref.workflowId = workflowId;

  const { nextFireAtMs } = await deps.armScheduledTrigger({
    workflowId,
    triggerNodeId: workflow.triggerNodeId,
  });
  if (!Number.isFinite(nextFireAtMs)) {
    return fail("activation produced no nextFireAt");
  }

  // nowAfter is the instant we drive the orchestrator with for the firing tick.
  const nowAfterMs = nextFireAtMs;
  const nowBeforeMs = nextFireAtMs - 60_000; // a full minute before the fire.

  // Safety: the orchestrator is global. If ANY other scheduled workflow would be
  // due at nowAfter, refuse to drive it (would fire others) — skip + report.
  const otherDue = await deps.countOtherDueScheduled({
    nowMs: nowAfterMs,
    excludeWorkflowId: workflowId,
  });
  if (otherDue > 0) {
    return {
      ...fail(
        `global scheduled orchestrator unsafe to drive live: ${otherDue} other scheduled workflow(s) due at the injected instant`,
      ),
      outcome: "skip",
    };
  }

  // 4. BEFORE tick — must NOT fire this workflow (baseline-first invariant).
  await deps.runOrchestrator(nowBeforeMs);
  const baselineRuns = await deps.listRuns(workflowId);
  if (baselineRuns.length !== 0) {
    return fail(
      `baseline violation: ${baselineRuns.length} run(s) fired before nextFireAt`,
      { baselineRunCount: baselineRuns.length },
    );
  }

  // 5. AT/AFTER tick — must fire exactly one run for this workflow.
  await deps.runOrchestrator(nowAfterMs);
  const afterRuns = await deps.listRuns(workflowId);
  if (afterRuns.length !== 1) {
    return fail(`expected exactly 1 run after nextFireAt, got ${afterRuns.length}`, {
      afterRunCount: afterRuns.length,
    });
  }

  // 6. Drain the queued run to terminal and verify success.
  const fired = afterRuns[0]!;
  await deps.drainRun(fired.runId);
  const terminal = await deps.readRun(fired.runId);
  const status = terminal?.status ?? null;
  if (status !== "succeeded") {
    return fail(
      `fired run did not reach terminal 'succeeded' (got ${status ?? "null"})`,
      { afterRunCount: 1, terminalStatus: status },
    );
  }

  return {
    outcome: "pass",
    reason: null,
    baselineRunCount: 0,
    afterRunCount: 1,
    terminalStatus: "succeeded",
    workflowId,
    cleaned: false,
  };
}
