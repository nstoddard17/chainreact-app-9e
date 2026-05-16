import { z } from "zod";

/**
 * Manual trigger — Native-nodes Slice 2 Commit 1.
 *
 * Per docs/slices/parity/native-nodes-2-tier-b-triggers-plan.md §4:
 *   - The trigger node has empty resolved-config; `.strict()` rejects
 *     any stale fields a pre-port workflow might carry.
 *   - The PAYLOAD shape is `{ inputs: Record<string,unknown> }`. The
 *     run-now route validates incoming JSON against this schema before
 *     building the TriggerEvent.
 *
 * Body-size cap (256 KiB) is enforced at the route layer via the
 * `content-length` header; this schema only validates shape.
 */

export const MANUAL_TRIGGER_PROVIDER = "native";
export const MANUAL_TRIGGER_EVENT_TYPE = "manual.run";

export const ManualTriggerConfigSchema = z.object({}).strict();
export type ManualTriggerConfig = z.infer<typeof ManualTriggerConfigSchema>;

export const ManualTriggerPayloadSchema = z
  .object({
    inputs: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type ManualTriggerPayload = z.infer<typeof ManualTriggerPayloadSchema>;
