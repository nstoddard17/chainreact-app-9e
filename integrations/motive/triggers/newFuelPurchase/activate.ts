import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { fuelPurchaseList } from "@/integrations/_shared/motive/api/fuelPurchases";
import { NewFuelPurchaseConfigSchema } from "./schema";

/**
 * `motive:new_fuel_purchase` activation hook — MOTIVE-1.
 *
 * Baseline-first (CLAUDE.md rule 11): BEFORE the first poll can fire, seed
 * `snapshot.maxSeenId` from the company's current highest fuel-purchase id so
 * pre-existing purchases never fire. The first poll after activation fires zero
 * events. Throws on seed failure → TRIGGER_REGISTRATION_FAILED (never swallow —
 * the first-poll-miss bug).
 *
 * Re-activation re-seeds from the current high-water; purchases created during a
 * disabled window are intentionally not replayed.
 */
export const activate: ActivationFn = async ({ node, integration }) => {
  const config = NewFuelPurchaseConfigSchema.parse(node.config ?? {});

  const result = await refreshAndRetry({
    accountId: integration.accountId,
    provider: "motive",
    providerAccountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      fuelPurchaseList({
        accessToken,
        vehicleIds: config.vehicleId,
        perPage: 100,
        pageNo: 1,
      }),
  });

  let maxSeenId = 0;
  for (const purchase of result.items) {
    const n = Number(purchase.fuelPurchaseId);
    if (Number.isInteger(n) && n > maxSeenId) maxSeenId = n;
  }

  return {
    ...(config.vehicleId ? { vehicleId: config.vehicleId } : {}),
    pollingEnabled: true,
    snapshot: {
      maxSeenId,
      capturedAt: new Date().toISOString(),
    },
  };
};
