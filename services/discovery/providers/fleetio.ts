import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Fleetio discovery sub-registry (FLEETIO-2).
 *
 * Fleetio (`credential_paste` auth — FLEETIO-1) is the fleet-MAINTENANCE
 * counterpart to Motive. `fleetio` is in COVERED_PROVIDERS, so 1:1 handler↔meta
 * drift is enforced.
 *
 * **Coverage:** 4 actions — get_vehicle (read, FLEETIO-2), update_vehicle_status
 * (write, FLEETIO-3), create_meter_entry (write, FLEETIO-4) and
 * find_linked_vehicle (5.TRUCK-BRIDGE-1 CS-3). No triggers yet.
 *
 * The first three reuse the account-aware pickers fleetio:vehicles +
 * fleetio:vehicle_statuses — FLEETIO-4 adds NO new resolver (Fleetio derives the
 * meter unit from the account/vehicle, and primary-vs-secondary is a fixed enum).
 *
 * `find_linked_vehicle` adds no resolver either, and is the ONE Fleetio action
 * with `requiresIntegration: false`: it reads ChainReact's own
 * `account_resource_links` table and makes zero provider calls, so it is
 * runnable in test mode and unaffected by a disconnected Fleetio.
 */

import { fleetioGetVehicleMeta } from "@/integrations/fleetio/actions/getVehicle.meta";
import { fleetioUpdateVehicleStatusMeta } from "@/integrations/fleetio/actions/updateVehicleStatus.meta";
import { fleetioCreateMeterEntryMeta } from "@/integrations/fleetio/actions/createMeterEntry.meta";
import { fleetioFindLinkedVehicleMeta } from "@/integrations/fleetio/actions/findLinkedVehicle.meta";

/** Fleetio action metas — displayOrder 10.. */
export const FLEETIO_ACTION_METAS: ReadonlyArray<ActionMeta> = [
  fleetioGetVehicleMeta,
  fleetioUpdateVehicleStatusMeta,
  fleetioCreateMeterEntryMeta,
  fleetioFindLinkedVehicleMeta,
];
