import type { TriggerFilter } from "./filterContract";

/**
 * Module-init filter registry (P-S2).
 *
 * Per docs/slices/slack-2-1-messaging-reactions-plan.md §4.2 + §5:
 *   - Each provider's trigger registration module (e.g.
 *     `integrations/slack/triggers/index.ts`) calls `registerTriggerFilter`
 *     at load time. Adding a new provider means importing the registration
 *     module from `integrations/_registry.ts`.
 *   - Lookups are keyed on `(provider, eventType)`. Returns `null` when
 *     no filter is registered — the dispatcher then defaults to match-all,
 *     preserving pre-P-S2 behavior for any provider that hasn't opted in.
 *   - Duplicate registration for the same key throws — a provider
 *     accidentally registering twice for the same event type is a bug,
 *     not a silent overwrite.
 */

const filters = new Map<string, TriggerFilter>();

function key(provider: string, eventType: string): string {
  return `${provider}:${eventType}`;
}

export function registerTriggerFilter(filter: TriggerFilter): void {
  const k = key(filter.provider, filter.eventType);
  if (filters.has(k)) {
    throw new Error(`Trigger filter already registered for ${k}`);
  }
  filters.set(k, filter);
}

export function getTriggerFilter(
  provider: string,
  eventType: string,
): TriggerFilter | null {
  return filters.get(key(provider, eventType)) ?? null;
}

/** Test seam — clears the registry between tests. */
export function __resetTriggerFilterRegistryForTests(): void {
  filters.clear();
}
