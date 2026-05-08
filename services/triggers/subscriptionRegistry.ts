import type { TriggerResourceRecord } from "@/repositories/triggerResources";

/**
 * Hand-maintained subscription-watch handler registry.
 *
 * Mirrors `pollingRegistry.ts` but for triggers whose lifecycle includes a
 * provider-side subscription (Google Calendar `events.watch`, future
 * Microsoft Graph subscriptions, Stripe webhook endpoints, etc.). The
 * renewal cron iterates `trigger_resources` rows whose JSONB config marks
 * them as `type === "subscription-watch"`, looks up a handler by `canHandle`,
 * and calls `renew(ctx)` on rows nearing expiry.
 *
 * Registration is module-init: each provider's trigger registration module
 * (e.g. `integrations/google-calendar/triggers/eventChanged/index.ts`)
 * calls `registerSubscriptionHandler(...)` at load time. Adding a new
 * provider means importing the registration module from
 * `integrations/_registry.ts`.
 *
 * `canHandle` predicates must be mutually exclusive — first match wins.
 */
export interface SubscriptionRenewContext {
  trigger: TriggerResourceRecord;
}

export interface SubscriptionHandler {
  /** Stable identifier for logs and tests. */
  id: string;
  /** Predicate: this handler owns the given trigger row. */
  canHandle(trigger: TriggerResourceRecord): boolean;
  /**
   * How close to expiry (in milliseconds) renewal should fire. The
   * orchestrator skips rows whose `expiresAt - now > getRenewalThresholdMs`.
   */
  getRenewalThresholdMs(): number;
  /**
   * Renew the provider-side subscription and persist updated config back
   * to trigger_resources (channelId, resourceId, expiresAt — syncToken
   * survives rotation and is left untouched).
   */
  renew(ctx: SubscriptionRenewContext): Promise<void>;
}

const handlers: SubscriptionHandler[] = [];

export function registerSubscriptionHandler(
  handler: SubscriptionHandler,
): void {
  handlers.push(handler);
}

export function findSubscriptionHandler(
  trigger: TriggerResourceRecord,
): SubscriptionHandler | null {
  return handlers.find((h) => h.canHandle(trigger)) ?? null;
}

/** Test seam — clears the registry between tests. */
export function __resetSubscriptionRegistryForTests(): void {
  handlers.length = 0;
}
