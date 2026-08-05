import type { WorkflowDefinition, WorkflowNode, WorkflowState } from "@/contracts/workflow";
import * as workflowsRepo from "@/repositories/workflows";
import type { WorkflowRecord } from "@/repositories/workflows";
import { triggerChanged } from "@/core/workflows/triggerChange";
import { getTriggerMeta } from "@/services/discovery/_registry";
import { createLifecycleOrchestrator } from "@/services/workflows/orchestratorFactory";
import { assertDefinitionPlanEntitlement } from "@/services/workflows/planFeatureGate";

/**
 * Authoritative "save draft definition + active-trigger-change deactivation" path shared by
 * the manual builder save (PATCH /api/workflows/[id]) and the AI-apply flow
 * (services/ai/apply/applyWorkflowPatch). Both used to write the draft directly; only the
 * PATCH path had the deactivation guard. Centralizing it here gives ONE rule.
 *
 * See docs/slices/phase-4/workflows/active-edit-stale-trigger-audit.md.
 */

/**
 * Is this trigger node "activatable" — i.e. does it register a `trigger_resources` row /
 * provider subscription / scheduler entry that the runtime dispatches against?
 *
 * The native `manual.run` trigger (`activation: "manual"`) is NOT: it's fired only by
 * `POST /api/workflows/[id]/run-now`, which bypasses dispatch entirely, so changing it never
 * leaves a stale registration and must NOT deactivate an active workflow. Every other trigger
 * activation kind (`webhook` / `polling` / `scheduled`) registers something. An UNKNOWN meta
 * is treated as activatable (fail-safe — assume it registers, so we err toward cleanup).
 */
function isActivatableTrigger(node: WorkflowNode): boolean {
  return getTriggerMeta(`${node.provider}:${node.type}`)?.activation !== "manual";
}

/**
 * True when the set of ACTIVATABLE triggers changed (added / removed / id / provider / type /
 * config). This is what makes a registration stale. Handles the cross-category cases:
 *   - activatable → manual.run: the old external registration is now orphaned → changed.
 *   - manual.run → activatable: a new trigger needs registration → changed (forces Resume).
 *   - manual.run → manual.run edits: activatable set unchanged → NOT changed (stays live).
 */
export function activatableTriggerChanged(
  prev: WorkflowDefinition,
  next: WorkflowDefinition,
): boolean {
  return triggerChanged(prev, next, isActivatableTrigger);
}

/** Does this definition register anything the runtime dispatches against? Manual-only = no. */
function hasActivatableTrigger(def: WorkflowDefinition): boolean {
  return def.nodes.some((n) => n.kind === "trigger" && isActivatableTrigger(n));
}

export interface SaveDraftDefinitionInput {
  /**
   * The WORKFLOW-OWNING account (BRANCH-ENT-1 C5). Drives the plan-feature
   * gate: a next-definition that uses advanced branching is rejected with a
   * typed `PlanFeatureRequiredError` when this account's current billing does
   * not entitle it. Always the workflow row's `accountId` — never the acting
   * user's active account.
   */
  accountId: string;
  /** The workflow's state BEFORE the save (drives the deactivation decision). */
  previousState: WorkflowState;
  previousDefinition: WorkflowDefinition;
  nextDefinition: WorkflowDefinition;
  /**
   * Persist strategy (caller-owned so optimistic concurrency is preserved). Every
   * authoritative caller (manual PATCH, AI-apply, template replace, checkpoint restore) now
   * writes through `updateDraftDefinitionIfRevisionMatches` — the atomic compare-and-swap —
   * which returns `null` when the revision moved under it
   * (WORKFLOW-CHANGED-ELSEWHERE-CONFLICT-PROTECTION-1). A `null` result means the write did
   * NOT land — nothing is deactivated, no lifecycle/trigger side effect runs, and `null` is
   * returned for the caller to classify via `classifyStaleDraftWrite`.
   */
  write: () => Promise<WorkflowRecord | null>;
}

/**
 * Classify a compare-and-swap miss (a `null` from the guarded write) safely.
 * The workflow row is re-read through the caller's RLS-scoped client:
 *   - gone / soft-deleted / not visible to this member → `not_found` (the same
 *     shape a non-member sees — no existence leak),
 *   - still visible → a genuine revision conflict; carry the CURRENT server
 *     revision token so the client can offer reload/rebase recovery.
 * Deliberately NO definition content in the result — a conflict response must
 * not become a data channel.
 */
export type StaleDraftWriteClassification =
  | { kind: "not_found" }
  | { kind: "conflict"; latestRevision: string };

export async function classifyStaleDraftWrite(
  workflowId: string,
): Promise<StaleDraftWriteClassification> {
  let current: WorkflowRecord | null;
  try {
    current = await workflowsRepo.getById(workflowId);
  } catch {
    // Read failed AFTER a zero-row CAS: report not_found rather than invent a
    // revision we didn't observe. The client's recovery (reload) is the same.
    return { kind: "not_found" };
  }
  if (!current || current.state === "deleted") return { kind: "not_found" };
  return { kind: "conflict", latestRevision: current.updatedAt };
}

/**
 * Write the new draft, then — only if the write landed AND the workflow was `active` AND an
 * ACTIVATABLE trigger's registration is now stale — deactivate via the existing lifecycle
 * orchestrator so `trigger_resources` / provider subscriptions are torn down. The user
 * recovers via the existing Reactivate → Resume flow (Resume re-registers off the new draft).
 *
 * Non-trigger edits (actions / labels / layout / edges) and manual-trigger edits leave the
 * workflow active. Non-active workflows (draft / paused / disabled / eligible_to_resume) are
 * never deactivated — they aren't actively dispatching against the new graph. No new state,
 * no auto re-register.
 */
export async function saveDraftDefinition(
  input: SaveDraftDefinitionInput,
): Promise<WorkflowRecord | null> {
  // BRANCH-ENT-1 C5 — plan-feature gate BEFORE any write. Validates the
  // PROPOSED definition only: introducing or retaining advanced branching
  // without entitlement rejects the save (typed PlanFeatureRequiredError,
  // nothing persisted); a compliant replacement that removes every branching
  // node always passes, so a downgraded account can edit itself back into
  // compliance. All four definition-update paths (manual PATCH, AI apply,
  // checkpoint restore, template replace) share this one rule.
  await assertDefinitionPlanEntitlement({
    accountId: input.accountId,
    definition: input.nextDefinition,
  });

  const updated = await input.write();
  if (!updated) return null; // stale / no-op write → never deactivate

  if (
    input.previousState === "active" &&
    activatableTriggerChanged(input.previousDefinition, input.nextDefinition)
  ) {
    // External → manual edits leave a manual-only definition: the old external registration is
    // torn down (so we still deactivate), but there is nothing to reconnect. Telling the user to
    // "reconnect" is misleading here — manual.run has no integration. Give manual-specific copy.
    const context = hasActivatableTrigger(input.nextDefinition)
      ? "Trigger changed — reconnect and reactivate."
      : "The previous trigger was removed and its connection disconnected. This workflow now runs manually — nothing to reconnect.";
    return createLifecycleOrchestrator().disable({
      workflowId: updated.id,
      reason: "manual_admin",
      context,
    });
  }
  return updated;
}
