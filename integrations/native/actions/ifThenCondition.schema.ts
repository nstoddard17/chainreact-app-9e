import { z } from "zod";
import { IF_THEN_OPERATORS } from "./_conditionEvaluator";

/**
 * Resolved-config schema for the native `if_then_condition` action.
 *
 * Per docs/rules/variable-resolver.md §"Engine pre-resolution (strict)":
 *   - The engine substitutes every `{{...}}` reference in config BEFORE
 *     dispatching the handler. The schema receives concrete values only.
 *   - The handler also re-parses with this schema for defense-in-depth.
 *
 * Locked decisions (plan §5):
 *   - D-IT1: operator drawn from the canonical 14-operator union
 *     (`IF_THEN_OPERATORS` from `_conditionEvaluator.ts`).
 *   - D-IT4: single condition only — no AND/OR composition in this slice.
 *   - D-IT5: V1's `continueOnFalse` field DROPPED; subsumed by
 *     `onFalse: "skip"` + unlabeled outgoing edges.
 *   - D-IT6: `onFalse` controls whether the false branch emits
 *     `branchTaken: "false"` (default — "branch" mode) or
 *     `branchTaken: null` (when "skip" mode).
 *
 * `.strict()` rejects unknown fields at parse time so stale workflow
 * configs carrying V1's dropped fields (`continueOnFalse`,
 * `conditionType: "advanced"`, multi-condition `logicOperator`, etc.)
 * fail loudly instead of silently producing wrong branching.
 *
 * `.superRefine` enforces value cardinality per operator:
 *   - Unary operators (is_empty / is_not_empty / is_truthy / is_falsy)
 *     forbid `value`.
 *   - Binary operators (everything else) require `value`.
 */

export const IfThenConditionOperatorSchema = z.enum(IF_THEN_OPERATORS);

export const IfThenConditionOnFalseSchema = z.enum(["branch", "skip"]);
export type IfThenConditionOnFalse = z.infer<typeof IfThenConditionOnFalseSchema>;

const UNARY_OPERATORS = new Set<string>([
  "is_empty",
  "is_not_empty",
  "is_truthy",
  "is_falsy",
]);

export const IfThenConditionConfigSchema = z
  .object({
    input: z.unknown(),
    operator: IfThenConditionOperatorSchema,
    value: z.unknown().optional(),
    onFalse: IfThenConditionOnFalseSchema.default("branch"),
  })
  .strict()
  .superRefine((cfg, ctx) => {
    const isUnary = UNARY_OPERATORS.has(cfg.operator);
    if (isUnary && cfg.value !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: `Operator '${cfg.operator}' is unary and does not take a value.`,
      });
    }
    if (!isUnary && cfg.value === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: `Operator '${cfg.operator}' is binary and requires a value.`,
      });
    }
  });
export type IfThenConditionConfig = z.infer<typeof IfThenConditionConfigSchema>;
