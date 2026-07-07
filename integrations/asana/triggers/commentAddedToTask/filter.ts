import { z } from "zod";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type {
  FilterResult,
  TriggerFilter,
} from "@/core/triggers/filterContract";

/**
 * Filter for `asana:comment_added_to_task` — ASANA-2.
 *
 * Same projectId narrowing as the other Asana trigger filters — the
 * dispatcher's (provider, eventType) fan-out is global, so this keeps a
 * project-B comment from firing a project-A workflow.
 */
const ConfigSchema = z.object({
  projectId: z.string().min(1),
});
type Config = z.infer<typeof ConfigSchema>;

export const asanaCommentAddedToTaskFilter: TriggerFilter<Config> = {
  provider: "asana",
  eventType: "comment_added_to_task",
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
