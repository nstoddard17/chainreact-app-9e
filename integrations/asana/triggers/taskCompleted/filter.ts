import { z } from "zod";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type {
  FilterResult,
  TriggerFilter,
} from "@/core/triggers/filterContract";

/**
 * Filter for `asana:task_completed` — ASANA-2.
 *
 * Same projectId narrowing as the ASANA-1 filters — the dispatcher's
 * (provider, eventType) fan-out is global, so this is what keeps a
 * project-B completion from firing a project-A workflow. The
 * completed===true gate lives in the receive helper's post-fetch (the
 * event never reaches dispatch unless the task is confirmed complete).
 */
const ConfigSchema = z.object({
  projectId: z.string().min(1),
});
type Config = z.infer<typeof ConfigSchema>;

export const asanaTaskCompletedFilter: TriggerFilter<Config> = {
  provider: "asana",
  eventType: "task_completed",
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
