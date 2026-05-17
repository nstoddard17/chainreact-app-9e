import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `native:if_then_condition`.
 *
 * Operator list mirrors `IF_THEN_OPERATORS` in `_conditionEvaluator.ts`.
 *
 * `value` is rendered conditionally — unary operators (`is_empty` /
 * `is_not_empty` / `is_truthy` / `is_falsy`) forbid `value`; binary
 * operators require it. The generic SchemaForm cannot express this
 * conditional purely from the meta — the IfThenConfig wrapper in Slice
 * 3.6 owns the conditional rendering. The meta declares `value` as
 * optional + `dependsOn: "operator"` so the wrapper can read the
 * dependency relationship without re-encoding the operator list.
 *
 * `onFalse` defaults to `"branch"` in the schema (D-IT6); we surface
 * that default here.
 */
export const ifThenConditionMeta: ActionMeta = {
  key: "native:if_then_condition",
  provider: "native",
  type: "if_then_condition",
  displayName: "If/Then Condition",
  description:
    "Branch the workflow on a boolean check. Emits `branchTaken: 'true'` or `'false'` (or `null` when onFalse is 'skip'). Wire outgoing edges with labels `true` / `false`.",
  category: "logic",
  requiresIntegration: false,
  fields: [
    {
      name: "input",
      label: "Input",
      description: "The value to test. Typically a variable from an upstream node.",
      type: "text",
      required: true,
    },
    {
      name: "operator",
      label: "Operator",
      description: "The comparison operator. Unary operators (e.g. is_empty) ignore the Value field.",
      type: "select",
      required: true,
      options: [
        { value: "equals", label: "equals" },
        { value: "not_equals", label: "not equals" },
        { value: "contains", label: "contains" },
        { value: "not_contains", label: "does not contain" },
        { value: "starts_with", label: "starts with" },
        { value: "ends_with", label: "ends with" },
        { value: "is_empty", label: "is empty" },
        { value: "is_not_empty", label: "is not empty" },
        { value: "is_truthy", label: "is truthy" },
        { value: "is_falsy", label: "is falsy" },
        { value: "greater_than", label: "greater than" },
        { value: "less_than", label: "less than" },
        { value: "greater_than_or_equal", label: "greater than or equal to" },
        { value: "less_than_or_equal", label: "less than or equal to" },
      ],
    },
    {
      name: "value",
      label: "Value",
      description: "The right-hand side of the comparison. Required for binary operators; forbidden for unary.",
      type: "text",
      required: false,
      dependsOn: "operator",
    },
    {
      name: "onFalse",
      label: "On False",
      description:
        "Branch — emit a false edge so authors can wire downstream nodes to the false path. Skip — emit no branch label; only unlabeled cleanup edges follow.",
      type: "select",
      required: false,
      defaultValue: "branch",
      options: [
        { value: "branch", label: "Branch to false edge" },
        { value: "skip", label: "Skip and continue" },
      ],
    },
  ],
  outputs: [
    { name: "result", type: "boolean", description: "Result of the condition." },
    {
      name: "branchTaken",
      type: "string",
      description: "'true' or 'false' (or null when onFalse is 'skip' and the condition was false).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 40,
};
