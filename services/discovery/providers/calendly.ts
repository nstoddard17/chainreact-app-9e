import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Calendly discovery sub-registry — Slice 5.CALENDLY-1.
 *
 * Third net-new V2 provider (no V1 code — see
 * docs/providers/calendly/v2-pattern-audit.md). This first slice ships
 * ZERO actions deliberately: the invitee webhook payload embeds the
 * scheduled_event (start/end/event-type/location/hosts), so it is
 * self-contained, no read action is needed, and none is invented. There
 * is consequently NO `CALENDLY_ACTION_METAS` export and `calendly` stays
 * OUT of `COVERED_PROVIDERS`
 * (tests/structure/discovery-meta-coverage.test.ts requires at least one
 * ActionMeta per covered provider) until the first action slice flips it
 * (same staged posture as Typeform).
 *
 * **Coverage:** 2 webhook triggers.
 *
 * **Triggers:** `event_scheduled` (invitee.created) and `event_canceled`
 * (invitee.canceled) — per-(workflow, node) user-scoped webhook
 * subscriptions via Calendly's POST /webhook_subscriptions lifecycle
 * with a V2-minted per-subscription signing key. Activation +
 * deactivation registered in
 * `integrations/calendly/triggers/<event>/index.ts`, satisfying the
 * trigger-meta-activation-invariant test without an exemption.
 */

import { calendlyEventScheduledTriggerMeta } from "@/integrations/calendly/triggers/eventScheduled/eventScheduled.meta";
import { calendlyEventCanceledTriggerMeta } from "@/integrations/calendly/triggers/eventCanceled/eventCanceled.meta";

/** Calendly webhook trigger metas — displayOrder 10/20. */
export const CALENDLY_TRIGGER_METAS: ReadonlyArray<TriggerMeta> = [
  calendlyEventScheduledTriggerMeta,
  calendlyEventCanceledTriggerMeta,
];
