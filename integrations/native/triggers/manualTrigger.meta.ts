import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `native:manual.run` (manual trigger).
 *
 * The trigger node has an empty resolved config — `ManualTriggerConfigSchema`
 * is `z.object({}).strict()`. No fields. Runs are kicked off via
 * `POST /api/workflows/[id]/run-now` with a JSON body matching
 * `ManualTriggerPayloadSchema` (`{ inputs: Record<string,unknown> }`).
 *
 * The `inputs` payload is variadic-by-design — the builder cannot
 * statically know its keys. The variable picker exposes `inputs` as an
 * `object` output; downstream nodes reference fields via
 * `{{trigger.inputs.<key>}}` and the resolver handles the lookup.
 *
 * `key` uses the event-type suffix (`manual.run`) because that's what
 * `WorkflowNode.type` carries for this trigger (see `run-now/route.ts`'s
 * `n.type === MANUAL_TRIGGER_EVENT_TYPE` check).
 */
export const manualTriggerMeta: TriggerMeta = {
  key: "native:manual.run",
  provider: "native",
  type: "manual.run",
  displayName: "Manual Trigger",
  description:
    "Runs the workflow when you click 'Run Now' in the builder or POST to the run-now endpoint. Inputs you supply at run time are available as {{trigger.inputs.*}} in downstream nodes.",
  category: "logic",
  activation: "manual",
  requiresIntegration: false,
  fields: [],
  payloadShape: [
    {
      name: "inputs",
      type: "object",
      description: "Key-value pairs supplied at run time. Keys vary per run; reference as {{trigger.inputs.<key>}}.",
    },
  ],
  displayOrder: 10,
};
