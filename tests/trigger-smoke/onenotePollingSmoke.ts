/**
 * Trigger-smoke harness — Microsoft OneNote POLLING trigger dispatch path (Lane B).
 *
 * Mirrors the spec-driven Excel polling pattern (excelPollingSmoke.ts), with
 * OneNote-specific deps, for the section-scoped note triggers:
 *   - microsoft-onenote:new_note     (change: create_page;     identity: created page id + title marker)
 *   - microsoft-onenote:updated_note (change: update_page;     identity: same page id + changeKind "updated")
 *
 * Each proves the real polling dispatch path with baseline-first intact:
 *   locate an operator-provisioned smoke "[TEST]" section (NEVER a user notebook;
 *   OneNote has no section DELETE, so the section is borrowed not created) →
 *   (optional) seed a baseline page → activate (the real activation hook seeds the
 *   timestamp-cursor snapshot) → FIRST poll: pre-existing state fires NOTHING
 *   (baseline-first) → create/update ONE smoke-owned page → re-poll (bounded, for
 *   Graph create→read lag) → exactly ONE run via the handler's enqueueRun whose
 *   payload identifies the page → drain → terminal 'succeeded' → delete every
 *   smoke-owned page created this run (certified delete_page) → 0 leaked.
 *
 * WHY scoped per-trigger poll: same as Excel — `poll()` (list → cursor-filter →
 * enqueue) IS the real dispatch path the cron's runOne calls; we drive it scoped to
 * this trigger, NOT the global runPollingTriggers() (which would poll + fire every
 * due polling workflow across all accounts on the shared dev DB).
 *
 * NO body/content is surfaced or asserted (OneNote payloads carry metadata only) —
 * no raw bytes. The update's content change is proven by the trigger FIRING with
 * changeKind "updated" on the exact page after the update (not by a body marker).
 *
 * Every DB / engine / provider touchpoint is behind injected `OneNotePollingSmokeDeps`
 * so this orchestrator is fully unit-testable with fakes; real wiring lives in
 * onenotePollingSmokeDeps.ts and only runs in the gated dev integration test.
 */
import {
  WorkflowDefinitionSchema,
  type WorkflowDefinition,
} from "@/contracts/workflowDefinition";

export const ONENOTE_POLLING_SMOKE_TRIGGER_NODE_ID = "smoke-onenote-poll-trigger";
export const ONENOTE_POLLING_SMOKE_ACTION_NODE_ID = "smoke-noop-action";

export interface OneNotePollingSmokeWorkflow {
  readonly definition: WorkflowDefinition;
  readonly triggerNodeId: string;
  readonly actionNodeId: string;
  readonly name: string;
}

export interface OneNoteSectionScope {
  readonly sectionId: string;
  readonly notebookId: string;
  /** Present for updated_note (the seeded baseline page the trigger is scoped to). */
  readonly baselinePageId?: string;
}

function buildPollingWorkflow(
  triggerType: string,
  triggerConfig: Record<string, unknown>,
  name: string,
): OneNotePollingSmokeWorkflow {
  const definition = WorkflowDefinitionSchema.parse({
    nodes: [
      {
        id: ONENOTE_POLLING_SMOKE_TRIGGER_NODE_ID,
        kind: "trigger",
        provider: "microsoft-onenote",
        type: triggerType,
        config: triggerConfig,
        position: { x: 0, y: 0 },
      },
      {
        id: ONENOTE_POLLING_SMOKE_ACTION_NODE_ID,
        kind: "action",
        provider: "native",
        type: "if_then_condition",
        config: { input: "smoke", operator: "is_falsy", onFalse: "skip" },
        position: { x: 0, y: 160 },
      },
    ],
    edges: [
      {
        id: "smoke-onenote-poll-edge",
        from: ONENOTE_POLLING_SMOKE_TRIGGER_NODE_ID,
        to: ONENOTE_POLLING_SMOKE_ACTION_NODE_ID,
      },
    ],
  });
  return {
    definition,
    triggerNodeId: ONENOTE_POLLING_SMOKE_TRIGGER_NODE_ID,
    actionNodeId: ONENOTE_POLLING_SMOKE_ACTION_NODE_ID,
    name,
  };
}

export const buildOneNoteNewNoteSmokeWorkflow = (scope: OneNoteSectionScope) =>
  buildPollingWorkflow(
    "new_note",
    { notebookId: scope.notebookId, sectionId: scope.sectionId },
    "trigger-smoke:microsoft-onenote:new_note",
  );

export const buildOneNoteUpdatedNoteSmokeWorkflow = (scope: OneNoteSectionScope) =>
  buildPollingWorkflow(
    "updated_note",
    {
      notebookId: scope.notebookId,
      sectionId: scope.sectionId,
      pageId: scope.baselinePageId ?? null,
    },
    "trigger-smoke:microsoft-onenote:updated_note",
  );

export interface OneNotePollingRun {
  readonly runId: string;
  readonly status: "succeeded" | "failed" | "running" | "queued" | null;
  readonly triggerPayload: Readonly<Record<string, unknown>> | null;
}

/** Result of the post-baseline change — the page touched + its verifiable identity. */
export interface OneNoteChangeResult {
  /** The page id created (new_note) or updated (updated_note). */
  readonly pageId: string;
  /** The unique title marker on the page (carried in the trigger payload). */
  readonly titleMarker: string;
  /** Expected changeKind on the fired payload: "created" | "updated". */
  readonly expectedChangeKind: "created" | "updated";
}

export interface OneNotePollingSmokeDeps {
  /** Find an operator-provisioned smoke/test-named section. null ⇒ no safe target. */
  discoverSmokeSection(): Promise<{ sectionId: string; notebookId: string } | null>;
  createActiveSmokeWorkflow(
    workflow: OneNotePollingSmokeWorkflow,
  ): Promise<{ workflowId: string }>;
  /** Create a smoke-owned marker-titled page in the section. Returns id + marker. */
  createPage(input: { sectionId: string }): Promise<{ pageId: string; titleMarker: string }>;
  /** Confirm a just-created page is read-back visible (bounded; Graph lag). */
  confirmPageVisible(input: { pageId: string }): Promise<void>;
  /** Mutate an existing page's CONTENT in place (certified update_page). */
  updatePage(input: { pageId: string }): Promise<void>;
  /** Arm via the REAL lifecycle (activation seeds the timestamp-cursor snapshot). */
  armPollingTrigger(input: {
    workflowId: string;
    triggerNodeId: string;
  }): Promise<{ snapshotPresent: boolean }>;
  /** REAL per-trigger OneNote poll handler scoped to this trigger (see header). */
  poll(input: { workflowId: string; triggerNodeId: string }): Promise<void>;
  listRuns(workflowId: string): Promise<readonly OneNotePollingRun[]>;
  drainRun(runId: string): Promise<void>;
  readRun(runId: string): Promise<OneNotePollingRun | null>;
  /** Hard-delete a smoke-owned page (certified delete_page; idempotent on 404). */
  deletePage(pageId: string): Promise<void>;
  /** Soft-delete the smoke workflow + unregister its trigger. */
  cleanupWorkflow(workflowId: string): Promise<void>;
  sleep(ms: number): Promise<void>;
}

export interface OneNotePollingTriggerSpec {
  readonly label: string;
  buildWorkflow(scope: OneNoteSectionScope): OneNotePollingSmokeWorkflow;
  /**
   * Optional pre-activation seed. Returns a baseline page id (updated_note seeds a
   * page to scope + mutate; new_note seeds nothing). Any page created here is
   * tracked for cleanup by the orchestrator.
   */
  seed?(
    deps: OneNotePollingSmokeDeps,
    scope: { sectionId: string; notebookId: string },
  ): Promise<{ baselinePageId: string } | void>;
  /** Apply the ONE post-baseline change. Returns the touched page + identity. */
  applyChange(
    deps: OneNotePollingSmokeDeps,
    scope: OneNoteSectionScope,
  ): Promise<OneNoteChangeResult>;
  identityMatches(run: OneNotePollingRun, change: OneNoteChangeResult): boolean;
}

function payloadMatchesPage(
  run: OneNotePollingRun,
  change: OneNoteChangeResult,
): boolean {
  const payload = run.triggerPayload;
  if (!payload) return false;
  return (
    payload.pageId === change.pageId &&
    payload.changeKind === change.expectedChangeKind &&
    typeof payload.title === "string" &&
    payload.title.includes(change.titleMarker)
  );
}

export const NEW_NOTE_SPEC: OneNotePollingTriggerSpec = {
  label: "microsoft-onenote:new_note",
  buildWorkflow: buildOneNoteNewNoteSmokeWorkflow,
  // No seed: activation seeds the createdDateTime high-water from the section's
  // newest existing page (or now if empty). The post-baseline create_page is the
  // change.
  async applyChange(deps, scope) {
    const { pageId, titleMarker } = await deps.createPage({ sectionId: scope.sectionId });
    return { pageId, titleMarker, expectedChangeKind: "created" };
  },
  identityMatches: payloadMatchesPage,
};

export const UPDATED_NOTE_SPEC: OneNotePollingTriggerSpec = {
  label: "microsoft-onenote:updated_note",
  buildWorkflow: buildOneNoteUpdatedNoteSmokeWorkflow,
  // Seed a baseline page (confirmed visible) BEFORE activation; the trigger is
  // scoped to it via config.pageId. updated_note EXCLUDES brand-new pages
  // (createdDateTime === lastModifiedDateTime), so the seed fires nothing at the
  // baseline poll; the in-place update_page later bumps lastModifiedDateTime.
  async seed(deps, scope) {
    const { pageId } = await deps.createPage({ sectionId: scope.sectionId });
    await deps.confirmPageVisible({ pageId });
    return { baselinePageId: pageId };
  },
  async applyChange(deps, scope) {
    const pageId = scope.baselinePageId!;
    await deps.updatePage({ pageId });
    // Identity = the SAME page firing with changeKind "updated". The page's title
    // (set at create) carries the run marker; the content change itself is not
    // surfaced in the payload (no body), so the marker we match is that title.
    return { pageId, titleMarker: "", expectedChangeKind: "updated" };
  },
  // updated_note: title marker check is relaxed (the create marker rides the title,
  // but applyChange doesn't re-mint it); identity = same pageId + changeKind updated.
  identityMatches(run, change) {
    return (
      run.triggerPayload?.pageId === change.pageId &&
      run.triggerPayload?.changeKind === change.expectedChangeKind
    );
  },
};

export interface OneNotePollingSmokeOptions {
  readonly afterPollAttempts?: number;
  readonly afterPollSleepMs?: number;
}

export interface OneNotePollingSmokeResult {
  readonly outcome: "pass" | "fail" | "skip";
  readonly reason: string | null;
  readonly triggerLabel: string;
  readonly baselineRunCount: number;
  readonly afterRunCount: number;
  readonly terminalStatus: OneNotePollingRun["status"] | null;
  readonly changedPageId: string | null;
  readonly identityMatched: boolean;
  readonly workflowId: string | null;
  readonly sectionId: string | null;
  /** Pages created by this run (deleted in cleanup). */
  readonly createdPageCount: number;
  readonly cleaned: boolean;
}

export async function runOneNotePollingSmoke(
  deps: OneNotePollingSmokeDeps,
  spec: OneNotePollingTriggerSpec,
  opts: OneNotePollingSmokeOptions = {},
): Promise<OneNotePollingSmokeResult> {
  const ref: { workflowId: string | null; sectionId: string | null; pages: string[] } = {
    workflowId: null,
    sectionId: null,
    pages: [],
  };
  let result: OneNotePollingSmokeResult;
  try {
    result = await runCore(deps, spec, opts, ref);
  } catch (err) {
    result = base(spec, ref, { outcome: "fail", reason: (err as Error).message });
  } finally {
    // Cleanup ALWAYS runs and is NOT masked: delete every smoke-owned page, then
    // the workflow. A cleanup failure flips `cleaned` to false but never the verdict.
    let cleaned = true;
    for (const pageId of ref.pages) {
      cleaned = (await deps.deletePage(pageId).then(() => true).catch(() => false)) && cleaned;
    }
    if (ref.workflowId) {
      cleaned = (await deps.cleanupWorkflow(ref.workflowId).then(() => true).catch(() => false)) && cleaned;
    }
    result = { ...result!, cleaned, createdPageCount: ref.pages.length };
  }
  return result!;
}

function base(
  spec: OneNotePollingTriggerSpec,
  ref: { workflowId: string | null; sectionId: string | null; pages: string[] },
  over: Partial<OneNotePollingSmokeResult> & { outcome: OneNotePollingSmokeResult["outcome"] },
): OneNotePollingSmokeResult {
  return {
    reason: null,
    triggerLabel: spec.label,
    baselineRunCount: 0,
    afterRunCount: 0,
    terminalStatus: null,
    changedPageId: null,
    identityMatched: false,
    workflowId: ref.workflowId,
    sectionId: ref.sectionId,
    createdPageCount: ref.pages.length,
    cleaned: false,
    ...over,
  };
}

async function runCore(
  deps: OneNotePollingSmokeDeps,
  spec: OneNotePollingTriggerSpec,
  opts: OneNotePollingSmokeOptions,
  ref: { workflowId: string | null; sectionId: string | null; pages: string[] },
): Promise<OneNotePollingSmokeResult> {
  // 1. Locate a SAFE operator-provisioned smoke section (never a user notebook).
  const section = await deps.discoverSmokeSection();
  if (!section) {
    return base(spec, ref, {
      outcome: "skip",
      reason: "no operator-provisioned smoke/test-named OneNote section found (provision a [TEST] section)",
    });
  }
  ref.sectionId = section.sectionId;

  // 2. Optional pre-activation seed (updated_note: a baseline page to scope+mutate).
  const seeded = spec.seed ? await spec.seed(deps, section) : undefined;
  const baselinePageId = seeded?.baselinePageId;
  if (baselinePageId) ref.pages.push(baselinePageId);

  const scope: OneNoteSectionScope = { ...section, ...(baselinePageId ? { baselinePageId } : {}) };

  // 3. Active workflow watching the section.
  const workflow = spec.buildWorkflow(scope);
  const { workflowId } = await deps.createActiveSmokeWorkflow(workflow);
  ref.workflowId = workflowId;

  // 4. Arm via the real lifecycle → activation seeds the snapshot cursor.
  const { snapshotPresent } = await deps.armPollingTrigger({
    workflowId,
    triggerNodeId: workflow.triggerNodeId,
  });
  if (!snapshotPresent) {
    return base(spec, ref, { outcome: "fail", reason: "activation did not seed a snapshot cursor" });
  }

  // 5. FIRST poll — baseline-first: pre-existing state must NOT fire.
  await deps.poll({ workflowId, triggerNodeId: workflow.triggerNodeId });
  const baselineRuns = await deps.listRuns(workflowId);
  if (baselineRuns.length !== 0) {
    return base(spec, ref, {
      outcome: "fail",
      reason: `baseline violation: ${baselineRuns.length} run(s) fired from pre-existing state`,
      baselineRunCount: baselineRuns.length,
    });
  }

  // 6. Apply ONE post-baseline smoke-owned change.
  const change = await spec.applyChange(deps, scope);
  // Track a newly-created page (new_note) for cleanup. updated_note's page is the
  // already-tracked baseline.
  if (change.pageId !== baselinePageId) ref.pages.push(change.pageId);

  // 7. SECOND poll — exactly one run, bounded re-poll for propagation lag.
  const attempts = Math.max(1, opts.afterPollAttempts ?? 1);
  const sleepMs = Math.max(0, opts.afterPollSleepMs ?? 0);
  let afterRuns: readonly OneNotePollingRun[] = [];
  for (let i = 0; i < attempts; i += 1) {
    await deps.poll({ workflowId, triggerNodeId: workflow.triggerNodeId });
    afterRuns = await deps.listRuns(workflowId);
    if (afterRuns.length >= 1) break;
    if (i < attempts - 1 && sleepMs > 0) await deps.sleep(sleepMs);
  }
  if (afterRuns.length !== 1) {
    return base(spec, ref, {
      outcome: "fail",
      reason: `expected exactly 1 run after the change, got ${afterRuns.length}`,
      afterRunCount: afterRuns.length,
      changedPageId: change.pageId,
    });
  }

  // 8. Verifiable payload — the fired run must identify the touched page.
  const fired = afterRuns[0]!;
  if (!spec.identityMatches(fired, change)) {
    return base(spec, ref, {
      outcome: "fail",
      reason: `fired run payload did not identify the changed page ${change.pageId} (${change.expectedChangeKind})`,
      afterRunCount: 1,
      changedPageId: change.pageId,
    });
  }

  // 9. Drain → terminal succeeded.
  await deps.drainRun(fired.runId);
  const terminal = await deps.readRun(fired.runId);
  const status = terminal?.status ?? null;
  if (status !== "succeeded") {
    return base(spec, ref, {
      outcome: "fail",
      reason: `fired run did not reach terminal 'succeeded' (got ${status ?? "null"})`,
      afterRunCount: 1,
      terminalStatus: status,
      changedPageId: change.pageId,
      identityMatched: true,
    });
  }

  return base(spec, ref, {
    outcome: "pass",
    afterRunCount: 1,
    terminalStatus: "succeeded",
    changedPageId: change.pageId,
    identityMatched: true,
  });
}
