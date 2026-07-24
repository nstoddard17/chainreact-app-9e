import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Fleetio discovery sub-registry (FLEETIO-2).
 *
 * Fleetio (`credential_paste` auth — FLEETIO-1) is the fleet-MAINTENANCE
 * counterpart to Motive. Slice 2 ships the FIRST action only, so `fleetio`
 * joins COVERED_PROVIDERS with 1:1 handler↔meta drift enforced from here.
 *
 * **Coverage:** 1 action (get_vehicle). No triggers yet.
 * Account-aware pickers registered this slice: fleetio:vehicles (backs
 * get_vehicle) + fleetio:vehicle_statuses (platform surface for a later
 * Update Vehicle Status action).
 */

import { fleetioGetVehicleMeta } from "@/integrations/fleetio/actions/getVehicle.meta";

/** Fleetio action metas — displayOrder 10.. */
export const FLEETIO_ACTION_METAS: ReadonlyArray<ActionMeta> = [
  fleetioGetVehicleMeta,
];
