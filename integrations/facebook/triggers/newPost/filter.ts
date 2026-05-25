import { z } from "zod";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type {
  FilterResult,
  TriggerFilter,
} from "@/core/triggers/filterContract";

/**
 * Filter for `facebook:new_post` — Slice 3.FACEBOOK-5.
 *
 * Facebook's webhook is app-level: ONE URL receives feed changes for every
 * subscribed Page. The dispatcher looks up ALL `(facebook, new_post)` trigger
 * rows, then this filter narrows to the ones whose configured `pageId`
 * matches the event's Page — so a workflow watching Page A doesn't fire on
 * Page B's posts.
 *
 * Per-workflow config:
 *   - `pageId` (required) — only events from this Page match.
 *
 * Fails closed: a config missing `pageId` throws in `parseConfig` → the
 * dispatcher skips the row (no enqueue).
 */
const ConfigSchema = z.object({
  pageId: z.string().min(1),
});
type Config = z.infer<typeof ConfigSchema>;

export const facebookNewPostFilter: TriggerFilter<Config> = {
  provider: "facebook",
  eventType: "new_post",
  parseConfig(rawConfig: unknown): Config {
    return ConfigSchema.parse(rawConfig);
  },
  evaluate(event: TriggerEvent, config: Config): FilterResult {
    const eventPageId = event.payload.pageId;
    if (eventPageId === config.pageId) return { kind: "match" };
    return {
      kind: "no-match",
      reason: `page ${String(eventPageId)} does not match filter ${config.pageId}`,
    };
  },
};
