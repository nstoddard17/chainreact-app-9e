import * as triggerResourcesRepo from "@/repositories/triggerResources";
import type { TriggerResourceRecord } from "@/repositories/triggerResources";
import { getStateForDispatch } from "@/repositories/workflows";
import { findSubscriptionHandler } from "@/services/triggers/subscriptionRegistry";

/**
 * Subscription-watch renewal scheduler.
 *
 * Mirrors `runPollingTriggers.ts`. Reads every trigger_resources row whose
 * JSONB config marks it as a subscription-watch (`config.type === 'subscription-watch'`),
 * filters to those nearing expiry, gates on workflow state, and fans out
 * the per-row `renew(ctx)` calls with bounded parallelism + per-row timeout.
 *
 * Failure isolation: one row throwing returns "errors+1" in the summary;
 * the route still returns 200. The next tick is the retry — Calendar
 * watches expire after ~7 days and the cron runs every 10 minutes, so we
 * have ~1000 retry attempts before a watch goes truly cold.
 */
export interface RunRenewalsResult {
  examined: number;
  renewed: number;
  skipped: number;
  errors: number;
  startedAt: string;
}

const PER_TRIGGER_TIMEOUT_MS = 25_000;
const CONCURRENCY = 5;

export async function runRenewals(): Promise<RunRenewalsResult> {
  const startedAt = new Date().toISOString();
  const now = Date.now();

  const triggers = await triggerResourcesRepo.listByConfigContains({
    type: "subscription-watch",
  });

  const result: RunRenewalsResult = {
    examined: triggers.length,
    renewed: 0,
    skipped: 0,
    errors: 0,
    startedAt,
  };

  if (triggers.length === 0) return result;

  const eligible: TriggerResourceRecord[] = [];
  for (const trigger of triggers) {
    const handler = findSubscriptionHandler(trigger);
    if (!handler) {
      result.skipped += 1;
      continue;
    }

    const expiresAt = readExpiresAt(trigger);
    if (expiresAt === null) {
      result.skipped += 1;
      continue;
    }

    if (expiresAt - now > handler.getRenewalThresholdMs()) {
      result.skipped += 1;
      continue;
    }

    const state = await getStateForDispatch(trigger.workflowId);
    if (state !== "active") {
      // Lifecycle's deactivate hook is responsible for stopping the
      // provider-side subscription on disable; this is the in-flight-window
      // guard mirroring the polling cron.
      result.skipped += 1;
      continue;
    }

    eligible.push(trigger);
  }

  for (let i = 0; i < eligible.length; i += CONCURRENCY) {
    const batch = eligible.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((trigger) => runOne(trigger)),
    );
    for (const outcome of settled) {
      if (outcome.status === "fulfilled") {
        result.renewed += 1;
      } else {
        result.errors += 1;
      }
    }
  }

  return result;
}

async function runOne(trigger: TriggerResourceRecord): Promise<void> {
  const handler = findSubscriptionHandler(trigger);
  if (!handler) return;
  await withTimeout(
    handler.renew({ trigger }),
    PER_TRIGGER_TIMEOUT_MS,
    `subscription handler ${handler.id} for trigger ${trigger.id}`,
  );
}

function readExpiresAt(trigger: TriggerResourceRecord): number | null {
  const config = trigger.config as { expiresAt?: string };
  if (!config.expiresAt) return null;
  const parsed = Date.parse(config.expiresAt);
  return Number.isFinite(parsed) ? parsed : null;
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout (${ms}ms) — ${label}`));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
