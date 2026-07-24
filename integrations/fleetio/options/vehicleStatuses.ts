import type { OptionItem, OptionsResolver } from "@/services/options/types";
import { fleetioListVehicleStatuses } from "../api/vehicleStatuses";
import { mapFleetioOptionsError, requireFleetioCredentials } from "./_shared";

/**
 * `fleetio:vehicle_statuses` options resolver (FLEETIO-2).
 *
 * The account's vehicle-status catalog (a small, inherently-bounded set:
 * "Active", "In Shop", "Out of Service", …). Registered + tested now because it
 * is part of the Slice 2 platform surface; its first consumer is the
 * `Update Vehicle Status` action in a later slice (NOT built here).
 *
 * Values are stable Fleetio status ids (as strings); labels are the status
 * names. Ordering follows Fleetio's own `position` (then id) so the list reads
 * the way it does inside Fleetio — deterministic. One bounded page; an empty
 * catalog returns an empty option set (never an error). No raw record, no
 * provider URL, no credential ever surfaced.
 */
const PAGE_SIZE = 100;

export const fleetioVehicleStatusesResolver: OptionsResolver = {
  source: "fleetio:vehicle_statuses",
  provider: "fleetio",
  requiresIntegration: true,
  async resolve(ctx) {
    const { credentials } = requireFleetioCredentials(ctx);

    let statuses;
    try {
      statuses = await fleetioListVehicleStatuses({
        apiKey: credentials.apiKey,
        accountToken: credentials.accountToken,
        perPage: PAGE_SIZE,
      });
    } catch (err) {
      mapFleetioOptionsError(err, "vehicle statuses");
    }

    // Deterministic: provider `position` first (Fleetio's own order), id as the
    // stable tiebreak. Statuses without a position sort after those with one.
    const ordered = [...statuses].sort((a, b) => {
      const pa = a.position ?? Number.MAX_SAFE_INTEGER;
      const pb = b.position ?? Number.MAX_SAFE_INTEGER;
      if (pa !== pb) return pa - pb;
      return a.id - b.id;
    });

    const items: OptionItem[] = ordered.map((status) => ({
      value: String(status.id),
      label: status.name?.trim() || `Status ${status.id}`,
    }));

    return { items, hasMore: false };
  },
};
