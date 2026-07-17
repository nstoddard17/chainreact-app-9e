import * as dedupRepo from "@/repositories/webhookEventDedup";

/**
 * Polling-side dedup wrapper around `webhook_event_dedup` for
 * `motive:new_fuel_purchase` — MOTIVE-1. Cross-tick dedup keyed on
 * (provider, eventId) so a snapshot regression or a repeated list page never
 * fires the workflow twice. Fails CLOSED: on a dedup outage, skip enqueue this
 * tick and rely on the next poll (a duplicate run could double-create
 * downstream side effects).
 */

export interface DedupOutcome {
  fresh: boolean;
  outage: boolean;
}

export function buildEventId(fuelPurchaseId: string): string {
  return `fuel_purchase:${fuelPurchaseId}`;
}

export async function checkAndMarkSeen(
  fuelPurchaseId: string,
): Promise<DedupOutcome> {
  const eventId = buildEventId(fuelPurchaseId);
  try {
    const { fresh } = await dedupRepo.markSeen("motive", eventId);
    return { fresh, outage: false };
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "motive.new_fuel_purchase.dedup.outage",
        eventId,
        error: (err as Error).message,
      }),
    );
    return { fresh: false, outage: true };
  }
}
