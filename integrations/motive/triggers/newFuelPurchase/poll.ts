import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { enqueueRun } from "@/services/execution/enqueue";
import { getActiveForExecution } from "@/repositories/integrations";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import type { PollingHandler } from "@/services/triggers/pollingRegistry";
import { DEFAULT_INTERVAL_MS } from "@/services/cron/pollingIntervals";
import { fuelPurchaseList } from "@/integrations/_shared/motive/api/fuelPurchases";
import { checkAndMarkSeen } from "./dedup";
import { normalizeNewFuelPurchase } from "./normalize";
import { NewFuelPurchaseConfigSchema } from "./schema";

/**
 * `motive:new_fuel_purchase` polling handler — MOTIVE-1.
 *
 * Motive exposes no fuel-purchase webhook, so this polls
 * `GET /v1/fuel_purchases`. Per-tick:
 *   1. Parse config; missing snapshot → warn + skip (activate seeds it).
 *   2. Resolve the account's Motive integration; missing → warn + skip.
 *   3. Fetch one recent page (optional vehicle filter). Fire on purchases whose
 *      NUMERIC id exceeds `snapshot.maxSeenId` (id high-water — robust to
 *      back-dated `purchased_at`). Advance the high-water to the max fetched id
 *      BEFORE dispatch so a batch is never re-polled.
 *   4. Per fresh purchase: `webhook_event_dedup` (cross-tick safety) →
 *      normalize → enqueueRun. One bad row never aborts the tick.
 *
 * Bound: 100 purchases per tick. Assumes Motive ids increase monotonically —
 * confirmed at live cert; dedup remains correct even if that assumption breaks
 * (it only affects backlog suppression).
 */

const HANDLER_ID = "motive/new_fuel_purchase";
const PAGE_BATCH = 100;

async function poll(input: {
  trigger: import("@/repositories/triggerResources").TriggerResourceRecord;
  userRole: string;
  now: number;
}): Promise<void> {
  const { trigger } = input;
  const config = NewFuelPurchaseConfigSchema.parse(trigger.config);

  if (!config.snapshot) {
    console.warn(
      JSON.stringify({
        event: "motive.new_fuel_purchase.poll.no_snapshot",
        triggerId: trigger.id,
        workflowId: trigger.workflowId,
      }),
    );
    return;
  }

  if (!trigger.workflowAccountId) {
    console.warn(
      JSON.stringify({
        event: "motive.new_fuel_purchase.poll.no_account",
        triggerId: trigger.id,
      }),
    );
    return;
  }

  const integration = await getActiveForExecution(
    trigger.workflowAccountId,
    "motive",
    null,
  );
  if (!integration) {
    console.warn(
      JSON.stringify({
        event: "motive.new_fuel_purchase.poll.no_integration",
        triggerId: trigger.id,
        workflowId: trigger.workflowId,
      }),
    );
    return;
  }
  const companyId = integration.providerAccountId;
  const previousMax = config.snapshot.maxSeenId;

  const result = await refreshAndRetry({
    accountId: trigger.workflowAccountId,
    provider: "motive",
    providerAccountId: companyId,
    apiCall: (accessToken) =>
      fuelPurchaseList({
        accessToken,
        vehicleIds: config.vehicleId,
        perPage: PAGE_BATCH,
        pageNo: 1,
      }),
  });

  // Advance the high-water to max(previous, any fetched numeric id) so we never
  // re-poll the same batch — even if every fetched row was already seen.
  let newMax = previousMax;
  const fresh: typeof result.items = [];
  for (const purchase of result.items) {
    const n = Number(purchase.fuelPurchaseId);
    if (!Number.isInteger(n)) continue;
    if (n > newMax) newMax = n;
    if (n > previousMax) fresh.push(purchase);
  }

  // Fire oldest → newest (ascending id) so downstream sees creation order.
  fresh.sort(
    (a, b) => Number(a.fuelPurchaseId) - Number(b.fuelPurchaseId),
  );

  for (const purchase of fresh) {
    const id = purchase.fuelPurchaseId;
    if (!id) continue;
    try {
      const dedup = await checkAndMarkSeen(id);
      if (dedup.outage || !dedup.fresh) continue;

      const event = normalizeNewFuelPurchase({ purchase, companyId });
      await enqueueRun({
        workflowId: trigger.workflowId,
        triggerNodeId: trigger.nodeId,
        event,
      });
    } catch (err) {
      console.warn(
        JSON.stringify({
          event: "motive.new_fuel_purchase.poll.row_failed",
          triggerId: trigger.id,
          fuelPurchaseId: id,
          error: (err as Error).message,
        }),
      );
    }
  }

  await triggerResourcesRepo.updateConfig(trigger.id, {
    ...config,
    snapshot: {
      maxSeenId: newMax,
      capturedAt: config.snapshot.capturedAt,
    },
    polling: {
      lastPolledAt: new Date(input.now).toISOString(),
    },
  });
}

export const motiveNewFuelPurchasePollingHandler: PollingHandler = {
  id: HANDLER_ID,
  canHandle: (trigger) =>
    trigger.provider === "motive" && trigger.eventType === "new_fuel_purchase",
  getIntervalMs: () => DEFAULT_INTERVAL_MS,
  poll,
};
