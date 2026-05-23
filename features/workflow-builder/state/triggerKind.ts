import type { WorkflowNode } from "@/contracts/workflow";
import {
  MANUAL_TRIGGER_EVENT_TYPE,
  MANUAL_TRIGGER_PROVIDER,
} from "@/integrations/native/triggers/manualTrigger";

/**
 * Slice 3.POSTSEC-6B — workflow trigger-kind classifier.
 *
 * Pure helper. No state, no fetch. Reads only the pending-graph nodes
 * the builder already has in `graphSlice` and answers:
 *
 *   - Is this a *manual* workflow? (user-fired runs are the trigger
 *     itself — Run Manually is a valid action)
 *   - Is this an *automated* workflow? (waits for external events:
 *     scheduled / webhook / polling / provider event — Activate is the
 *     valid action, manual live-run is not)
 *   - Or is there no trigger yet? (panel should be hidden — user is
 *     still composing the graph)
 *
 * Why the distinction matters
 * ---------------------------
 *
 * Pre-POSTSEC-6B the builder exposed a "Run Live" button regardless of
 * trigger type. A workflow like "When Stripe invoice is paid → send
 * Slack" should NOT be manually live-run from the builder without a
 * real Stripe event; the right action is Activate (and then trigger
 * the event for real). Conversely, a manual-trigger workflow is *meant*
 * to be fired by the user — Run Manually is its primary live action.
 *
 * Single-trigger invariant
 * ------------------------
 *
 * `WorkflowDefinitionSchema.triggerCount` (in
 * `contracts/workflowDefinition.ts`) caps a workflow at one trigger
 * node, so we don't need to disambiguate between multiple triggers —
 * we just look at the first / only one. The classifier is defensive
 * about missing-trigger graphs (returns `"none"`) so callers in the
 * middle of editing don't see false-positives during composition.
 */

export type TriggerKind = "manual" | "automated" | "none";

/**
 * Classify the workflow by the kind of its trigger node.
 *
 * Returns:
 *   - `"manual"`    — workflow has the native `manual.run` trigger.
 *                     Run Manually is a valid first-class action.
 *   - `"automated"` — workflow has any other trigger (native scheduled,
 *                     provider event, webhook, polling). The right
 *                     action is Activate; manual live-run is gated.
 *   - `"none"`      — no trigger node in the graph yet. The Run /
 *                     Test panel should not render — there's nothing
 *                     to run or test.
 *
 * Defensive: a trigger node whose provider is `"native"` but whose
 * type is unrecognised (e.g. a stale future-type from a partially-
 * shipped feature flag) is treated as "automated", not "manual". The
 * manual classification is opt-in by literal provider+type match —
 * mis-typed natives don't accidentally enable Run Manually.
 */
export function getTriggerKind(
  nodes: readonly WorkflowNode[],
): TriggerKind {
  const trigger = nodes.find((n) => n.kind === "trigger");
  if (!trigger) return "none";
  if (
    trigger.provider === MANUAL_TRIGGER_PROVIDER &&
    trigger.type === MANUAL_TRIGGER_EVENT_TYPE
  ) {
    return "manual";
  }
  return "automated";
}

/**
 * Convenience predicate — `true` iff the workflow's trigger is the
 * native manual trigger. Use in panels that gate the "Run Manually"
 * button.
 */
export function isManualTriggerWorkflow(
  nodes: readonly WorkflowNode[],
): boolean {
  return getTriggerKind(nodes) === "manual";
}

/**
 * Convenience predicate — `true` iff the builder should expose the
 * "Run Manually" (live, real-execution) button for this workflow.
 *
 * Today this is exactly the manual-trigger case. The reason it's
 * a separate predicate from `isManualTriggerWorkflow` is intent:
 * `isManualTriggerWorkflow` describes a graph, `shouldShowManualRun`
 * describes a UI decision. Future product changes (e.g. an opt-in
 * admin/debug live-run for automated workflows behind a feature flag)
 * would extend `shouldShowManualRun` without touching the graph
 * classifier.
 */
export function shouldShowManualRun(
  nodes: readonly WorkflowNode[],
): boolean {
  return isManualTriggerWorkflow(nodes);
}

/**
 * Convenience predicate — `true` iff the builder should expose a
 * "Test Workflow" surface. Returns `true` whenever the graph has any
 * trigger (manual or automated) — there's something the user can
 * meaningfully validate. A trigger-less graph returns `false`: there
 * is no entry-point shape to test.
 *
 * Note (POSTSEC-6B implementation status): for automated triggers the
 * Test Workflow button is rendered but currently DISABLED because the
 * run-now route only accepts manual-trigger workflows server-side. The
 * surface is exposed so users see the safe path exists; a follow-up
 * slice will wire mock/sample event data through a non-manual test
 * route. The classifier doesn't encode that limitation — it stays a
 * pure graph predicate; the panel layer decides enabled/disabled.
 */
export function shouldShowTestWorkflow(
  nodes: readonly WorkflowNode[],
): boolean {
  return getTriggerKind(nodes) !== "none";
}
