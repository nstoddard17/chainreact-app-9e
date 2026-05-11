import type { TriggerEvent } from "@/contracts/triggerEvent";

/**
 * Per-trigger dispatcher filter contract (P-S2).
 *
 * Per docs/slices/slack-2-1-messaging-reactions-plan.md §4:
 *   - The dispatcher in `services/triggers/dispatch.ts` looks up a filter
 *     by `(provider, eventType)` between trigger-resource lookup and
 *     enqueue. If a filter is registered, the dispatcher runs it for each
 *     candidate trigger_resources row; only rows whose evaluation returns
 *     `match` enqueue.
 *   - Providers without a registered filter remain match-all (no behavior
 *     change for any provider that hasn't opted in).
 *   - Filters live next to their provider implementation
 *     (`integrations/<p>/triggers/<eventType>/filter.ts`); this contract
 *     is generic so future providers can adopt the pattern incrementally.
 *
 * Failure semantics:
 *   - `parseConfig` throws on invalid persisted config → dispatcher
 *     fails closed (no enqueue, structured warn log).
 *   - `evaluate` throws on unexpected payload → dispatcher fails closed.
 *   - `evaluate` returns `no-match` → dispatcher silently drops the row
 *     with a structured debug log and the supplied `reason`.
 */

export type FilterResult =
  | { kind: "match" }
  | { kind: "no-match"; reason: string };

export interface TriggerFilter<TConfig = unknown> {
  /** Registry id ("slack", "github", …). */
  readonly provider: string;
  /** Canonical event type ("slack.message.channel", …). */
  readonly eventType: string;
  /**
   * Validate the persisted JSONB config from `trigger_resources.config`.
   * Throw on schema mismatch — the dispatcher catches and fails closed.
   */
  parseConfig(rawConfig: unknown): TConfig;
  /**
   * Pure function: given the canonical event and the parsed per-workflow
   * config, decide whether this workflow should fire. Must not perform
   * I/O.
   */
  evaluate(event: TriggerEvent, parsedConfig: TConfig): FilterResult;
}
