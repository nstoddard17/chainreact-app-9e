import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `native:delay`.
 *
 * Narrow scope (NPD-N6): in-process wait, max 30 seconds. Unbounded /
 * durable delay is a Phase 6 concern; the UI explicitly surfaces the
 * 30-second ceiling in the description so authors know not to compose
 * long waits here.
 */
export const delayMeta: ActionMeta = {
  key: "native:delay",
  provider: "native",
  type: "delay",
  displayName: "Delay",
  description:
    "Pause the workflow for 1–30 seconds. For longer waits, compose multiple scheduled triggers — unbounded delay is not yet supported.",
  category: "scheduling",
  requiresIntegration: false,
  fields: [
    {
      name: "seconds",
      label: "Seconds",
      description: "How long to wait, 1–30 seconds.",
      type: "number",
      required: true,
      numeric: { min: 1, max: 30, integer: true, step: 1 },
    },
  ],
  outputs: [
    { name: "waited", type: "number", description: "Actual wait duration in milliseconds." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 30,
};
