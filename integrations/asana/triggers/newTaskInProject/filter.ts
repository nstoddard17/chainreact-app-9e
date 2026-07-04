import { z } from "zod";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type {
  FilterResult,
  TriggerFilter,
} from "@/core/triggers/filterContract";

/**
 * Filter for `asana:new_task_in_project` — Slice 5.ASANA-1.
 *
 * The dispatcher fans out by (provider, eventType) GLOBALLY: a task-added
 * event dedups across the per-project webhooks, then matches every
 * `(asana, new_task_in_project)` trigger row. This filter narrows to the
 * rows whose configured `projectId` matches the event's project — so a
 * workflow watching project A never fires on project B's tasks.
 *
 * Fails closed: config missing `projectId` throws in `parseConfig`; an
 * event without a `projectGid` payload never matches.
 */
const ConfigSchema = z.object({
  projectId: z.string().min(1),
});
type Config = z.infer<typeof ConfigSchema>;

export const asanaNewTaskInProjectFilter: TriggerFilter<Config> = {
  provider: "asana",
  eventType: "new_task_in_project",
  parseConfig(rawConfig: unknown): Config {
    return ConfigSchema.parse(rawConfig);
  },
  evaluate(event: TriggerEvent, config: Config): FilterResult {
    const eventProjectGid = event.payload.projectGid;
    if (eventProjectGid === config.projectId) return { kind: "match" };
    return {
      kind: "no-match",
      reason: `project ${String(eventProjectGid)} does not match filter ${config.projectId}`,
    };
  },
};
