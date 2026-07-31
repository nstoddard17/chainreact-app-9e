import type {
  BuilderValidationIssue,
  BuilderValidationIssueCode,
} from "./collectBuilderValidationIssues";

/**
 * Per-issue explanation + next step for the builder issues rail (BUILDER-ISSUES-RAIL-1).
 *
 * The post-apply agent tray read better than the validation drawer for one concrete reason: every
 * row answered three questions instead of one — WHAT is wrong, WHY it is wrong, and WHAT TO DO.
 * The drawer only ever had the first. This module supplies the other two for the drawer's issue
 * set, so the two surfaces can be collapsed into one without losing the tray's presentation.
 *
 * It is deliberately a PRESENTATION-layer derivation, not new validator output:
 *   - `collectBuilderValidationIssues` stays the single source of truth for WHICH issues exist,
 *     their codes, severity, and blocking semantics. Nothing here can add, drop, or reclassify an
 *     issue.
 *   - the copy is a pure function of the issue's own code + labels. No inference, no per-provider
 *     branch, no backend state.
 *
 * HONESTY RULES (these are the reason this file exists rather than reusing the agent copy verbatim):
 *   - The agent tray's explanation begins "React added this step…". That is TRUE for a node the
 *     agent just applied and FALSE for one the author built by hand or got from a template. It is
 *     therefore emitted only for node ids the caller identifies as agent-added (`agentNodeIds`);
 *     every other node gets neutral copy that claims nothing about origin.
 *   - No explanation asserts a specific reason a value is absent. There is no per-field inference
 *     record to read, so "React couldn't find your channel" would be fabrication — the same
 *     constraint `buildAgentSetupIssues` documents.
 *   - Labels only. Field labels and node names are safe; a config value, secret, token, or
 *     credential id must never reach this copy (the issue read-model already excludes them).
 */

export interface ValidationIssueGuidance {
  /** Safe, generic why-line. Never a fabricated specific reason. */
  readonly explanation: string;
  /** The single next step the author should take. */
  readonly nextStep: string;
}

export interface ValidationIssueGuidanceContext {
  /**
   * Node ids the React agent added or edited in the CURRENT review session. Only these get copy
   * that attributes the gap to the agent. Absent/empty → every row uses neutral copy.
   */
  readonly agentNodeIds?: ReadonlySet<string>;
}

/** Used only for a node the agent itself just added — accurate there, a lie anywhere else. */
const AGENT_MISSING_FIELD_EXPLANATION =
  "React added this step but didn't have enough information to fill this in safely. Choose a value to continue.";

const EXPLANATION: Record<BuilderValidationIssueCode, string> = {
  no_trigger: "Every workflow starts with a trigger — the event that makes it run.",
  multiple_triggers: "A workflow runs from a single starting event, so only one trigger can be active.",
  unconfigured_node: "This step is a placeholder — it doesn't know what it should do yet.",
  router_routes_invalid: "The router's routes are incomplete, so it can't decide where to send each run.",
  schema_fields_invalid: "The fields you defined for this step aren't usable as written.",
  missing_required_field: "This step can't run until this value is set.",
  missing_required_group:
    "This step needs at least one of a small set of values, and none of them is filled in yet.",
  unreachable_node: "Nothing connects the trigger to this step, so it would never run.",
  stale_edge: "This connection points at a step that is no longer in the workflow.",
  self_loop_edge: "A step can't connect to itself — that would never finish.",
  missing_branch_edge: "This branch has no step attached, so runs taking it would stop here.",
  stale_branch_edge: "This branch points at a step that is no longer in the workflow.",
  broken_variable_reference:
    "This field points at a step that no longer exists, so it won't resolve when the workflow runs.",
};

const NEXT_STEP: Record<BuilderValidationIssueCode, string> = {
  no_trigger: "Choose a trigger to start this workflow.",
  multiple_triggers: "Remove the extra trigger so only one remains.",
  unconfigured_node: "Open this step and pick what it should do.",
  router_routes_invalid: "Open this step and finish its routes.",
  schema_fields_invalid: "Open this step and correct the field definitions.",
  missing_required_field: "Open this step and fill it in.",
  missing_required_group: "Open this step and fill in any one of the listed fields.",
  unreachable_node: "Connect this step to the rest of the workflow.",
  stale_edge: "Remove this connection or point it at an existing step.",
  self_loop_edge: "Remove this connection.",
  missing_branch_edge: "Add a step to this branch, or remove the branch.",
  stale_branch_edge: "Point this branch at an existing step, or remove it.",
  broken_variable_reference: "Open the step, then re-pick the value or clear it.",
};

/**
 * The explanation + next step for one issue. Pure; total over every issue code (the record types
 * make an unhandled new code a compile error rather than a silently blank row).
 */
export function validationIssueGuidance(
  issue: BuilderValidationIssue,
  ctx?: ValidationIssueGuidanceContext,
): ValidationIssueGuidance {
  const agentAdded =
    issue.nodeId !== undefined && ctx?.agentNodeIds?.has(issue.nodeId) === true;

  const explanation =
    issue.code === "missing_required_field" && agentAdded
      ? AGENT_MISSING_FIELD_EXPLANATION
      : EXPLANATION[issue.code];

  // A named field lets the next step point at it exactly ("Open the Channel field and fill it
  // in."), which is what made the agent tray's rows feel actionable. Without a label we fall back
  // to the code's generic step rather than inventing a field name.
  const nextStep =
    issue.code === "missing_required_field" && issue.fieldLabel
      ? `Open the ${issue.fieldLabel} field and fill it in.`
      : NEXT_STEP[issue.code];

  return { explanation, nextStep };
}
