import {
  type LifecycleTransition,
  LifecycleError,
  assertAllowedTransition,
} from "@/core/workflows/lifecycle";
import type { WorkflowDisabledReason } from "@/contracts/workflow";
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
   */
  registerTrigger?(workflow: WorkflowRecord): Promise<void>;
  /**
   * Wired in Slice 1J. disable / delete call this AFTER persisting state;
   * thrown errors are swallowed (best-effort — webhook dispatcher guards).
   * Also called as the rollback for a failed activate persist.
   */
  unregisterTrigger?(workflow: WorkflowRecord): Promise<void>;
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

    const triggerRegistered = await this.tryRegisterTrigger(wf, "activate");

    let next: WorkflowRecord;
    try {
      next = await this.applyOrConflict(wf.state, workflowId, {
        toState,
        // Clear any historical disable context from a prior cycle.
        disabledReason: null,
        disabledContext: null,
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

    // Re-register only when resuming from eligible_to_resume (paused retained
    // its registration). Capture the source state for rollback decisions.
    const needsRegister = wf.state === "eligible_to_resume";
    const triggerRegistered = needsRegister
      ? await this.tryRegisterTrigger(wf, "resume")
      : false;

    let next: WorkflowRecord;
    try {
      next = await this.applyOrConflict(wf.state, workflowId, {
        toState,
        disabledReason: null,
        disabledContext: null,
      });
    } catch (err) {
      if (triggerRegistered) await safeUnregister(this.hooks, wf);
      throw err;
    }

    await safeNotify(this.hooks, next, "resume", { toState });
    return next;
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

  private async tryRegisterTrigger(
    wf: WorkflowRecord,
    transition: LifecycleTransition,
  ): Promise<boolean> {
    if (!this.hooks.registerTrigger) return false;
    try {
      await this.hooks.registerTrigger(wf);
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
