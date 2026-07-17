import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { ProjectedMotiveFuelPurchase } from "@/integrations/_shared/motive/projections";
import { buildEventId } from "./dedup";

/**
 * Build the canonical TriggerEvent for `motive:new_fuel_purchase` — MOTIVE-1.
 * Payload mirrors the meta `payloadShape[]`. `receiptUrl` is a URL reference,
 * never bytes; the driver email is flagged sensitive in the meta.
 */
export function normalizeNewFuelPurchase(input: {
  purchase: ProjectedMotiveFuelPurchase;
  companyId: string;
}): TriggerEvent {
  const { purchase, companyId } = input;
  const id = purchase.fuelPurchaseId ?? "unknown";
  return {
    provider: "motive",
    eventType: "new_fuel_purchase",
    eventId: buildEventId(id),
    occurredAt: purchase.purchasedAt ?? new Date().toISOString(),
    providerAccountId: companyId,
    payload: {
      changeKind: "new_fuel_purchase",
      companyId,
      fuelPurchaseId: purchase.fuelPurchaseId,
      purchasedAt: purchase.purchasedAt,
      jurisdiction: purchase.jurisdiction,
      fuelType: purchase.fuelType,
      fuel: purchase.fuel,
      fuelUnit: purchase.fuelUnit,
      totalCost: purchase.totalCost,
      currency: purchase.currency,
      vendor: purchase.vendor,
      refNo: purchase.refNo,
      vehicleId: purchase.vehicle?.vehicleId ?? null,
      vehicleNumber: purchase.vehicle?.number ?? null,
      driverId: purchase.driver?.driverId ?? null,
      driverEmail: purchase.driver?.email ?? null,
    },
  };
}
