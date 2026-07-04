import { z } from "zod";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type {
  FilterResult,
  TriggerFilter,
} from "@/core/triggers/filterContract";

/**
 * Filter for `typeform:new_response_in_form` — Slice 5.TYPEFORM-1.
 *
 * The dispatcher fans out by (provider, eventType) GLOBALLY: a
 * form_response event dedups across the per-form webhooks, then matches
 * every `(typeform, new_response_in_form)` trigger row. This filter
 * narrows to the rows whose configured `formId` matches the event's
 * form — so a workflow watching form A never fires on form B's
 * responses. (Exact shape of the Asana projectId filter, P-S2.)
 *
 * Fails closed: config missing `formId` throws in `parseConfig`; an
 * event without a `formId` payload never matches.
 */
const ConfigSchema = z.object({
  formId: z.string().min(1),
});
type Config = z.infer<typeof ConfigSchema>;

export const typeformNewResponseInFormFilter: TriggerFilter<Config> = {
  provider: "typeform",
  eventType: "new_response_in_form",
  parseConfig(rawConfig: unknown): Config {
    return ConfigSchema.parse(rawConfig);
  },
  evaluate(event: TriggerEvent, config: Config): FilterResult {
    const eventFormId = event.payload.formId;
    if (eventFormId === config.formId) return { kind: "match" };
    return {
      kind: "no-match",
      reason: `form ${String(eventFormId)} does not match filter ${config.formId}`,
    };
  },
};
