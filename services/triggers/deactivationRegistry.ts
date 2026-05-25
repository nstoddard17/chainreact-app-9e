import type { IntegrationRecord } from "@/repositories/integrations";
import type { TriggerResourceRecord } from "@/repositories/triggerResources";

/**
 * Trigger deactivation hook registry.
 *
 * Parallel to `activationRegistry.ts`. Where activation runs at workflow-
 * activate time and returns a config patch, deactivation runs at
 * workflow-disable / delete time and performs a side effect: calling the
 * provider's stop / unsubscribe API before the trigger_resources row is
 * removed.
 *
 * Slack and polling-only providers (Gmail) don't register here — there's
 * nothing to tell the provider when the trigger goes away. Providers with
 * per-workflow subscriptions (Google Calendar's events.watch, future
 * Microsoft Graph subscriptions, etc.) DO register here.
 *
 * Best-effort: lifecycle.ts catches and logs failures but doesn't abort the
 * disable / delete transition (the trigger_resources row deletion is what
 * the user's "disable" action means; provider-side cleanup is housekeeping).
 */
export interface DeactivationContext {
  trigger: TriggerResourceRecord;
  integration: IntegrationRecord;
}

export type DeactivationFn = (ctx: DeactivationContext) => Promise<void>;

const deactivations = new Map<string, DeactivationFn>();

function key(provider: string, eventType: string): string {
  return `${provider}:${eventType}`;
}

export function registerDeactivation(
  provider: string,
  eventType: string,
  fn: DeactivationFn,
): void {
  const k = key(provider, eventType);
  if (deactivations.has(k)) {
    throw new Error(`deactivationRegistry: duplicate registration for ${k}.`);
  }
  deactivations.set(k, fn);
}

export function findDeactivation(
  provider: string,
  eventType: string,
): DeactivationFn | null {
  return deactivations.get(key(provider, eventType)) ?? null;
}

/** Test seam — clears the registry between tests. */
export function __resetDeactivationRegistryForTests(): void {
  deactivations.clear();
}
