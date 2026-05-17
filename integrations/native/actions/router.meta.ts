import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `native:router`.
 *
 * The router takes a list of `{label, condition}` routes and a default
 * route. Routes are first-match-wins. The repeating-route shape is NOT
 * a generic SchemaForm field — it lands as a dedicated RouterConfig
 * wrapper in Slice 3.6.
 *
 * The meta still exposes a `routes` field with type `keyvalue` so the
 * library panel can render a stub form for ad-hoc inspection AND a
 * future schema-drift CI check (zod-to-json-schema) can verify the field
 * name aligns with the schema. The wrapper in Slice 3.6 owns the rich
 * editor (per-route operator selector, value field, label uniqueness
 * validation).
 *
 * `defaultRoute` is a free-text input — authors type a label that must
 * match one of the routes (or a fall-through label that has its own
 * outgoing edge). Validation lives in the schema's superRefine.
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
        "Ordered list of routes. Each route has a unique label (the edge label downstream nodes wire to) and a condition. Up to 32 routes.",
      type: "keyvalue",
      required: true,
      keyValueMaxRows: 32,
    },
    {
      name: "defaultRoute",
      label: "Default Route",
      description:
        "Optional label to take when no route matches. Must match one of the routes' labels OR a fall-through label with its own outgoing edge.",
      type: "text",
      required: false,
    },
  ],
  outputs: [
    {
      name: "branchTaken",
      type: "string",
      description: "The label of the first matching route, the defaultRoute when no route matched, or null.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 50,
};
