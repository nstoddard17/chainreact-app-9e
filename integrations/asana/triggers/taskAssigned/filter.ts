import { z } from "zod";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type {
  FilterResult,
  TriggerFilter,
} from "@/core/triggers/filterContract";

/**
 * Filter for `asana:task_assigned` — ASANA-2.
 *
 * Two narrows on the global (provider, eventType) fan-out:
 *   1. projectId — same as every Asana trigger filter (keeps a project-B
 *      assignment from firing a project-A workflow).
 *   2. assigneeId (optional) — when configured, only assignments TO that
 *      user match. Compared against `payload.newAssigneeGid`, which the
 *      receive helper populated from the authoritative task post-fetch
 *      (never from the compact event). "" = builder-cleared = no filter.
 */
const ConfigSchema = z.object({
  projectId: z.string().min(1),
  assigneeId: z.string().optional(),
});
type Config = z.infer<typeof ConfigSchema>;

export const asanaTaskAssignedFilter: TriggerFilter<Config> = {
  provider: "asana",
  eventType: "task_assigned",
  parseConfig(rawConfig: unknown): Config {
    return ConfigSchema.parse(rawConfig);
  },
  evaluate(event: TriggerEvent, config: Config): FilterResult {
    const eventProjectGid = event.payload.projectGid;
    if (eventProjectGid !== config.projectId) {
      return {
        kind: "no-match",
        reason: `project ${String(eventProjectGid)} does not match filter ${config.projectId}`,
      };
    }
    const assigneeFilter = config.assigneeId ?? "";
    if (assigneeFilter.length > 0) {
      const newAssigneeGid = event.payload.newAssigneeGid;
      if (newAssigneeGid !== assigneeFilter) {
        return {
          kind: "no-match",
          reason: "assignee does not match the configured assignee filter",
        };
      }
    }
    return { kind: "match" };
  },
};
