/**
 * Bridge from a persisted `WorkflowRunDetail` to the variable
 * picker's source-keyed lookup map.
 *
 * Slice 3.9 — the picker labels its trigger source as `"trigger"`
 * (the runtime resolver's canonical alias used in templates like
 * `{{trigger.payload.text}}`), but the engine writes the persisted
 * step under the trigger node's id. This helper bridges the two so
 * the picker can render `latestValuesBySource[sourceId]` without
 * the picker having to know about the alias-versus-node-id detail.
 *
 * Returns a plain `Record<sourceId, output>`:
 *   - The trigger step's `output` lands under the `"trigger"` key
 *     **only when** the run's trigger step nodeId matches the current
 *     graph's trigger node id. A graph-edit that removed/re-added the
 *     trigger node yields a stale persisted-step nodeId; surfacing
 *     that under `"trigger"` would lie to the author. Strict mismatch
 *     → omit, picker renders `absent`.
 *   - Every other step lands under its own nodeId.
 *   - Steps with `output === undefined` are omitted entirely (the
 *     picker treats their absence as "no recent value", same as a
 *     run that never executed that node). Failed / skipped steps fall
 *     into the same bucket — the step records the failure under
 *     `error`, not `output`, and the picker has nothing useful to
 *     show.
 *
 * Lives in `core/workflows/` because both the builder UI (which
 * can't import from server-only modules) and any future agent
 * surface need the same bridge.
 */

import type { WorkflowRunDetail, WorkflowRunStep } from "@/contracts/workflow";

/**
 * The minimum this bridge reads from a run. Structural on purpose (AI-PROVIDER-7):
 * the builder passes a full `WorkflowRunDetail` from the run-detail route, while
 * the suggest-schema route passes a server-side run record it has already gated
 * itself — both carry the same two fields, and neither should have to convert to
 * the other's DTO to use one helper.
 */
export interface LatestValuesRunSource {
  readonly steps: readonly Pick<WorkflowRunStep, "nodeId" | "output">[];
  readonly triggerNodeId: string;
}

export interface BuildLatestValuesInput {
  /** Detail for the latest tracked run, or `null` when nothing's been run. */
  readonly detail: LatestValuesRunSource | WorkflowRunDetail | null;
  /**
   * The current graph's trigger node id. Used to decide whether the
   * persisted trigger step still applies. Pass `null` when the graph
   * has no trigger (e.g. brand-new workflow); the result then has no
   * `"trigger"` key.
   */
  readonly currentTriggerNodeId: string | null;
}

/** Alias used by the picker for the trigger source. */
export const TRIGGER_SOURCE_ALIAS = "trigger";

/**
 * Build the picker's `latestValuesBySource` map.
 *
 * - `null` detail → empty map.
 * - The trigger step is mapped to the `"trigger"` alias only when the
 *   current graph's trigger node id matches. Otherwise omitted.
 * - Every other step is mapped under its `nodeId`.
 * - Steps without an `output` field are omitted.
 * - If the persisted run's trigger step is missing entirely, the map
 *   simply has no `"trigger"` entry.
 */
export function buildLatestValuesBySource(
  input: BuildLatestValuesInput,
): Readonly<Record<string, unknown>> {
  if (!input.detail) return EMPTY;
  const triggerStepNodeId = input.detail.triggerNodeId;
  const out: Record<string, unknown> = {};
  for (const step of input.detail.steps) {
    const output = stepOutput(step);
    if (output === undefined) continue;
    if (step.nodeId === triggerStepNodeId) {
      // Strict guard: persisted trigger step must match the current
      // graph's trigger node id to surface under the `"trigger"`
      // alias. A mismatch means the workflow was edited between runs
      // (trigger removed + re-added with a fresh id); the alias would
      // map to a stale, unreachable identity.
      if (
        input.currentTriggerNodeId !== null &&
        input.currentTriggerNodeId === triggerStepNodeId
      ) {
        out[TRIGGER_SOURCE_ALIAS] = output;
      }
      // Always also map under the literal nodeId so workflows that
      // explicitly reference `{{<triggerNodeId>.payload.text}}` still
      // see their preview. The runtime resolver supports both forms.
      out[step.nodeId] = output;
      continue;
    }
    out[step.nodeId] = output;
  }
  return out;
}

const EMPTY: Readonly<Record<string, unknown>> = Object.freeze({});

function stepOutput(step: Pick<WorkflowRunStep, "output">): unknown {
  return step.output;
}
