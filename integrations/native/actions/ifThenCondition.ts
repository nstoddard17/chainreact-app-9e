import type { ActionHandler, ActionHandlerResult } from "@/services/execution/handlers/types";
import { evaluateCondition } from "./_conditionEvaluator";
import { IfThenConditionConfigSchema } from "./ifThenCondition.schema";

/**
 * Native `if_then_condition` action — Native-nodes Slice 3 Commit 2.
 *
 * Boolean branching action backing the engine's label-aware traversal.
 * Returns a `branchTaken` value that the engine's `selectActivatedEdges`
 * matches against outgoing edge labels:
 *
 *   - `branchTaken: "true"`  when the condition evaluates true.
 *   - `branchTaken: "false"` when the condition evaluates false AND
 *                            `onFalse === "branch"` (default).
 *   - `branchTaken: null`    when the condition evaluates false AND
 *                            `onFalse === "skip"`.
 *
 * Plan: docs/slices/parity/native-nodes-3-tier-c-control-flow-plan.md
 * §5.4 + §5.5. Locked decisions: D-IT6 + D-IT7 + D-IT-EDGE.
 *
 * Author-facing edge-label rule (also documented in CLAUDE.md after
 * Slice 3 outcomes ship):
 *   - Wire `label: "true"` from this node to the action chain that
 *     should run on a true result.
 *   - Wire `label: "false"` for the false-branch chain — OR set
 *     `onFalse: "skip"` to short-circuit without a `"false"` edge.
 *   - Wire any unlabeled outgoing edge for cleanup / analytics that
 *     should always run regardless of the condition outcome.
 *
 * Behavioural contracts locked at plan time:
 *   - Strict schema. Single condition only. Unknown fields rejected
 *     at parse (`.strict()` — guards stale V1 configs carrying
 *     `continueOnFalse` / `conditionType: "advanced"` etc.).
 *   - Operator/type mismatch returns `conditionMet: false` (D-IT7
 *     defensive false). No throws at runtime for shape errors. The
 *     evaluator owns the rule; the handler just dispatches.
 *   - No log lines. Engine-layer logging owns the run lifecycle.
 *   - Bounded output — three fixed scalar fields (`conditionMet`,
 *     `operator`, `onFalse`). No echo of `input` / `value` (potentially
 *     large; not useful as a downstream variable).
 *
 * Intentional V1 drift on port:
 *   - `continueOnFalse` flag DROPPED (D-IT5) — superseded by
 *     `onFalse: "skip"` + unlabeled outgoing edges.
 *   - `conditionType` modes (`"simple" | "multiple" | "advanced"`)
 *     DROPPED — Slice 3 ships single-simple only (D-IT4). Multi-
 *     condition AND/OR composes via chained nodes; JS expression mode
 *     is permanently out (no sandboxing surface).
 *   - Loose `==` equality REPLACED with strict `===` (D-IT2) — see
 *     `_conditionEvaluator.ts` for the operator semantics.
 */

export const ifThenCondition: ActionHandler = async (input) => {
  const config = IfThenConditionConfigSchema.parse(input.config);

  const conditionMet = evaluateCondition({
    operator: config.operator,
    input: config.input,
    value: config.value,
  });

  const branchTaken: ActionHandlerResult["branchTaken"] = conditionMet
    ? "true"
    : config.onFalse === "skip"
      ? null
      : "false";

  return {
    output: {
      conditionMet,
      operator: config.operator,
      onFalse: config.onFalse,
    },
    branchTaken,
  };
};
