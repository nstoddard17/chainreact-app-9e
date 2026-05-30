import type { TriggerEvent } from "@/contracts/triggerEvent";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import type { TriggerResourceRecord } from "@/repositories/triggerResources";
import { getStateForDispatch } from "@/repositories/workflows";
import { dispatchTriggerEvent } from "@/services/triggers/dispatch";
import { computeNextFireTime } from "@/services/cron/cronExpression";
import {
  SCHEDULED_TRIGGER_EVENT_TYPE,
  SCHEDULED_TRIGGER_PROVIDER,
  ScheduledTriggerStoredConfigSchema,
} from "@/integrations/native/triggers/scheduledTrigger";

/**
 * Scheduled-trigger cron orchestrator — Native-nodes Slice 2 Commit 3.
 *
 * Per docs/slices/parity/native-nodes-2-tier-b-triggers-plan.md §5.6
 * + accepted NPD-N13 (no catch-up).
 *
 * Algorithm per cron tick:
 *   1. Read every `trigger_resources` row where provider="native" and
 *      event_type="schedule.fired".
 *   2. Skip rows whose workflow state is not "active" (defense-in-depth).
 *   3. Skip rows whose stored `nextFireAt` is in the future.
 *   4. For rows whose `nextFireAt <= now`:
 *      a. Build a TriggerEvent with composite eventId = `schedule.fired:
 *         <workflowId>:<nodeId>:<scheduledFireAtMs>`. Repeats with the
 *         same `nextFireAt` produce the same eventId, so the existing
 *         dedup at `services/triggers/dispatch.ts` catches accidental
 *         double-fire.
 *      b. Call dispatchTriggerEvent (full dedup + state gate + per-
 *         trigger filter [always match-all for native] + enqueue chain).
 *      c. Compute newNextFireAt = computeNextFireTime(expr, now). Update
 *         the row's `config.nextFireAt` via triggerResourcesRepo.upsert.
 *
 * **No catch-up** (NPD-N13). After missing N intervals due to cron
 * outage, the orchestrator fires once for the most recently overdue
 * instant and advances the cursor to the next future fire. Workflow
 * authors who need backfill semantics build them into their workflow
 * logic via the trigger payload's `scheduledFireAt` vs. `firedAt` delta.
 *
 * Errors don't propagate. One row throwing increments `errors` in the
 * summary; the route still returns 200 to Vercel cron — the next tick
 * is the retry.
 */

const PER_ROW_TIMEOUT_MS = 25_000;
const CONCURRENCY = 5;

export interface RunScheduledTriggersResult {
  /** Number of trigger_resources rows examined this tick. */
  examined: number;
  /** Number of rows whose nextFireAt was due AND that dispatched. */
  fired: number;
  /** Skipped because workflow inactive / config malformed / not yet due. */
  skipped: number;
  /** Row threw, or per-row timeout expired. */
  errors: number;
  /** ISO timestamp of when this tick started. */
  startedAt: string;
}

export async function runScheduledTriggers(
  nowOverride?: number,
): Promise<RunScheduledTriggersResult> {
  const startedAt = new Date().toISOString();
  const now = nowOverride ?? Date.now();

  const triggers = await triggerResourcesRepo.listForDispatch(
    SCHEDULED_TRIGGER_PROVIDER,
    SCHEDULED_TRIGGER_EVENT_TYPE,
  );

  const result: RunScheduledTriggersResult = {
    examined: triggers.length,
    fired: 0,
    skipped: 0,
    errors: 0,
    startedAt,
  };

  if (triggers.length === 0) return result;

  // Pre-filter — drop rows whose workflow isn't active, whose config is
  // malformed, or whose nextFireAt is in the future.
  const eligible: TriggerResourceRecord[] = [];
  for (const trigger of triggers) {
    const state = await getStateForDispatch(trigger.workflowId);
    if (state !== "active") {
      result.skipped += 1;
      continue;
    }
    const parsed = ScheduledTriggerStoredConfigSchema.safeParse(trigger.config);
    if (!parsed.success) {
      result.skipped += 1;
      console.warn(
        JSON.stringify({
          event: "scheduled_trigger.skip.malformed_config",
          workflowId: trigger.workflowId,
          nodeId: trigger.nodeId,
        }),
      );
      continue;
    }
    const nextFireAtMs = Date.parse(parsed.data.nextFireAt);
    if (Number.isNaN(nextFireAtMs)) {
      result.skipped += 1;
      continue;
    }
    if (nextFireAtMs > now) {
      result.skipped += 1;
      continue;
    }
    eligible.push(trigger);
  }

  // Fan-out fires with a concurrency cap + per-row timeout, matching
  // services/cron/runPollingTriggers.ts's "one bad row does not abort
  // the batch" semantics.
  for (let i = 0; i < eligible.length; i += CONCURRENCY) {
    const batch = eligible.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((trigger) => fireWithTimeout(trigger, now)),
    );
    for (const s of settled) {
      if (s.status === "fulfilled") {
        result.fired += 1;
      } else {
        result.errors += 1;
      }
    }
  }

  return result;
}

async function fireWithTimeout(
  trigger: TriggerResourceRecord,
  now: number,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error("scheduled_trigger: per-row timeout")),
      PER_ROW_TIMEOUT_MS,
    );
  });
  try {
    await Promise.race([fireOne(trigger, now), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fireOne(
  trigger: TriggerResourceRecord,
  now: number,
): Promise<void> {
  const parsed = ScheduledTriggerStoredConfigSchema.parse(trigger.config);
  const scheduledFireAt = new Date(parsed.nextFireAt);
  const scheduledFireAtMs = scheduledFireAt.getTime();
  const firedAt = new Date(now).toISOString();

  const event: TriggerEvent = {
    provider: SCHEDULED_TRIGGER_PROVIDER,
    eventType: SCHEDULED_TRIGGER_EVENT_TYPE,
    eventId: `schedule.fired:${trigger.workflowId}:${trigger.nodeId}:${scheduledFireAtMs}`,
    occurredAt: firedAt,
    providerAccountId: "system",
    payload: {
      scheduledFireAt: parsed.nextFireAt,
      cronExpression: parsed.cronExpression,
      firedAt,
    },
  };

  // Dispatch FIRST, then advance the cursor. The composite eventId means
  // a crash between dispatch return and cursor advance retries safely:
  // the next tick re-builds the same eventId, dispatch dedups, and only
  // the cursor write retries. NPD-N13: no catch-up — we compute the
  // single next fire strictly after `now`, not after `scheduledFireAt`,
  // so a long outage skips intermediate instants.
  await dispatchTriggerEvent(event);

  const newNextFire = computeNextFireTime(parsed.cronExpression, now);
  if (!newNextFire) {
    // Cron expression no longer produces a future fire (extremely rare —
    // e.g. a fixed-date expression whose date has passed). Log and leave
    // the cursor where it is; next tick will skip the row as not-due
    // because `nextFireAt` won't change. Workflow authors can then
    // deactivate / reconfigure.
    console.warn(
      JSON.stringify({
        event: "scheduled_trigger.no_future_fire",
        workflowId: trigger.workflowId,
        nodeId: trigger.nodeId,
        cronExpression: parsed.cronExpression,
      }),
    );
    return;
  }

  await triggerResourcesRepo.upsert({
    workflowId: trigger.workflowId,
    userId: trigger.userId,
    provider: trigger.provider,
    eventType: trigger.eventType,
    nodeId: trigger.nodeId,
    config: {
      ...parsed,
      nextFireAt: newNextFire.toISOString(),
    },
  });
}

