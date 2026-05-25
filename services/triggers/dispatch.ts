import type { TriggerEvent } from "@/contracts/triggerEvent";
import { getTriggerFilter } from "@/core/triggers/filterRegistry";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { getStateForDispatch } from "@/repositories/workflows";
import * as dedup from "@/repositories/webhookEventDedup";
import { enqueueRun } from "@/services/execution/enqueue";

/**
 * Provider-agnostic webhook dispatcher.
 *
 * Per docs/rules/webhook-receipt-routes.md §"V2 intended behavior":
 *   - Reads the canonical TriggerEvent shape; provider quirks end at
 *     normalize.ts.
 *   - Dedup keyed on (provider, eventId).
 *   - Drops events for non-active workflows even when the trigger row
 *     still exists (paused retains registration; provider deregistration
 *     may lag for disabled / deleted).
 *   - Async dispatch only — calls enqueueRun and returns; never executes
 *     synchronously inside the route.
 *
 * Dedup outage policy is fail-open per the rule (Q4 session-side-effects
 * idempotency catches duplicate side effects further down the chain). When
 * markSeen throws, we log a structured outage marker and proceed with
 * dispatch.
 *
 * Per-trigger filter (P-S2, docs/slices/slack-2-1-messaging-reactions-plan.md):
 *   - After lookup, before enqueue, the dispatcher checks the filter
 *     registry for a `(provider, eventType)` filter. If registered:
 *       * `parseConfig` throws → fail closed (skip enqueue, structured
 *         warn log).
 *       * `evaluate` throws → fail closed.
 *       * `evaluate` returns no-match → silent skip with structured
 *         debug log.
 *   - If no filter is registered, behavior is match-all — preserves
 *     pre-P-S2 behavior for any provider that hasn't opted in.
 */

export interface DispatchResult {
  /** Number of trigger_resources rows that matched (provider, eventType). */
  matched: number;
  /** Number of runs actually enqueued (matched minus filtered drops). */
  enqueued: number;
  /** True iff this event was already in the dedup table. */
  duplicate: boolean;
  /** True iff dedup encountered an error and we proceeded anyway. */
  dedupOutage: boolean;
}

export async function dispatchTriggerEvent(
  event: TriggerEvent,
): Promise<DispatchResult> {
  // 1. Idempotency dedup.
  let dedupOutage = false;
  let fresh = true;
  try {
    const result = await dedup.markSeen(event.provider, event.eventId);
    fresh = result.fresh;
  } catch (err) {
    dedupOutage = true;
    console.warn(
      JSON.stringify({
        event: "webhook.dedup.outage",
        provider: event.provider,
        eventId: event.eventId,
        error: (err as Error).message,
      }),
    );
  }

  if (!fresh) {
    console.debug(
      JSON.stringify({
        event: "webhook.dedup.duplicate",
        provider: event.provider,
        eventId: event.eventId,
      }),
    );
    return { matched: 0, enqueued: 0, duplicate: true, dedupOutage };
  }

  // 2. Find trigger_resources for (provider, eventType).
  const resources = await triggerResourcesRepo.listForDispatch(
    event.provider,
    event.eventType,
  );
  if (resources.length === 0) {
    return { matched: 0, enqueued: 0, duplicate: false, dedupOutage };
  }

  // 2.5 Look up the per-trigger filter once (it's the same for every
  // candidate row of this event). null = no filter registered → match-all.
  const filter = getTriggerFilter(event.provider, event.eventType);

  // 3. For each candidate, gate on workflow state, evaluate the filter,
  // and enqueue.
  let enqueued = 0;
  for (const resource of resources) {
    const state = await getStateForDispatch(resource.workflowId);
    if (state !== "active") {
      console.debug(
        JSON.stringify({
          event: "webhook.dispatch.dropped_inactive",
          workflowId: resource.workflowId,
          state,
          provider: event.provider,
          eventType: event.eventType,
        }),
      );
      continue;
    }

    if (filter) {
      let parsedConfig: unknown;
      try {
        parsedConfig = filter.parseConfig(resource.config);
      } catch (err) {
        console.warn(
          JSON.stringify({
            event: "webhook.dispatch.filter_parse_error",
            workflowId: resource.workflowId,
            provider: event.provider,
            eventType: event.eventType,
            error: (err as Error).message,
          }),
        );
        continue;
      }

      let result;
      try {
        result = filter.evaluate(event, parsedConfig);
      } catch (err) {
        console.warn(
          JSON.stringify({
            event: "webhook.dispatch.filter_eval_error",
            workflowId: resource.workflowId,
            provider: event.provider,
            eventType: event.eventType,
            error: (err as Error).message,
          }),
        );
        continue;
      }

      if (result.kind === "no-match") {
        console.debug(
          JSON.stringify({
            event: "webhook.dispatch.dropped_filtered",
            workflowId: resource.workflowId,
            provider: event.provider,
            eventType: event.eventType,
            reason: result.reason,
          }),
        );
        continue;
      }
    }

    await enqueueRun({
      workflowId: resource.workflowId,
      triggerNodeId: resource.nodeId,
      event,
    });
    enqueued += 1;
  }

  return { matched: resources.length, enqueued, duplicate: false, dedupOutage };
}
