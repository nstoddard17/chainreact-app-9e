import { z } from "zod";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type {
  FilterResult,
  TriggerFilter,
} from "@/core/triggers/filterContract";

/**
 * Shared P-S2 company filter factory for the Motive webhook triggers — MOTIVE-1.
 *
 * The dispatcher fans out by (provider, eventType) GLOBALLY: one Motive event
 * dedups, then matches EVERY `(motive, <eventType>)` trigger row across all
 * accounts. This filter narrows to rows whose activated `companyId` matches the
 * event's company — so a workflow watching company A never fires on company B.
 * Cross-company isolation lives here (defense-in-depth on top of the
 * strict-direct `?workflowId=&nodeId=` routing).
 *
 * Fails closed (P-S2 contract): a config missing `companyId` throws in
 * `parseConfig`; an event is matched ONLY on exact `providerAccountId` equality
 * (the normalizer sets it to the event's companyId).
 */
const ConfigSchema = z.object({
  companyId: z.string().min(1),
});
type Config = z.infer<typeof ConfigSchema>;

export function makeMotiveCompanyFilter(eventType: string): TriggerFilter<Config> {
  return {
    provider: "motive",
    eventType,
    parseConfig(rawConfig: unknown): Config {
      return ConfigSchema.parse(rawConfig);
    },
    evaluate(event: TriggerEvent, config: Config): FilterResult {
      if (event.providerAccountId === config.companyId) {
        return { kind: "match" };
      }
      return {
        kind: "no-match",
        reason: "event company does not match the trigger's company",
      };
    },
  };
}
