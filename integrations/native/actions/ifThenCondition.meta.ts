import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `native:if_then_condition`.
 *
 * Operator list mirrors `IF_THEN_OPERATORS` in `_conditionEvaluator.ts`
 * exactly — a parity test (`ifThenConditionMeta.test.ts`) pins every
 * option value to the runtime enum, because a drifted value saves a
 * config the handler's `z.enum` rejects at run time (CONFIG-UX-SETUP-
 * ADVANCED-1 fixed `greater_than_or_equal`/`less_than_or_equal` →
 * `greater_equal`/`less_equal`).
 *
 * `value` cardinality mirrors the runtime superRefine via top-level
 * `visibleWhen`: comparison operators that take a value reveal the
 * (required) Value field; check operators (is empty / has a value /
 * is true / is false) hide it, and the SchemaForm cascade clears a
 * stale value the moment the operator switches to a check — the runtime
 * FORBIDS `value` on those, so the clearing is what keeps the saved
 * config valid.
 *
 * `onFalse` defaults to `"branch"` in the schema (D-IT6); we surface
 * that default here.
 */

/** Operators whose comparison needs a right-hand Value (runtime: binary). */
const BINARY_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "greater_than",
  "less_than",
  "greater_equal",
  "less_equal",
] as const;

export const ifThenConditionMeta: ActionMeta = {
  key: "native:if_then_condition",
  provider: "native",
  type: "if_then_condition",
  displayName: "If/Then Condition",
  description:
    "Send the workflow down a True or False path based on a check — for example, only continue when an email subject contains a keyword.",
  category: "logic",
  requiresIntegration: false,
  fields: [
    {
      name: "input",
      label: "Value to check",
      description:
        "The value the condition looks at — usually inserted from the trigger or an earlier step.",
      type: "text",
      required: true,
    },
    {
      name: "operator",
      label: "Condition",
      description: "How to check the value.",
      type: "select",
      required: true,
      options: [
        { value: "equals", label: "equals" },
        { value: "not_equals", label: "does not equal" },
        { value: "contains", label: "contains" },
        { value: "not_contains", label: "does not contain" },
        { value: "starts_with", label: "starts with" },
        { value: "ends_with", label: "ends with" },
        { value: "is_empty", label: "is empty" },
        { value: "is_not_empty", label: "has a value" },
        { value: "is_truthy", label: "is true" },
        { value: "is_falsy", label: "is false" },
        { value: "greater_than", label: "is greater than" },
        { value: "less_than", label: "is less than" },
        { value: "greater_equal", label: "is greater than or equal to" },
        { value: "less_equal", label: "is less than or equal to" },
      ],
    },
    {
      name: "value",
      label: "Compare against",
      description: "What the value is compared to.",
      type: "text",
      required: true,
      visibleWhen: { field: "operator", valueIn: [...BINARY_OPERATORS] },
    },
    {
      name: "onFalse",
      label: "When the check is false",
      description:
        "Follow the False path — run the steps you connect to the False side. Skip — stop this branch and continue with the rest of the workflow.",
      type: "select",
      required: false,
      defaultValue: "branch",
      options: [
        { value: "branch", label: "Follow the False path" },
        { value: "skip", label: "Skip and continue" },
      ],
    },
  ],
  // Outputs mirror the HANDLER's bounded output exactly (BRANCH-ENT-1 D2 fix):
  // { conditionMet, operator, onFalse }. `branchTaken` is an ENGINE-level edge
  // decision, never placed in run variables — advertising it (or the old
  // `result` name) produced builder variable picks that failed at run time
  // with MISSING_VARIABLE.
  outputs: [
    {
      name: "conditionMet",
      type: "boolean",
      description: "Whether the condition evaluated to true.",
    },
    { name: "operator", type: "string", description: "The operator that was evaluated." },
    {
      name: "onFalse",
      type: "string",
      description: "'branch' or 'skip' — how a false result routes.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 40,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
