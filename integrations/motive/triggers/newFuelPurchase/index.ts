import { registerActivation } from "@/services/triggers/activationRegistry";
import { registerPollingHandler } from "@/services/triggers/pollingRegistry";
import { activate } from "./activate";
import { motiveNewFuelPurchasePollingHandler } from "./poll";

/**
 * Module-init registration for the Motive `new_fuel_purchase` polling trigger —
 * MOTIVE-1.
 *
 * Registers BOTH the activation hook (seeds `snapshot.maxSeenId` — first-poll-miss
 * protection) and the polling handler (5-minute default cadence). Motive exposes
 * no fuel-purchase webhook, so polling is the only path. Imported transitively by
 * `integrations/_registry.ts` (the cron `poll-triggers` route pulls it in before
 * the first poll).
 */
registerActivation("motive", "new_fuel_purchase", activate);
registerPollingHandler(motiveNewFuelPurchasePollingHandler);

export { activate, motiveNewFuelPurchasePollingHandler };
