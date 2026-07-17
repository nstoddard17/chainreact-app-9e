import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { OptionItem, OptionsResolver } from "@/services/options/types";
import { vehicleList } from "@/integrations/_shared/motive/api/vehicles";
import {
  filterAndSortByLabel,
  mapMotiveOptionsError,
  requireMotiveIntegration,
} from "./_shared";

/**
 * `motive:vehicles` options resolver — MOTIVE-1.
 *
 * Backs the vehicle pickers on the vehicle actions/triggers. One bounded
 * page of vehicles; the V2 posture for ≤100-row catalogs is local `ctx.q`
 * filtering (Calendly/QuickBooks precedent). Values are Motive vehicle ids.
 * Labels are recognizable — the fleet `number` plus make/model context to
 * disambiguate duplicates — and never leak tokens/credential-labels/owner-ids.
 */
const PAGE_SIZE = 100;

export const motiveVehiclesResolver: OptionsResolver = {
  source: "motive:vehicles",
  provider: "motive",
  requiresIntegration: true,
  async resolve(ctx) {
    const integration = requireMotiveIntegration(ctx);

    let vehicles;
    try {
      vehicles = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "motive",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) => vehicleList({ accessToken, perPage: PAGE_SIZE }),
      });
    } catch (err) {
      mapMotiveOptionsError(err, "vehicles");
    }

    const items: OptionItem[] = [];
    for (const vehicle of vehicles) {
      if (!vehicle.vehicleId) continue;
      const primary = vehicle.number?.trim();
      const context = [vehicle.make?.trim(), vehicle.model?.trim()]
        .filter((part): part is string => !!part && part.length > 0)
        .join(" ");
      let label: string;
      if (primary && primary.length > 0) {
        label = context ? `${primary} — ${context}` : primary;
      } else {
        label = context || vehicle.vehicleId;
      }
      items.push({ value: vehicle.vehicleId, label });
    }

    return {
      items: filterAndSortByLabel(items, ctx.q),
      hasMore: vehicles.length === PAGE_SIZE,
    };
  },
};
