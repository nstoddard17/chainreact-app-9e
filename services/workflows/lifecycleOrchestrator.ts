import {
  type LifecycleTransition,
  LifecycleError,
  assertAllowedTransition,
} from "@/core/workflows/lifecycle";
import type { WorkflowDefinition, WorkflowDisabledReason } from "@/contracts/workflow";
import * as workflowsRepo from "@/repositories/workflows";
import type { WorkflowRecord } from "@/repositories/workflows";
import { assertAccountOperational } from "@/services/accounts/accountFreeze";

/**
 * LifecycleOrchestrator — the single mutator of workflows.state.
 *
 * Per docs/rules/workflow-lifecycle.md §"V2 intended behavior":
 *   - Each transition runs preconditions before persisting and emits side
 *     effects atomically.
 *   - activate: register trigger BEFORE persisting; if persistence fails,
 *     roll back the registration.
 *   - disable / delete: best-effort UNregister AFTER persisting. The webhook
 *     dispatcher independently guards against disabled / deleted workflows
 *     for any leftover provider deliveries (shared invariant with
 *     webhook-receipt-routes.md).
 *   - pause: trigger registration retained; resume from paused does not
 *     re-register. resume from eligible_to_resume DOES re-register.
 *
 * Side-effect surface (registerTrigger / unregisterTrigger / preconditions /
 * notify) is injected. Defaults are no-ops so this slice (1H.2) ships
 * complete-to-spec while the trigger lifecycle (Slice 1J) and notification
 * delivery wire in later without touching the orchestrator.
 */

export interface PreconditionResult {
  ok: boolean;
  failures?: ReadonlyArray<{ code: string; message: string }>;
}

export interface NotifyContext {
  toState: WorkflowRecord["state"];
  disabledReason?: WorkflowDisabledReason;
  disabledContext?: string;
}

export interface LifecycleSideEffects {
  /**
   * Wired in Slice 1J. Activation and resume-from-eligible_to_resume call
   * this BEFORE persisting state; a thrown error aborts the transition.
   * V2-READY-41C — receives the published definition the workflow is activating
   * with (the same one snapshotted into the revision), so registration and the
   * revision are derived from one consistent source rather than a draft that may
   * drift later. Implementations fall back to `workflow.draftDefinition` when
   * `definition` is omitted.
   */
  registerTrigger?(
    workflow: WorkflowRecord,
    definition?: WorkflowDefinition,
  ): Promise<void>;
  /**
   * Wired in Slice 1J. disable / delete call this AFTER persisting state;
   * thrown errors are swallowed (best-effort — webhook dispatcher guards).
   * Also called as the rollback for a failed activate persist.
   */
  unregisterTrigger?(workflow: WorkflowRecord): Promise<void>;
  /**
   * Wired in V2-READY-41B, reworked in 41C. Creates an immutable revision from
   * the supplied (published) definition and returns its id. Called AFTER trigger
   * registration succeeds but BEFORE the state persist, so the orchestrator can
   * set `active_revision_id` atomically with the transition. Does NOT set the
   * pointer itself. Best-effort at the call site: a throw is swallowed and the
   * workflow persists with `active_revision_id = null` (safe draft fallback) —
   * activation does not fail because the snapshot DB write hiccuped. Never
   * reached on a failed activation (registration failure aborts first), so a
   * failed activation never creates a revision.
   */
  snapshotRevision?(
    workflow: WorkflowRecord,
    definition: WorkflowDefinition,
  ): Promise<string>;
  /**
   * V2-READY-41F — resume-from-paused drift check. Returns true when the draft
   * has drifted from the active revision (or there is no usable active revision),
   * so resume must republish (re-register triggers from the current draft +
   * snapshot a new revision) instead of reusing stale trigger_resources. Default
   * (no hook) → false, preserving the pre-41F "paused keeps its registration"
   * behavior for callers/tests that don't wire it.
   */
  hasDraftDrift?(workflow: WorkflowRecord): Promise<boolean>;
  /**
   * Validate transition-specific preconditions (integration health, required
   * config). Failure aborts the transition with MISSING_PRECONDITIONS before
   * any side effect runs.
   */
  checkPreconditions?(
    workflow: WorkflowRecord,
    transition: LifecycleTransition,
  ): Promise<PreconditionResult>;
  /** Best-effort post-transition notification. Errors swallowed. */
  notify?(
    workflow: WorkflowRecord,
    transition: LifecycleTransition,
    context: NotifyContext,
  ): Promise<void>;
}

export interface DisableInput {
  workflowId: string;
  reason: WorkflowDisabledReason;
  context?: string;
}

interface ApplyOptions {
  toState: WorkflowRecord["state"];
  /** `undefined` = leave column untouched. `null` = clear. */
  disabledReason?: WorkflowDisabledReason | null;
  /** `undefined` = leave column untouched. `null` = clear. */
  disabledContext?: string | null;
  setDeletedAt?: boolean;
  // WF-3 trash columns (each undefined = untouched, null = clear).
  deletedAt?: string | null;
  deletedByUserId?: string | null;
  purgeAfter?: string | null;
  deletedFromFolderId?: string | null;
  deleteOperationId?: string | null;
  folderId?: string | null;
  /** V2-READY-41C — set active_revision_id atomically with the transition. */
  activeRevisionId?: string;
}

/**
 * WF-3 — trash metadata supplied to `delete()` so the soft-delete transition
 * stamps the restore-window columns atomically. When omitted, delete falls back
 * to the legacy `deleted_at = now()` behavior (no trash window).
 */
export interface DeleteTrashInput {
  deletedAt: string;
  deletedByUserId: string;
  purgeAfter: string;
  deletedFromFolderId: string | null;
  deleteOperationId: string;
}

export class LifecycleOrchestrator {
  constructor(private readonly hooks: LifecycleSideEffects = {}) {}

  async activate(workflowId: string): Promise<WorkflowRecord> {
    const wf = await this.loadOrThrow(workflowId);
    // 4.ACCOUNT-MODEL-10b — a pending_deletion account cannot activate
    // workflows (which would register triggers / schedule execution). Throws
    // AccountFrozenError before any precondition or trigger registration runs.
    await assertAccountOperational(wf.accountId);
    const toState = assertAllowedTransition(wf.state, "activate");
    await this.runPreconditions(wf, "activate");

    // V2-READY-41C — one published definition drives this activation: register
    // triggers from it, snapshot it into an immutable revision, and set
    // active_revision_id atomically with the state flip. Registration runs first
    // so the common failure (missing integration) aborts BEFORE any revision is
    // created — no orphan revision on failed activation.
    const publishedDefinition = wf.draftDefinition;
    const triggerRegistered = await this.tryRegisterTrigger(
      wf,
      publishedDefinition,
      "activate",
    );
    const revisionId = await safeSnapshotRevision(
      this.hooks,
      wf,
      publishedDefinition,
    );

    let next: WorkflowRecord;
    try {
      next = await this.applyOrConflict(wf.state, workflowId, {
        toState,
        // Clear any historical disable context from a prior cycle.
        disabledReason: null,
        disabledContext: null,
        ...(revisionId ? { activeRevisionId: revisionId } : {}),
      });
    } catch (err) {
      if (triggerRegistered) await safeUnregister(this.hooks, wf);
      throw err;
    }

    await safeNotify(this.hooks, next, "activate", { toState });
    return next;
  }

  async pause(workflowId: string): Promise<WorkflowRecord> {
    const wf = await this.loadOrThrow(workflowId);
    const toState = assertAllowedTransition(wf.state, "pause");
    const next = await this.applyOrConflict(wf.state, workflowId, { toState });
    // Trigger registration retained per rule. No unregister call.
    await safeNotify(this.hooks, next, "pause", { toState });
    return next;
  }

  async resume(workflowId: string): Promise<WorkflowRecord> {
    const wf = await this.loadOrThrow(workflowId);
    const toState = assertAllowedTransition(wf.state, "resume");
    await this.runPreconditions(wf, "resume");

    // When to (re)register triggers + snapshot a revision:
    //   - eligible_to_resume: ALWAYS — its trigger_resources were cleared at
    //     disable time, so it registers fresh.
    //   - paused: ONLY when the draft drifted from the active revision
    //     (V2-READY-41F). No drift → keep the existing registration + revision
    //     (no duplicate resources, no new revision). Drift → republish, clearing
    //     the stale resources first so an old trigger node id / config can't
    //     survive the re-register.
    const publishedDefinition = wf.draftDefinition;
    let needsRegister = wf.state === "eligible_to_resume";
    let unregisterStale = false;
    if (wf.state === "paused" && (await this.checkDraftDrift(wf))) {
      needsRegister = true;
      unregisterStale = true;
    }

    // Clear stale resources BEFORE re-registering. Safe: the workflow is still
    // paused (dispatch drops non-active workflows), so this never widens a firing
    // window — it only prevents the OLD config from being reused on resume.
    if (unregisterStale) await safeUnregister(this.hooks, wf);

    const triggerRegistered = needsRegister
      ? await this.tryRegisterTrigger(wf, publishedDefinition, "resume")
      : false;
    // V2-READY-41C — snapshot the same definition we registered from, so the
    // resumed workflow points at a revision that matches its trigger_resources.
    const revisionId = needsRegister
      ? await safeSnapshotRevision(this.hooks, wf, publishedDefinition)
      : null;

    let next: WorkflowRecord;
    try {
      next = await this.applyOrConflict(wf.state, workflowId, {
        toState,
        disabledReason: null,
        disabledContext: null,
        ...(revisionId ? { activeRevisionId: revisionId } : {}),
      });
    } catch (err) {
      if (triggerRegistered) await safeUnregister(this.hooks, wf);
      throw err;
    }

    await safeNotify(this.hooks, next, "resume", { toState });
    return next;
  }

  /**
   * V2-READY-41G — Publish the current draft of an ACTIVE workflow: snapshot it
   * into a new immutable revision and repoint `active_revision_id` so live
   * execution + trigger registration use it. NOT a state transition — the
   * workflow stays `active`.
   *
   * Safe + minimal because an active workflow can never hold an *activatable
   * trigger* drift: trigger edits on an active workflow auto-deactivate at save
   * time (saveDraftDefinition), so by the time we get here the drift is
   * action/non-trigger only and the existing trigger_resources are already
   * correct. Publish therefore just re-snapshots + repoints — no unregister, no
   * re-register, no firing downtime. Idempotent: a no-drift workflow is a no-op.
   */
  async publish(workflowId: string): Promise<WorkflowRecord> {
    const wf = await this.loadOrThrow(workflowId);
    if (wf.state !== "active") {
      throw new LifecycleError(
        "INVALID_TRANSITION",
        "Only an active workflow can publish draft changes.",
        { state: wf.state },
      );
    }
    // Already published (draft == active revision) → no-op, no new revision.
    if (!(await this.checkDraftDrift(wf))) return wf;
    const revisionId = await this.snapshotForPublish(wf);
    return workflowsRepo.setActiveRevision(workflowId, revisionId);
  }

  async disable(input: DisableInput): Promise<WorkflowRecord> {
    const wf = await this.loadOrThrow(input.workflowId);
    const toState = assertAllowedTransition(wf.state, "disable");
    const next = await this.applyOrConflict(wf.state, input.workflowId, {
      toState,
      disabledReason: input.reason,
      disabledContext: input.context ?? null,
    });

    await safeUnregister(this.hooks, next);
    await safeNotify(this.hooks, next, "disable", {
      toState,
      disabledReason: input.reason,
      ...(input.context !== undefined ? { disabledContext: input.context } : {}),
    });
    return next;
  }

  async markEligibleToResume(workflowId: string): Promise<WorkflowRecord> {
    const wf = await this.loadOrThrow(workflowId);
    const toState = assertAllowedTransition(wf.state, "markEligibleToResume");
    // Preserve disabled_reason on purpose so the UI can render
    // "Ready to resume — was disabled because <reason>".
    const next = await this.applyOrConflict(wf.state, workflowId, { toState });
    await safeNotify(this.hooks, next, "markEligibleToResume", { toState });
    return next;
  }

  async delete(
    workflowId: string,
    trash?: DeleteTrashInput,
  ): Promise<WorkflowRecord> {
    const wf = await this.loadOrThrow(workflowId);
    const toState = assertAllowedTransition(wf.state, "delete");
    const next = await this.applyOrConflict(
      wf.state,
      workflowId,
      trash
        ? {
            toState,
            deletedAt: trash.deletedAt,
            deletedByUserId: trash.deletedByUserId,
            purgeAfter: trash.purgeAfter,
            deletedFromFolderId: trash.deletedFromFolderId,
            deleteOperationId: trash.deleteOperationId,
          }
        : { toState, setDeletedAt: true },
    );
    await safeUnregister(this.hooks, next);
    await safeNotify(this.hooks, next, "delete", { toState });
    return next;
  }

  /**
   * WF-3 — restore a soft-deleted workflow back to `draft`. Clears every trash
   * column and relocates to `folderId` (the resolved restore target). NEVER
   * registers triggers — a restored workflow is inactive and the user must
   * re-activate explicitly (locked decision).
   */
  async restore(
    workflowId: string,
    opts: { folderId: string | null },
  ): Promise<WorkflowRecord> {
    const wf = await this.loadOrThrow(workflowId);
    const toState = assertAllowedTransition(wf.state, "restore");
    const next = await this.applyOrConflict(wf.state, workflowId, {
      toState,
      deletedAt: null,
      deletedByUserId: null,
      purgeAfter: null,
      deletedFromFolderId: null,
      deleteOperationId: null,
      folderId: opts.folderId,
      disabledReason: null,
      disabledContext: null,
    });
    await safeNotify(this.hooks, next, "restore", { toState });
    return next;
  }

  // ── private helpers ────────────────────────────────────────────────────────

  private async loadOrThrow(workflowId: string): Promise<WorkflowRecord> {
    const wf = await workflowsRepo.getById(workflowId);
    if (!wf) {
      throw new LifecycleError("WORKFLOW_NOT_FOUND", "Workflow not found.", {
        workflowId,
      });
    }
    return wf;
  }

  private async runPreconditions(
    wf: WorkflowRecord,
    transition: LifecycleTransition,
  ): Promise<void> {
    if (!this.hooks.checkPreconditions) return;
    const result = await this.hooks.checkPreconditions(wf, transition);
    if (!result.ok) {
      throw new LifecycleError(
        "MISSING_PRECONDITIONS",
        `Preconditions failed for '${transition}'.`,
        { failures: result.failures ?? [] },
      );
    }
  }

  /**
   * V2-READY-41F — delegate to the drift hook (default false when unwired so the
   * pre-41F paused-keeps-registration behavior is preserved in tests).
   */
  private async checkDraftDrift(wf: WorkflowRecord): Promise<boolean> {
    if (!this.hooks.hasDraftDrift) return false;
    return this.hooks.hasDraftDrift(wf);
  }

  /**
   * V2-READY-41G — snapshot the draft for publish. Unlike the activate/resume
   * snapshot (best-effort → null), publish REQUIRES the revision: if it can't be
   * created, publish fails (nothing repointed) so the user retries. Wrapped as a
   * typed LifecycleError so the route surfaces a safe, generic message (no raw
   * DB/provider detail).
   */
  private async snapshotForPublish(wf: WorkflowRecord): Promise<string> {
    if (!this.hooks.snapshotRevision) {
      throw new LifecycleError(
        "TRIGGER_REGISTRATION_FAILED",
        "Publish is unavailable in this context.",
        {},
      );
    }
    try {
      return await this.hooks.snapshotRevision(wf, wf.draftDefinition);
    } catch (err) {
      throw new LifecycleError(
        "TRIGGER_REGISTRATION_FAILED",
        `Publish failed: ${(err as Error).message}`,
        { cause: (err as Error).message },
      );
    }
  }

  private async tryRegisterTrigger(
    wf: WorkflowRecord,
    definition: WorkflowDefinition,
    transition: LifecycleTransition,
  ): Promise<boolean> {
    if (!this.hooks.registerTrigger) return false;
    try {
      await this.hooks.registerTrigger(wf, definition);
      return true;
    } catch (err) {
      throw new LifecycleError(
        "TRIGGER_REGISTRATION_FAILED",
        `Trigger registration failed during '${transition}': ${
          (err as Error).message
        }`,
        { cause: (err as Error).message },
      );
    }
  }

  private async applyOrConflict(
    expectedFromState: WorkflowRecord["state"],
    workflowId: string,
    options: ApplyOptions,
  ): Promise<WorkflowRecord> {
    const next = await workflowsRepo.applyTransition({
      workflowId,
      expectedFromState,
      toState: options.toState,
      ...(options.disabledReason !== undefined
        ? { disabledReason: options.disabledReason }
        : {}),
      ...(options.disabledContext !== undefined
        ? { disabledContext: options.disabledContext }
        : {}),
      ...(options.setDeletedAt ? { setDeletedAt: true } : {}),
      ...(options.deletedAt !== undefined ? { deletedAt: options.deletedAt } : {}),
      ...(options.deletedByUserId !== undefined ? { deletedByUserId: options.deletedByUserId } : {}),
      ...(options.purgeAfter !== undefined ? { purgeAfter: options.purgeAfter } : {}),
      ...(options.deletedFromFolderId !== undefined
        ? { deletedFromFolderId: options.deletedFromFolderId }
        : {}),
      ...(options.deleteOperationId !== undefined
        ? { deleteOperationId: options.deleteOperationId }
        : {}),
      ...(options.folderId !== undefined ? { folderId: options.folderId } : {}),
      ...(options.activeRevisionId !== undefined
        ? { activeRevisionId: options.activeRevisionId }
        : {}),
    });
    if (next === null) {
      throw new LifecycleError(
        "LIFECYCLE_CONFLICT",
        "Concurrent lifecycle transition detected.",
        {
          workflowId,
          expectedFromState,
          toState: options.toState,
        },
      );
    }
    return next;
  }
}

async function safeUnregister(
  hooks: LifecycleSideEffects,
  wf: WorkflowRecord,
): Promise<void> {
  if (!hooks.unregisterTrigger) return;
  try {
    await hooks.unregisterTrigger(wf);
  } catch {
    // Best-effort. Webhook dispatcher independently drops events for
    // disabled / deleted workflows.
  }
}

async function safeSnapshotRevision(
  hooks: LifecycleSideEffects,
  wf: WorkflowRecord,
  definition: WorkflowDefinition,
): Promise<string | null> {
  if (!hooks.snapshotRevision) return null;
  try {
    return await hooks.snapshotRevision(wf, definition);
  } catch (err) {
    // Best-effort. Returning null means the transition persists with
    // active_revision_id = null, which getActiveDefinition treats as the safe
    // draft fallback — activation does not fail because the snapshot DB write
    // hiccuped. Log workflow id + error message only (no graph / account / token
    // detail). A revision INSERT that throws leaves no row, so no orphan here;
    // an orphan is only possible if the snapshot succeeds and the later persist
    // conflicts (rare) — harmless, immutable, cascade-cleaned with the workflow.
    console.warn(
      JSON.stringify({
        event: "workflow.active_revision.snapshot_failed",
        workflowId: wf.id,
        error: (err as Error).message,
      }),
    );
    return null;
  }
}

async function safeNotify(
  hooks: LifecycleSideEffects,
  wf: WorkflowRecord,
  transition: LifecycleTransition,
  ctx: NotifyContext,
): Promise<void> {
  if (!hooks.notify) return;
  try {
    await hooks.notify(wf, transition, ctx);
  } catch {
    // Notification failure is an observability concern, not a transition concern.
  }
}
