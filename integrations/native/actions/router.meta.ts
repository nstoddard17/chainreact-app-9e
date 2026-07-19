import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `native:router`.
 *
 * The router takes a list of `{label, condition}` routes (first match
 * wins) plus an optional `defaultRoute` that fires when no route
 * matches. The repeating-route shape is rendered by the dedicated
 * `router-routes` field renderer (Slice 3.6) — a generic SchemaForm
 * field cannot express the per-row operator / value conditional UX
 * that this action needs.
 *
 * Field types in use:
 *   - `routes` → `router-routes` — see
 *     `features/workflow-builder/config-modal/fields/RouterRoutesField.tsx`.
 *     Produces the exact shape `RouterConfigSchema` expects at
 *     runtime: `Array<{label, condition:{input, operator, value?}}>`.
 *   - `defaultRoute` → `text` — free-text label that must match one
 *     of the routes' labels (or a fall-through label with its own
 *     outgoing edge). Soft cross-field validation lives in the
 *     `RouterRoutesField` family; runtime parsing happens at handler
 *     dispatch.
 *
 * The field has no `defaultValue` for `routes`: deriving an empty
 * array would block save (the runtime schema requires
 * `routes.length >= 1`) but starting with a stub row preloads
 * placeholder content the author must edit. The renderer instead
 * shows a clear empty state ("Add a route to get started") so the
 * author's first action is intentional. The modal Save button gates
 * on the routes-field validator so an empty / malformed routes
 * value cannot save into graphSlice.
 */
export const routerMeta: ActionMeta = {
  key: "native:router",
  provider: "native",
  type: "router",
  displayName: "Router",
  description:
    "Route execution down one of many labeled paths. Each route has a condition; first match wins. Optional default route fires when no route matches.",
  category: "logic",
  requiresIntegration: false,
  fields: [
    {
      name: "routes",
      label: "Routes",
      description:
        "The paths this step can take, checked in order — the first matching route wins. Each route’s name becomes a path you can connect steps to. Up to 32 routes.",
      type: "router-routes",
      required: true,
    },
    {
      name: "defaultRoute",
      label: "Default Route",
      description:
        "Which path to take when no route matches — type one of your route names exactly. Leave empty to take no path.",
      type: "text",
      required: false,
    },
  ],
  // Outputs mirror the HANDLER's bounded output exactly (BRANCH-ENT-1 D2 fix):
  // { matched, routeLabel, evaluatedCount }. `branchTaken` is an ENGINE-level
  // edge decision, never placed in run variables — advertising it produced
  // builder variable picks that failed at run time with MISSING_VARIABLE.
  outputs: [
    {
      name: "matched",
      type: "boolean",
      description: "Whether any route's condition matched.",
    },
    {
      name: "routeLabel",
      type: "string",
      description:
        "The label of the first matching route, the default route when none matched, or null.",
    },
    {
      name: "evaluatedCount",
      type: "number",
      description: "How many routes were evaluated before the first match (or all, when none matched).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 50,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
