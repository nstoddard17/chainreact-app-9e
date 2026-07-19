import type { BuilderValidationIssueCode } from "./collectBuilderValidationIssues";

/**
 * User-meaningful grouping for the validation drawer (Slice
 * 4.BUILDER-VALIDATION-CATEGORIES).
 *
 * Pure + provider-agnostic. This is a PRESENTATIONAL grouping over the EXISTING
 * issue codes from `collectBuilderValidationIssues`. It does NOT change severity,
 * blocking semantics, the issue set, or any lifecycle/run behavior — the same
 * issues block activation exactly as before; only how the drawer labels and
 * orders them changes.
 *
 * Why these three (and not the design's "Connection required"): the builder has
 * no connection-required signal. A blank account/resource field is just a
 * `missing_required_field` — the validator never emits a distinct "needs a
 * connection" state — so inventing that bucket would fabricate a status the
 * backend doesn't produce. We group only what the codes actually tell us:
 *
 *   - `needs_input`    — the author must fill in or choose something INSIDE a node
 *                        (a blank required field, a node whose type isn't picked
 *                        yet, invalid router routes). This is the post-template
 *                        "finish the required setup" set the user lands on.
 *   - `workflow_setup` — structural graph problems (no/multiple trigger, an action
 *                        not reachable from the trigger, an edge to a missing node
 *                        or to itself).
 *   - `data_reference` — a field points at data from a step that no longer exists
 *                        (broken variable reference; the lone warning today).
 */
export type ValidationIssueCategory =
  | "needs_input"
  | "workflow_setup"
  | "data_reference";

export function categorizeValidationIssue(
  code: BuilderValidationIssueCode,
): ValidationIssueCategory {
  switch (code) {
    case "missing_required_field":
    case "unconfigured_node":
    case "router_routes_invalid":
      return "needs_input";
    case "no_trigger":
    case "multiple_triggers":
    case "unreachable_node":
    case "stale_edge":
    case "self_loop_edge":
    case "missing_branch_edge":
    case "stale_branch_edge":
      return "workflow_setup";
    case "broken_variable_reference":
      return "data_reference";
  }
}

/** Display order in the drawer — what the author can act on first leads. */
export const VALIDATION_CATEGORY_ORDER: readonly ValidationIssueCategory[] = [
  "needs_input",
  "workflow_setup",
  "data_reference",
];

export function validationCategoryLabel(
  category: ValidationIssueCategory,
): string {
  switch (category) {
    case "needs_input":
      return "Needs your input";
    case "workflow_setup":
      return "Workflow setup";
    case "data_reference":
      return "Check your data";
  }
}
