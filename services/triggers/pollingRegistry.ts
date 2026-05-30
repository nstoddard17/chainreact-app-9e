import type { TriggerResourceRecord } from "@/repositories/triggerResources";

/**
 * Hand-maintained polling-handler registry.
 *
 * Slice 2e port from V1 `lib/triggers/polling.ts` — adapted for V2:
 *   - Typed against V2's `TriggerResourceRecord` instead of V1's untyped row.
 *   - Module-init registration: providers' polling modules call
 *     `registerPollingHandler` at load time. Adding a new provider polling
 *     trigger means importing its module from `integrations/_registry.ts`,
 *     which forces the registration side-effect.
 *
 * The registry is global mutable state on purpose (matches V1) so the
 * scheduler doesn't have to know which providers exist — it just iterates
 * trigger_resources rows and looks up a handler by `canHandle`. First match
 * wins (mirrors V1 behavior; handler `canHandle` predicates must be
 * mutually exclusive — guarded by tests).
 */

export interface PollingHandlerContext {
  trigger: TriggerResourceRecord;
  /**
   * V2 account that owns this trigger's workflow. Threaded in by the
   * scheduler from workflows.account_id at trigger-load time so polling
   * handlers can pass it to `getActiveForExecution` / `refreshAndRetry`
   * for account-scoped integration lookups. Slice 4.ACCOUNT-MODEL-6.
   */
  accountId: string;
  /** Plan tier for the trigger's user. Slice 2e always passes "default". */
  userRole: string;
  /** `Date.now()` snapshot from the start of the cron tick. */
  now: number;
}

export interface PollingHandler {
  /** Stable identifier — used in logs to attribute work to a handler. */
  id: string;
  /** Predicate: this handler owns the given trigger. */
  canHandle(trigger: TriggerResourceRecord): boolean;
  /**
   * Per-role polling cadence in milliseconds. The scheduler skips the
   * trigger if `now - config.polling.lastPolledAt < getIntervalMs(role)`.
   */
  getIntervalMs(userRole: string): number;
  /**
   * Fetch new events from the provider, dedup, filter, and enqueue runs.
   * Throws on unrecoverable errors; the scheduler catches and logs them
   * per V1's "one bad trigger does not abort the batch" semantics.
   */
  poll(context: PollingHandlerContext): Promise<void>;
}

const handlers: PollingHandler[] = [];

export function registerPollingHandler(handler: PollingHandler): void {
  handlers.push(handler);
}

export function findPollingHandler(
  trigger: TriggerResourceRecord,
): PollingHandler | null {
  return handlers.find((h) => h.canHandle(trigger)) ?? null;
}

/** Test seam — clears the registry between tests. */
export function __resetPollingRegistryForTests(): void {
  handlers.length = 0;
}
