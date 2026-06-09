import type { WorkflowDefinition, WorkflowNode, WorkflowState } from "@/contracts/workflow";
import type { WorkflowRecord } from "@/repositories/workflows";
import { triggerChanged } from "@/core/workflows/triggerChange";
import { getTriggerMeta } from "@/services/discovery/_registry";
import { createLifecycleOrchestrator } from "@/services/workflows/orchestratorFactory";

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

export interface SaveDraftDefinitionInput {
  /** The workflow's state BEFORE the save (drives the deactivation decision). */
  previousState: WorkflowState;
  previousDefinition: WorkflowDefinition;
  nextDefinition: WorkflowDefinition;
  /**
   * Persist strategy (caller-owned so optimistic concurrency is preserved): PATCH uses the
   * unguarded `updateDraftDefinition`; AI-apply uses `updateDraftDefinitionIfRevisionMatches`,
   * which returns `null` when the revision moved under it. A `null` result means the write did
   * NOT land — nothing is deactivated and `null` is returned for the caller to map (STALE).
   */
  write: () => Promise<WorkflowRecord | null>;
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
  const updated = await input.write();
  if (!updated) return null; // stale / no-op write → never deactivate

  if (
    input.previousState === "active" &&
    activatableTriggerChanged(input.previousDefinition, input.nextDefinition)
  ) {
    return createLifecycleOrchestrator().disable({
      workflowId: updated.id,
      reason: "manual_admin",
      context: "Trigger changed — reconnect and reactivate.",
    });
  }
  return updated;
}
