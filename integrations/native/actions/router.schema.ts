import { z } from "zod";
import { IF_THEN_OPERATORS } from "./_conditionEvaluator";

/**
 * Resolved-config schema for the native `router` action.
 *
 * Per docs/rules/variable-resolver.md §"Engine pre-resolution (strict)":
 *   - The engine substitutes every `{{...}}` reference in config BEFORE
 *     dispatching the handler. The schema receives concrete values only.
 *   - The handler also re-parses with this schema for defense-in-depth.
 *
 * Locked decisions (plan §6):
 *   - D-RT1: same 14-operator union as `if_then_condition` (reused via
 *     IF_THEN_OPERATORS export from `_conditionEvaluator.ts`). One
 *     condition per route. First-match-wins evaluation order.
 *   - D-RT3: optional `defaultRoute`. When no route matches AND
 *     `defaultRoute` is set, handler returns `branchTaken: defaultRoute`.
 *     When absent, handler returns `branchTaken: null` (no labeled edge
 *     activates; unlabeled cleanup edges still follow).
 *   - D-RT4: NO regex operator. ReDoS surface deferred to a hardening
 *     slice. Authors wanting partial-match routing use `contains` /
 *     `starts_with` / `ends_with`.
 *   - D-RT5: route label is the `branchTaken` value the engine matches
 *     against outgoing edge labels.
 *
 * Constraints:
 *   - `routes.length >= 1` — a router with zero routes is a no-op error.
 *   - `routes.length <= 32` — defensive cap; unhittable in real UX but
 *     guards pathological config.
 *   - Route labels follow `WorkflowEdge.label`'s constraints (non-empty,
 *     ≤ 64 chars) so they're directly comparable.
 *   - Route labels MUST be unique within the routes list — same-label
 *     duplicates are ambiguous (which route's condition wins?). Fan-out
 *     to multiple downstream nodes under the same label is expressed at
 *     the edge layer (engine-branching §3.5 allows `(from, to1, "X")`
 *     + `(from, to2, "X")`).
 *
 * `.strict()` rejects V1's `mode: "filter"|"router"`, `stopMessage`,
 * `logicOperator`, etc. — stale workflow configs carrying V1 router
 * chrome fail loudly instead of silently being parsed.
 */

export const ROUTE_LABEL_MAX = 64;
export const ROUTER_MAX_ROUTES = 32;

export const RouterOperatorSchema = z.enum(IF_THEN_OPERATORS);

const UNARY_OPERATORS = new Set<string>([
  "is_empty",
  "is_not_empty",
  "is_truthy",
  "is_falsy",
]);

const RouteConditionSchema = z
  .object({
    input: z.unknown(),
    operator: RouterOperatorSchema,
    value: z.unknown().optional(),
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
export type RouteCondition = z.infer<typeof RouteConditionSchema>;

const RouteSchema = z
  .object({
    label: z.string().min(1).max(ROUTE_LABEL_MAX),
    condition: RouteConditionSchema,
  })
  .strict();
export type Route = z.infer<typeof RouteSchema>;

export const RouterConfigSchema = z
  .object({
    routes: z.array(RouteSchema).min(1).max(ROUTER_MAX_ROUTES),
    defaultRoute: z.string().min(1).max(ROUTE_LABEL_MAX).optional(),
  })
  .strict()
  .superRefine((cfg, ctx) => {
    const seen = new Set<string>();
    for (let i = 0; i < cfg.routes.length; i++) {
      const label = cfg.routes[i]!.label;
      if (seen.has(label)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["routes", i, "label"],
          message: `Duplicate route label '${label}'.`,
        });
      }
      seen.add(label);
    }
  });
export type RouterConfig = z.infer<typeof RouterConfigSchema>;
