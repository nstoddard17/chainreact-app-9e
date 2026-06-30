/**
 * Trigger-smoke harness — Microsoft Excel POLLING trigger dispatch path (Lane B).
 *
 * Proves a `microsoft-excel:new_worksheet` polling trigger fires through the REAL
 * polling dispatch machinery with the baseline-first invariant intact:
 *   create smoke workbook (1 sheet) → activate (the real activation hook seeds the
 *   worksheet-list snapshot) → FIRST poll: pre-existing sheet fires NOTHING
 *   (baseline-first) → add ONE worksheet (certified create_worksheet) → SECOND
 *   poll: the new sheet fires exactly ONE run via the handler's enqueueRun →
 *   drain the durable run → terminal 'succeeded' with a verifiable payload (the
 *   new worksheet name) → whole-workbook cleanup (OneDrive delete_item) → 0 leaked.
 *
 * WHY the per-trigger poll handler, not the global `runPollingTriggers()`:
 * `new_worksheet` is selected because it reuses the certified Excel/OneDrive
 * smoke-workbook bootstrap + a certified safe write (create_worksheet) for the
 * post-baseline change, and its diff is a simple worksheet-name set. The handler's
 * `poll()` (read → diff vs snapshot → enqueueRun) IS the real polling dispatch
 * path — the same function the cron orchestrator's `runOne` invokes. We drive it
 * SCOPED to this smoke trigger rather than the global `runPollingTriggers()`,
 * because that global shell polls + can fire EVERY due polling workflow across all
 * accounts on the shared dev DB (a real multi-account side effect). Selection /
 * interval / state gating is the only thing bypassed — not the dispatch.
 *
 * Every DB / engine / provider touchpoint is behind injected `ExcelPollingSmokeDeps`
 * so this orchestrator is fully unit-testable with fakes; real wiring lives in
 * excelPollingSmokeDeps.ts and only runs in the gated dev integration test.
 */
import {
  WorkflowDefinitionSchema,
  type WorkflowDefinition,
} from "@/contracts/workflowDefinition";

export const EXCEL_POLLING_SMOKE_TRIGGER_NODE_ID = "smoke-excel-newworksheet-trigger";
export const EXCEL_POLLING_SMOKE_ACTION_NODE_ID = "smoke-noop-action";

export interface ExcelPollingSmokeWorkflow {
  readonly definition: WorkflowDefinition;
  readonly triggerNodeId: string;
  readonly actionNodeId: string;
  readonly name: string;
}

/**
 * Build the smoke workflow: a `microsoft-excel:new_worksheet` polling trigger
 * (watching the smoke workbook) → a single safe terminal `native:if_then_condition`
 * no-op (unary is_falsy on a truthy literal + onFalse:"skip" → null branch →
 * terminal 'succeeded', zero external effect). The trigger config carries the
 * runtime `workbookId` (only known after the workbook is uploaded).
 */
export function buildExcelNewWorksheetSmokeWorkflow(
  workbookId: string,
): ExcelPollingSmokeWorkflow {
  const definition = WorkflowDefinitionSchema.parse({
    nodes: [
      {
        id: EXCEL_POLLING_SMOKE_TRIGGER_NODE_ID,
        kind: "trigger",
        provider: "microsoft-excel",
        type: "new_worksheet",
        config: { workbookId },
        position: { x: 0, y: 0 },
      },
      {
        id: EXCEL_POLLING_SMOKE_ACTION_NODE_ID,
        kind: "action",
        provider: "native",
        type: "if_then_condition",
        config: { input: "smoke", operator: "is_falsy", onFalse: "skip" },
        position: { x: 0, y: 160 },
      },
    ],
    edges: [
      {
        id: "smoke-excel-poll-edge",
        from: EXCEL_POLLING_SMOKE_TRIGGER_NODE_ID,
        to: EXCEL_POLLING_SMOKE_ACTION_NODE_ID,
      },
    ],
  });
  return {
    definition,
    triggerNodeId: EXCEL_POLLING_SMOKE_TRIGGER_NODE_ID,
    actionNodeId: EXCEL_POLLING_SMOKE_ACTION_NODE_ID,
    name: "trigger-smoke:microsoft-excel:new_worksheet",
  };
}

/** A persisted run, plus the new-worksheet name carried on its trigger event. */
export interface ExcelPollingRun {
  readonly runId: string;
  readonly status: "succeeded" | "failed" | "running" | "queued" | null;
  /** trigger_event.payload.worksheetName — the verifiable dispatch payload. */
  readonly triggerWorksheetName: string | null;
}

/** Injected seams. Defaults wired in excelPollingSmokeDeps.ts; fakes in tests. */
export interface ExcelPollingSmokeDeps {
  /** Upload the frozen minimal .xlsx (smoke-owned). Returns the drive-item id. */
  createSmokeWorkbook(): Promise<{ workbookId: string }>;
  /** Persist an ACTIVE smoke workflow (draft fallback for live runs). */
  createActiveSmokeWorkflow(
    workflow: ExcelPollingSmokeWorkflow,
  ): Promise<{ workflowId: string }>;
  /**
   * Arm the polling trigger via the REAL lifecycle (registerWorkflowTriggers →
   * the new_worksheet activation hook seeds the worksheet-name snapshot). Returns
   * the seeded snapshot names (to prove baseline was captured, not the change).
   */
  armPollingTrigger(input: {
    workflowId: string;
    triggerNodeId: string;
  }): Promise<{ snapshotNames: readonly string[] }>;
  /**
   * Run the REAL per-trigger Excel poll handler scoped to this smoke trigger
   * (read worksheets → diff vs snapshot → enqueueRun on new). Not the global
   * orchestrator — see module header.
   */
  poll(input: { workflowId: string; triggerNodeId: string }): Promise<void>;
  /** Add ONE worksheet to the smoke workbook (certified create_worksheet). */
  addWorksheet(workbookId: string): Promise<{ worksheetName: string }>;
  /** All runs for the workflow (incl. non-terminal), newest first. */
  listRuns(workflowId: string): Promise<readonly ExcelPollingRun[]>;
  /** Drain a queued run via the real durable-queue processor. */
  drainRun(runId: string): Promise<void>;
  /** Re-read one run's terminal projection. */
  readRun(runId: string): Promise<ExcelPollingRun | null>;
  /** Best-effort: unregister triggers + delete workbook + soft-delete workflow. */
  cleanup(input: { workflowId: string; workbookId: string }): Promise<void>;
  /** Sleep between bounded after-poll retries. Real setTimeout live; instant in tests. */
  sleep(ms: number): Promise<void>;
}

export interface ExcelPollingSmokeOptions {
  /**
   * Bounded re-poll attempts for the post-baseline change. Microsoft Graph's
   * workbook API has a brief create→read propagation lag, so the new worksheet
   * may not be visible to the first poll after create_worksheet. Each poll only
   * advances the snapshot to what it actually read, so re-polling is idempotent
   * (it fires exactly once, on the poll that first observes the new sheet).
   * Default 1 (unit tests with no lag); the live run passes a higher value.
   */
  readonly afterPollAttempts?: number;
  /** Delay between after-poll attempts. Default 0. */
  readonly afterPollSleepMs?: number;
}

export interface ExcelPollingSmokeResult {
  readonly outcome: "pass" | "fail";
  readonly reason: string | null;
  readonly baselineRunCount: number;
  readonly afterRunCount: number;
  readonly terminalStatus: ExcelPollingRun["status"] | null;
  /** The new worksheet name observed on the fired run's payload (verifiable). */
  readonly firedWorksheetName: string | null;
  /** The worksheet name we actually added (must equal firedWorksheetName). */
  readonly addedWorksheetName: string | null;
  readonly workflowId: string | null;
  readonly workbookId: string | null;
  readonly cleaned: boolean;
}

export async function runExcelNewWorksheetSmoke(
  deps: ExcelPollingSmokeDeps,
  opts: ExcelPollingSmokeOptions = {},
): Promise<ExcelPollingSmokeResult> {
  const ref: { workflowId: string | null; workbookId: string | null } = {
    workflowId: null,
    workbookId: null,
  };
  let result: ExcelPollingSmokeResult;
  try {
    result = await runExcelPollingCore(deps, ref, opts);
  } catch (err) {
    result = {
      outcome: "fail",
      reason: (err as Error).message,
      baselineRunCount: 0,
      afterRunCount: 0,
      terminalStatus: null,
      firedWorksheetName: null,
      addedWorksheetName: null,
      workflowId: ref.workflowId,
      workbookId: ref.workbookId,
      cleaned: false,
    };
  } finally {
    if (ref.workflowId || ref.workbookId) {
      const cleaned = await deps
        .cleanup({ workflowId: ref.workflowId ?? "", workbookId: ref.workbookId ?? "" })
        .then(() => true)
        .catch(() => false);
      result = { ...result!, cleaned };
    }
  }
  return result!;
}

async function runExcelPollingCore(
  deps: ExcelPollingSmokeDeps,
  ref: { workflowId: string | null; workbookId: string | null },
  opts: ExcelPollingSmokeOptions,
): Promise<ExcelPollingSmokeResult> {
  const fail = (
    reason: string,
    extra: Partial<ExcelPollingSmokeResult> = {},
  ): ExcelPollingSmokeResult => ({
    outcome: "fail",
    reason,
    baselineRunCount: 0,
    afterRunCount: 0,
    terminalStatus: null,
    firedWorksheetName: null,
    addedWorksheetName: null,
    workflowId: ref.workflowId,
    workbookId: ref.workbookId,
    cleaned: false,
    ...extra,
  });

  // 1. Smoke-owned workbook (one seeded sheet).
  const { workbookId } = await deps.createSmokeWorkbook();
  ref.workbookId = workbookId;

  // 2. Active workflow watching that workbook.
  const workflow = buildExcelNewWorksheetSmokeWorkflow(workbookId);
  const { workflowId } = await deps.createActiveSmokeWorkflow(workflow);
  ref.workflowId = workflowId;

  // 3. Arm via the real lifecycle → activation seeds the baseline snapshot.
  const { snapshotNames } = await deps.armPollingTrigger({
    workflowId,
    triggerNodeId: workflow.triggerNodeId,
  });
  if (snapshotNames.length === 0) {
    return fail("activation seeded an empty worksheet snapshot (expected ≥1 baseline sheet)");
  }

  // 4. FIRST poll — baseline-first: pre-existing sheets must NOT fire.
  await deps.poll({ workflowId, triggerNodeId: workflow.triggerNodeId });
  const baselineRuns = await deps.listRuns(workflowId);
  if (baselineRuns.length !== 0) {
    return fail(
      `baseline violation: ${baselineRuns.length} run(s) fired from pre-existing state before any change`,
      { baselineRunCount: baselineRuns.length },
    );
  }

  // 5. Apply ONE post-baseline smoke-owned change.
  const { worksheetName } = await deps.addWorksheet(workbookId);

  // 6. SECOND poll — the new worksheet must fire exactly one run. Bounded re-poll
  // to absorb Graph's create→read propagation lag (idempotent: a poll that doesn't
  // yet see the new sheet only re-persists the same snapshot; the poll that first
  // observes it fires exactly once).
  const attempts = Math.max(1, opts.afterPollAttempts ?? 1);
  const sleepMs = Math.max(0, opts.afterPollSleepMs ?? 0);
  let afterRuns: readonly ExcelPollingRun[] = [];
  for (let i = 0; i < attempts; i += 1) {
    await deps.poll({ workflowId, triggerNodeId: workflow.triggerNodeId });
    afterRuns = await deps.listRuns(workflowId);
    if (afterRuns.length >= 1) break;
    if (i < attempts - 1 && sleepMs > 0) await deps.sleep(sleepMs);
  }
  if (afterRuns.length !== 1) {
    return fail(`expected exactly 1 run after the new worksheet, got ${afterRuns.length}`, {
      afterRunCount: afterRuns.length,
      addedWorksheetName: worksheetName,
    });
  }

  // 7. Verifiable payload — the fired run must carry the worksheet we added.
  const fired = afterRuns[0]!;
  if (fired.triggerWorksheetName !== worksheetName) {
    return fail(
      `fired run payload worksheet "${fired.triggerWorksheetName ?? "null"}" != added "${worksheetName}"`,
      { afterRunCount: 1, firedWorksheetName: fired.triggerWorksheetName, addedWorksheetName: worksheetName },
    );
  }

  // 8. Drain → terminal succeeded.
  await deps.drainRun(fired.runId);
  const terminal = await deps.readRun(fired.runId);
  const status = terminal?.status ?? null;
  if (status !== "succeeded") {
    return fail(`fired run did not reach terminal 'succeeded' (got ${status ?? "null"})`, {
      afterRunCount: 1,
      terminalStatus: status,
      firedWorksheetName: fired.triggerWorksheetName,
      addedWorksheetName: worksheetName,
    });
  }

  return {
    outcome: "pass",
    reason: null,
    baselineRunCount: 0,
    afterRunCount: 1,
    terminalStatus: "succeeded",
    firedWorksheetName: fired.triggerWorksheetName,
    addedWorksheetName: worksheetName,
    workflowId,
    workbookId,
    cleaned: false,
  };
}
