/**
 * Trigger-smoke harness — Microsoft Excel POLLING trigger dispatch path (Lane B).
 *
 * One spec-driven orchestrator covering the Excel CREATE-polling family:
 *   - microsoft-excel:new_worksheet  (change: add_worksheet; identity: worksheetName)
 *   - microsoft-excel:new_row        (change: add_row;        identity: row marker value)
 *   - microsoft-excel:new_table_row  (change: add_table_row;  identity: table-row marker)
 *
 * Each proves the real polling dispatch path with baseline-first intact:
 *   create smoke workbook → (optional) seed a baseline row → activate (the real
 *   activation hook seeds the snapshot) → FIRST poll: pre-existing state fires
 *   NOTHING (baseline-first) → apply ONE certified safe add → re-poll (bounded, for
 *   Graph create→read lag) → exactly ONE run via the handler's enqueueRun whose
 *   trigger payload identifies the add → drain the durable run → terminal
 *   'succeeded' → whole-workbook cleanup (OneDrive delete_item) → 0 leaked.
 *
 * WHY the per-trigger poll handler, not the global `runPollingTriggers()`: the
 * handler's `poll()` (read → diff vs snapshot → enqueueRun) IS the real polling
 * dispatch path — the same function the cron orchestrator's `runOne` invokes. We
 * drive it SCOPED to this smoke trigger rather than the global shell, because that
 * shell polls + can fire EVERY due polling workflow across all accounts on the
 * shared dev DB (a real multi-account side effect). Only selection/interval/state
 * gating is bypassed — not the dispatch.
 *
 * Every DB / engine / provider touchpoint is behind injected `ExcelPollingSmokeDeps`
 * so this orchestrator is fully unit-testable with fakes; real wiring lives in
 * excelPollingSmokeDeps.ts and only runs in the gated dev integration test.
 */
import {
  WorkflowDefinitionSchema,
  type WorkflowDefinition,
} from "@/contracts/workflowDefinition";

export const EXCEL_POLLING_SMOKE_TRIGGER_NODE_ID = "smoke-excel-poll-trigger";
export const EXCEL_POLLING_SMOKE_ACTION_NODE_ID = "smoke-noop-action";

export type ExcelWorkbookVariant = "plain" | "withTable";

export interface ExcelPollingSmokeWorkflow {
  readonly definition: WorkflowDefinition;
  readonly triggerNodeId: string;
  readonly actionNodeId: string;
  readonly name: string;
}

/**
 * Build a polling smoke workflow: an Excel polling trigger (config carries the
 * runtime workbookId + any selector) → a single safe terminal
 * `native:if_then_condition` no-op (unary is_falsy on a truthy literal +
 * onFalse:"skip" → null branch → terminal 'succeeded', zero external effect).
 */
function buildPollingWorkflow(
  triggerType: string,
  triggerConfig: Record<string, unknown>,
  name: string,
): ExcelPollingSmokeWorkflow {
  const definition = WorkflowDefinitionSchema.parse({
    nodes: [
      {
        id: EXCEL_POLLING_SMOKE_TRIGGER_NODE_ID,
        kind: "trigger",
        provider: "microsoft-excel",
        type: triggerType,
        config: triggerConfig,
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
    name,
  };
}

export const buildExcelNewWorksheetSmokeWorkflow = (workbookId: string) =>
  buildPollingWorkflow(
    "new_worksheet",
    { workbookId },
    "trigger-smoke:microsoft-excel:new_worksheet",
  );

export const buildExcelNewRowSmokeWorkflow = (workbookId: string) =>
  buildPollingWorkflow(
    "new_row",
    { workbookId, worksheetName: "Sheet1" },
    "trigger-smoke:microsoft-excel:new_row",
  );

export const buildExcelNewTableRowSmokeWorkflow = (workbookId: string) =>
  buildPollingWorkflow(
    "new_table_row",
    { workbookId, tableName: "SmokeTable" },
    "trigger-smoke:microsoft-excel:new_table_row",
  );

/** A persisted run + its trigger_event payload (verifiable dispatch identity). */
export interface ExcelPollingRun {
  readonly runId: string;
  readonly status: "succeeded" | "failed" | "running" | "queued" | null;
  readonly triggerPayload: Readonly<Record<string, unknown>> | null;
}

/** Injected seams. Defaults wired in excelPollingSmokeDeps.ts; fakes in tests. */
export interface ExcelPollingSmokeDeps {
  /** Upload the frozen minimal .xlsx (plain = empty Sheet1; withTable = SmokeTable + seed row). */
  createSmokeWorkbook(variant: ExcelWorkbookVariant): Promise<{ workbookId: string }>;
  createActiveSmokeWorkflow(
    workflow: ExcelPollingSmokeWorkflow,
  ): Promise<{ workflowId: string }>;
  /**
   * Arm via the REAL lifecycle (registerWorkflowTriggers → the trigger's
   * activation hook seeds its snapshot). Returns the seeded snapshot key count
   * (worksheet names, or row hashes) to prove the baseline was captured.
   */
  armPollingTrigger(input: {
    workflowId: string;
    triggerNodeId: string;
  }): Promise<{ snapshotKeyCount: number }>;
  /** REAL per-trigger Excel poll handler scoped to this trigger (see header). */
  poll(input: { workflowId: string; triggerNodeId: string }): Promise<void>;
  /** Add ONE worksheet (certified create_worksheet). Returns the new name. */
  addWorksheet(workbookId: string): Promise<{ worksheetName: string }>;
  /** Seed a baseline row (certified add_row) + confirm it is read-back visible. */
  seedRow(input: { workbookId: string; worksheetName: string }): Promise<void>;
  /** Append ONE marker row (certified add_row). Returns the unique marker written. */
  addMarkedRow(input: { workbookId: string; worksheetName: string }): Promise<{ marker: string }>;
  /** Append ONE marker table row (certified add_table_row). Returns the marker. */
  addMarkedTableRow(input: { workbookId: string; tableName: string }): Promise<{ marker: string }>;
  /** All runs for the workflow (incl. non-terminal), newest first. */
  listRuns(workflowId: string): Promise<readonly ExcelPollingRun[]>;
  drainRun(runId: string): Promise<void>;
  readRun(runId: string): Promise<ExcelPollingRun | null>;
  cleanup(input: { workflowId: string; workbookId: string }): Promise<void>;
  /** Sleep between bounded after-poll retries. Real setTimeout live; instant in tests. */
  sleep(ms: number): Promise<void>;
}

/** Per-trigger plug describing workbook variant, change, and payload identity. */
export interface ExcelPollingTriggerSpec {
  /** Canonical `${provider}:${type}` label (for messages + the result). */
  readonly label: string;
  readonly workbookVariant: ExcelWorkbookVariant;
  buildWorkflow(workbookId: string): ExcelPollingSmokeWorkflow;
  /** Optional baseline seed BEFORE activation (e.g. new_row needs a row at pos 1). */
  seed?(deps: ExcelPollingSmokeDeps, workbookId: string): Promise<void>;
  /** Apply the ONE post-baseline add. Returns the identity to match in the payload. */
  applyChange(deps: ExcelPollingSmokeDeps, workbookId: string): Promise<{ identity: string }>;
  /** Does the fired run's payload identify the add we made? */
  identityMatches(run: ExcelPollingRun, identity: string): boolean;
}

function payloadValuesInclude(payload: ExcelPollingRun["triggerPayload"], marker: string): boolean {
  const values = payload?.values;
  return Array.isArray(values) && values.some((v) => v === marker);
}

export const NEW_WORKSHEET_SPEC: ExcelPollingTriggerSpec = {
  label: "microsoft-excel:new_worksheet",
  workbookVariant: "plain",
  buildWorkflow: buildExcelNewWorksheetSmokeWorkflow,
  async applyChange(deps, workbookId) {
    const { worksheetName } = await deps.addWorksheet(workbookId);
    return { identity: worksheetName };
  },
  identityMatches(run, identity) {
    return run.triggerPayload?.worksheetName === identity;
  },
};

export const NEW_ROW_SPEC: ExcelPollingTriggerSpec = {
  label: "microsoft-excel:new_row",
  workbookVariant: "plain",
  buildWorkflow: buildExcelNewRowSmokeWorkflow,
  // The minimal .xlsx Sheet1 is empty; add_row to an empty sheet lands at A1
  // (position key "1"), which collides with the empty-sheet baseline phantom key
  // and would NOT register as a new key. So seed a baseline row at position 1
  // first (confirmed visible), then the change appends at position 2 — a new key.
  async seed(deps, workbookId) {
    await deps.seedRow({ workbookId, worksheetName: "Sheet1" });
  },
  async applyChange(deps, workbookId) {
    const { marker } = await deps.addMarkedRow({ workbookId, worksheetName: "Sheet1" });
    return { identity: marker };
  },
  identityMatches(run, identity) {
    return payloadValuesInclude(run.triggerPayload, identity);
  },
};

export const NEW_TABLE_ROW_SPEC: ExcelPollingTriggerSpec = {
  label: "microsoft-excel:new_table_row",
  workbookVariant: "withTable", // ships with SmokeTable + one seed row = baseline
  buildWorkflow: buildExcelNewTableRowSmokeWorkflow,
  async applyChange(deps, workbookId) {
    const { marker } = await deps.addMarkedTableRow({ workbookId, tableName: "SmokeTable" });
    return { identity: marker };
  },
  identityMatches(run, identity) {
    return payloadValuesInclude(run.triggerPayload, identity);
  },
};

export interface ExcelPollingSmokeOptions {
  /**
   * Bounded re-poll attempts for the post-baseline change. Graph's workbook API
   * has a brief create→read propagation lag, so the add may not be visible to the
   * first poll. Each poll only advances the snapshot to what it actually read, so
   * re-polling is idempotent (fires exactly once, on the poll that first observes
   * the add). Default 1 (unit, no lag); the live run passes a higher value.
   */
  readonly afterPollAttempts?: number;
  readonly afterPollSleepMs?: number;
}

export interface ExcelPollingSmokeResult {
  readonly outcome: "pass" | "fail";
  readonly reason: string | null;
  readonly triggerLabel: string;
  readonly baselineRunCount: number;
  readonly afterRunCount: number;
  readonly terminalStatus: ExcelPollingRun["status"] | null;
  /** The identity we added (worksheet name / row marker). */
  readonly addedIdentity: string | null;
  /** Whether the fired run's payload matched the added identity. */
  readonly identityMatched: boolean;
  readonly workflowId: string | null;
  readonly workbookId: string | null;
  readonly cleaned: boolean;
}

export async function runExcelPollingSmoke(
  deps: ExcelPollingSmokeDeps,
  spec: ExcelPollingTriggerSpec,
  opts: ExcelPollingSmokeOptions = {},
): Promise<ExcelPollingSmokeResult> {
  const ref: { workflowId: string | null; workbookId: string | null } = {
    workflowId: null,
    workbookId: null,
  };
  let result: ExcelPollingSmokeResult;
  try {
    result = await runCore(deps, spec, opts, ref);
  } catch (err) {
    result = {
      outcome: "fail",
      reason: (err as Error).message,
      triggerLabel: spec.label,
      baselineRunCount: 0,
      afterRunCount: 0,
      terminalStatus: null,
      addedIdentity: null,
      identityMatched: false,
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

/** Backward-compatible wrapper for the new_worksheet beachhead. */
export async function runExcelNewWorksheetSmoke(
  deps: ExcelPollingSmokeDeps,
  opts: ExcelPollingSmokeOptions = {},
): Promise<ExcelPollingSmokeResult> {
  return runExcelPollingSmoke(deps, NEW_WORKSHEET_SPEC, opts);
}

async function runCore(
  deps: ExcelPollingSmokeDeps,
  spec: ExcelPollingTriggerSpec,
  opts: ExcelPollingSmokeOptions,
  ref: { workflowId: string | null; workbookId: string | null },
): Promise<ExcelPollingSmokeResult> {
  const fail = (
    reason: string,
    extra: Partial<ExcelPollingSmokeResult> = {},
  ): ExcelPollingSmokeResult => ({
    outcome: "fail",
    reason,
    triggerLabel: spec.label,
    baselineRunCount: 0,
    afterRunCount: 0,
    terminalStatus: null,
    addedIdentity: null,
    identityMatched: false,
    workflowId: ref.workflowId,
    workbookId: ref.workbookId,
    cleaned: false,
    ...extra,
  });

  // 1. Smoke-owned workbook.
  const { workbookId } = await deps.createSmokeWorkbook(spec.workbookVariant);
  ref.workbookId = workbookId;

  // 2. Active workflow watching that workbook.
  const workflow = spec.buildWorkflow(workbookId);
  const { workflowId } = await deps.createActiveSmokeWorkflow(workflow);
  ref.workflowId = workflowId;

  // 3. Seed any required baseline state BEFORE activation.
  if (spec.seed) await spec.seed(deps, workbookId);

  // 4. Arm via the real lifecycle → activation seeds the baseline snapshot.
  const { snapshotKeyCount } = await deps.armPollingTrigger({
    workflowId,
    triggerNodeId: workflow.triggerNodeId,
  });
  if (snapshotKeyCount < 1) {
    return fail("activation seeded an empty snapshot (expected ≥1 baseline entry)");
  }

  // 5. FIRST poll — baseline-first: pre-existing state must NOT fire.
  await deps.poll({ workflowId, triggerNodeId: workflow.triggerNodeId });
  const baselineRuns = await deps.listRuns(workflowId);
  if (baselineRuns.length !== 0) {
    return fail(
      `baseline violation: ${baselineRuns.length} run(s) fired from pre-existing state before any change`,
      { baselineRunCount: baselineRuns.length },
    );
  }

  // 6. Apply ONE post-baseline smoke-owned add.
  const { identity } = await spec.applyChange(deps, workbookId);

  // 7. SECOND poll — exactly one run, with bounded re-poll for propagation lag.
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
    return fail(`expected exactly 1 run after the add, got ${afterRuns.length}`, {
      afterRunCount: afterRuns.length,
      addedIdentity: identity,
    });
  }

  // 8. Verifiable payload — the fired run must identify the add we made.
  const fired = afterRuns[0]!;
  if (!spec.identityMatches(fired, identity)) {
    return fail(`fired run payload did not identify the add "${identity}"`, {
      afterRunCount: 1,
      addedIdentity: identity,
      identityMatched: false,
    });
  }

  // 9. Drain → terminal succeeded.
  await deps.drainRun(fired.runId);
  const terminal = await deps.readRun(fired.runId);
  const status = terminal?.status ?? null;
  if (status !== "succeeded") {
    return fail(`fired run did not reach terminal 'succeeded' (got ${status ?? "null"})`, {
      afterRunCount: 1,
      terminalStatus: status,
      addedIdentity: identity,
      identityMatched: true,
    });
  }

  return {
    outcome: "pass",
    reason: null,
    triggerLabel: spec.label,
    baselineRunCount: 0,
    afterRunCount: 1,
    terminalStatus: "succeeded",
    addedIdentity: identity,
    identityMatched: true,
    workflowId,
    workbookId,
    cleaned: false,
  };
}
