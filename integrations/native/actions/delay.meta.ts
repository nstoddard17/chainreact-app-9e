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
    "Pause the workflow for 1–30 seconds before the next step. Longer waits aren’t supported yet.",
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
  // Must match the handler's actual output shape (delay.ts:54-60) so the
  // variable picker only advertises references that resolve at runtime. The
  // handler emits seconds + ISO-8601 timestamps, NOT a millisecond `waited`.
  outputs: [
    {
      name: "delayedSeconds",
      type: "number",
      description: "How many seconds the workflow paused (1–30).",
    },
    {
      name: "startedAt",
      type: "string",
      description: "ISO-8601 timestamp when the wait began.",
    },
    {
      name: "completedAt",
      type: "string",
      description: "ISO-8601 timestamp when the wait finished.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 30,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
