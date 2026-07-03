import type { TriggerEvent } from "@/contracts/triggerEvent";
import { getTriggerFilter } from "@/core/triggers/filterRegistry";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { getStateForDispatch } from "@/repositories/workflows";
import * as dedup from "@/repositories/webhookEventDedup";
import { enqueueRun } from "@/services/execution/enqueue";
import { isAccountFrozen } from "@/services/accounts/accountFreeze";

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
 * Dedup outage policy is fail-CLOSED (changed 2026-07-03, LAUNCH-DEDUP-FAILSAFE).
 * The webhook-receipt rule originally specified fail-open, on the premise that a
 * downstream Q4 within-session side-effect idempotency backstop
 * (`checkReplay`/`recordFired`) would catch any duplicate side effects that a
 * doubled delivery slipped past a degraded dedup store. That storage was never
 * implemented — `core/workflows/idempotency.ts` ships only the pure key/hash
 * helpers, with no `checkReplay`/`recordFired` and no engine-boundary replay
 * guard — so fail-open has NO backstop: during a dedup-store outage a doubled
 * provider delivery would enqueue two distinct runs and cause duplicate
 * external side effects (duplicate email / Slack message / CRM write / charge).
 *
 * Preventing a duplicate, often irreversible, external side effect outweighs
 * the cost of dropping an event during a rare dedup-store outage, so when
 * `markSeen` throws we SKIP enqueue for that event and emit a loud, alertable
 * `webhook_dedup_unavailable_skip_enqueue` marker. The route still returns 200
 * (no 5xx), so the provider does NOT retry: on this single shared Supabase
 * project a dedup-store outage means the DB is already degraded, and answering
 * every webhook with 5xx would amplify load on the struggling DB via a provider
 * retry storm. Shedding the event is the deliberate MVP trade — bounded to the
 * outage window and loudly logged — rather than either duplicating side effects
 * (old fail-open) or retry-storming a degraded DB. When durable Q4 side-effect
 * storage lands at the engine boundary, fail-open can be reconsidered.
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
  /**
   * True iff the dedup store errored. Fail-closed: when this is true the event
   * was SKIPPED (matched=0, enqueued=0), not dispatched — see the module header.
   */
  dedupOutage: boolean;
}

export async function dispatchTriggerEvent(
  event: TriggerEvent,
): Promise<DispatchResult> {
  // 1. Idempotency dedup. Fail CLOSED on outage — see the module header:
  // without a Q4 side-effect backstop, proceeding past an unconfirmed dedup
  // check risks duplicate external side effects, so we skip enqueue instead.
  let dedupOutage = false;
  let fresh = true;
  try {
    const result = await dedup.markSeen(event.provider, event.eventId);
    fresh = result.fresh;
  } catch (err) {
    dedupOutage = true;
    console.error(
      JSON.stringify({
        event: "webhook_dedup_unavailable_skip_enqueue",
        provider: event.provider,
        eventId: event.eventId,
        error: (err as Error).message,
      }),
    );
    // Skip enqueue: we cannot confirm this event is new, and there is no
    // downstream idempotency to catch a duplicate run. Return without matching
    // or enqueueing anything. dedupOutage=true + enqueued=0 is the caller's
    // signal that the event was shed due to the outage.
    return { matched: 0, enqueued: 0, duplicate: false, dedupOutage };
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

    // V2-READY-34 — drop the event when the owning account is frozen /
    // pending-deletion (non-operational during the grace window), even though
    // the workflow row is still active. `workflowAccountId` comes from the
    // listForDispatch join; null only when the workflow row vanished (already
    // caught by the state gate above). The event was deduped at step 1, so a
    // provider redelivery is dropped there — no retry storm; events during the
    // freeze window are intentionally not replayed on un-freeze. Logged WITHOUT
    // the account id / provider payload (no leak).
    if (
      resource.workflowAccountId &&
      (await isAccountFrozen(resource.workflowAccountId))
    ) {
      console.debug(
        JSON.stringify({
          event: "webhook.dispatch.dropped_frozen_account",
          workflowId: resource.workflowId,
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
      // Slice 6 durable queue — pass the account from the listForDispatch join so
      // enqueueRun persists the durable 'queued' row without re-loading the
      // workflow. Provenance labeling is unchanged (triggeredBy stays default);
      // the cron processor executes the queued run out of band.
      ...(resource.workflowAccountId
        ? { accountId: resource.workflowAccountId }
        : {}),
    });
    enqueued += 1;
  }

  return { matched: resources.length, enqueued, duplicate: false, dedupOutage };
}
