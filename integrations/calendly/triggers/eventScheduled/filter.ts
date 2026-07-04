import { makeCalendlyFilter } from "../_shared/filter";

/**
 * P-S2 dispatcher filter for `calendly:event_scheduled` — Slice
 * 5.CALENDLY-1. Narrows the global fan-out to rows whose connected user
 * matches the event's subscriber attribution, plus the optional
 * user-chosen event-type filter. See ../_shared/filter.ts.
 */
export const calendlyEventScheduledFilter = makeCalendlyFilter("event_scheduled");
