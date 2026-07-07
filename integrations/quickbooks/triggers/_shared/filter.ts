import { z } from "zod";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type {
  FilterResult,
  TriggerFilter,
} from "@/core/triggers/filterContract";

/**
 * Shared P-S2 realm filter factory for the QuickBooks triggers —
 * QUICKBOOKS-1.
 *
 * The dispatcher fans out by (provider, eventType) GLOBALLY: one Intuit
 * event dedups, then matches EVERY `(quickbooks, <eventType>)` trigger
 * row across all accounts. This filter narrows to rows whose activated
 * `realmId` matches the event's company — so a workflow watching
 * company A never fires on company B's books. Cross-company isolation
 * lives here.
 *
 * Fails closed (P-S2 contract): a config missing `realmId` throws in
 * `parseConfig` → the dispatcher skips that row; an event is matched
 * ONLY on exact `providerAccountId` equality (the normalizer sets it to
 * the event's realmId).
 */
const ConfigSchema = z.object({
  realmId: z.string().min(1),
});
type Config = z.infer<typeof ConfigSchema>;

export function makeQuickbooksRealmFilter(
  eventType: string,
): TriggerFilter<Config> {
  return {
    provider: "quickbooks",
    eventType,
    parseConfig(rawConfig: unknown): Config {
      return ConfigSchema.parse(rawConfig);
    },
    evaluate(event: TriggerEvent, config: Config): FilterResult {
      if (event.providerAccountId === config.realmId) {
        return { kind: "match" };
      }
      return {
        kind: "no-match",
        reason: "event realm does not match the trigger's company",
      };
    },
  };
}
