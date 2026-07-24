import type { OptionItem, OptionsResolver } from "@/services/options/types";
import { fleetioListVehicles, type FleetioVehicleSummary } from "../api/vehicles";
import { mapFleetioOptionsError, requireFleetioCredentials } from "./_shared";

/**
 * `fleetio:vehicles` options resolver (FLEETIO-2).
 *
 * The reusable account-aware vehicle picker — backs Get Vehicle now, and later
 * the meter / issue / fuel / service / work-order / trigger-filter / vehicle-
 * status nodes. One bounded page of NON-archived vehicles (the `GET /vehicles`
 * endpoint excludes archived by default); search is passed SERVER-SIDE as
 * `filter[name][like]` (Fleetio's documented name filter). Values are stable
 * Fleetio vehicle ids (as strings). Labels are fleet-manager-recognizable
 * (vehicle name, e.g. "Truck 104") and never leak tokens / credential-labels /
 * owner-ids / provider hosts.
 *
 * `hasMore` is derived from Fleetio's opaque `next_cursor` (a ChainReact-owned
 * boolean hint — the provider cursor/link itself is NEVER surfaced; the resolver
 * contract exposes only `hasMore`, not a cursor). Manual entry stays available
 * at the FIELD level (meta `allowManualEntry`) even if this resolver fails.
 */
const PAGE_SIZE = 100;

/** Build a recognizable label from a vehicle summary; never emits "undefined". */
function labelFor(vehicle: FleetioVehicleSummary): string {
  const name = vehicle.name?.trim();
  if (name && name.length > 0) return name;
  // Fleetio vehicles have no `number`/plate on the list summary — fall back to
  // the stable id rather than fabricating an empty-separator label.
  return `Vehicle ${vehicle.id}`;
}

export const fleetioVehiclesResolver: OptionsResolver = {
  source: "fleetio:vehicles",
  provider: "fleetio",
  requiresIntegration: true,
  async resolve(ctx) {
    const { credentials } = requireFleetioCredentials(ctx);

    let page;
    try {
      page = await fleetioListVehicles({
        apiKey: credentials.apiKey,
        accountToken: credentials.accountToken,
        perPage: PAGE_SIZE,
        q: ctx.q,
      });
    } catch (err) {
      mapFleetioOptionsError(err, "vehicles");
    }

    const items: OptionItem[] = [];
    for (const vehicle of page.vehicles) {
      const label = labelFor(vehicle);
      // Non-secret disambiguating context only (status), never the raw record.
      const status = vehicle.vehicle_status_name?.trim();
      items.push(
        status && status.length > 0
          ? { value: String(vehicle.id), label, description: status }
          : { value: String(vehicle.id), label },
      );
    }

    return { items, hasMore: page.nextCursor !== null };
  },
};
