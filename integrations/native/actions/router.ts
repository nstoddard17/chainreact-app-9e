import type { ActionHandler, ActionHandlerResult } from "@/services/execution/handlers/types";
import { evaluateCondition } from "./_conditionEvaluator";
import { RouterConfigSchema } from "./router.schema";

/**
 * Native `router` action — Native-nodes Slice 3 Commit 3.
 *
 * N-label branching action backing the engine's label-aware traversal.
 * Evaluates routes in declaration order; the FIRST matching route's
 * `label` becomes `branchTaken`, which the engine's
 * `selectActivatedEdges` matches against outgoing edge labels:
 *
 *   - Some route matches              → `branchTaken: <matched label>`
 *   - No route matches + `defaultRoute` set
 *                                     → `branchTaken: defaultRoute`
 *   - No route matches + no `defaultRoute`
 *                                     → `branchTaken: null`
 *
 * Plan: docs/slices/parity/native-nodes-3-tier-c-control-flow-plan.md
 * §6. Locked decisions: D-RT1 / D-RT3 / D-RT4 / D-RT5 / D-RT-EDGE.
 *
 * Author-facing edge-label rule (also documented in CLAUDE.md after
 * Slice 3 outcomes ship):
 *   - Every `routes[].label` you reference MUST have at least one
 *     outgoing edge with that exact label, or the run fails with
 *     INVALID_BRANCH when that route is selected.
 *   - If you set `defaultRoute`, wire an edge with that label too.
 *   - Intentional no-default: omit `defaultRoute` to get null on
 *     no-match — labeled edges are skipped; unlabeled cleanup edges
 *     still follow.
 *
 * Behavioural contracts locked at plan time:
 *   - Strict schema. Single condition per route. First-match-wins.
 *     Max 32 routes. Duplicate route labels rejected at parse.
 *   - Operator/type mismatch within a route's condition → that route
 *     does NOT match (treated as false). Evaluation continues to the
 *     next route. Matches `if_then_condition`'s defensive-false rule
 *     via the shared evaluator (D-IT7 / D-RT1).
 *   - NO regex, NO eval, NO multi-branch fan-out. Multi-branch
 *     activation would require `branchTaken: string[]` widening of
 *     the engine contract — out of scope.
 *   - No log lines. Engine-layer logging owns the run lifecycle.
 *   - Bounded output — three fixed scalar fields (`matched`,
 *     `routeLabel`, `evaluatedCount`). No echo of `input` / `value` /
 *     route configs.
 *
 * Intentional V1 drift on port:
 *   - V1's `mode: "filter" | "router"` DROPPED — filter mode (fail-
 *     on-no-match) is rebuilt by omitting `defaultRoute` so null
 *     short-circuits the labeled branches. Cleaner semantics; the
 *     dispatch is uniform.
 *   - V1's magic `"Else"` pathTaken on no-match REPLACED with
 *     author-configured `defaultRoute` (or `null`). No magic strings.
 *   - V1's multi-condition AND/OR per path DROPPED (D-IT4 — Slice 3
 *     ships single-condition only).
 *   - Loose `==` equality REPLACED with strict `===` (D-IT2).
 */

export const router: ActionHandler = async (input) => {
  const config = RouterConfigSchema.parse(input.config);

  let matchedLabel: string | null = null;
  let evaluatedCount = 0;
  for (const route of config.routes) {
    evaluatedCount += 1;
    const matched = evaluateCondition({
      operator: route.condition.operator,
      input: route.condition.input,
      value: route.condition.value,
    });
    if (matched) {
      matchedLabel = route.label;
      break;
    }
  }

  const branchTaken: ActionHandlerResult["branchTaken"] =
    matchedLabel ?? config.defaultRoute ?? null;

  return {
    output: {
      matched: matchedLabel !== null,
      routeLabel: matchedLabel ?? config.defaultRoute ?? null,
      evaluatedCount,
    },
    branchTaken,
  };
};
