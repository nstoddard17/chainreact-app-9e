import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Fleetio discovery sub-registry (FLEETIO-2).
 *
 * Fleetio (`credential_paste` auth — FLEETIO-1) is the fleet-MAINTENANCE
 * counterpart to Motive. `fleetio` is in COVERED_PROVIDERS, so 1:1 handler↔meta
 * drift is enforced.
 *
 * **Coverage:** 2 actions — get_vehicle (read, FLEETIO-2) + update_vehicle_status
 * (write, FLEETIO-3). No triggers yet. Both reuse the account-aware pickers
 * fleetio:vehicles + fleetio:vehicle_statuses.
 */

import { fleetioGetVehicleMeta } from "@/integrations/fleetio/actions/getVehicle.meta";
import { fleetioUpdateVehicleStatusMeta } from "@/integrations/fleetio/actions/updateVehicleStatus.meta";

/** Fleetio action metas — displayOrder 10.. */
export const FLEETIO_ACTION_METAS: ReadonlyArray<ActionMeta> = [
  fleetioGetVehicleMeta,
  fleetioUpdateVehicleStatusMeta,
];
