import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { fuelPurchaseList } from "@/integrations/_shared/motive/api/fuelPurchases";
import { resolveCompany } from "./_resolveCompany";
import { toMotiveId } from "./_ids";
import { ListFuelPurchasesConfigSchema } from "./listFuelPurchases.schema";

/**
 * Motive `list_fuel_purchases` action handler — MOTIVE-1.
 *
 * `GET /v1/fuel_purchases` via the typed wrapper under `refreshAndRetry`.
 * Single page (rule 9) — the author loops on `pageNo`. Output is a bounded
 * list of the shared fuel-purchase projections plus paging counts; never the
 * raw records.
 */
export const listFuelPurchases: ActionHandler = async (input) => {
  const config = ListFuelPurchasesConfigSchema.parse(input.config);
  const { providerAccountId } = await resolveCompany(input);

  const vehicleIds = config.vehicleId
    ? String(toMotiveId(config.vehicleId, "vehicle id"))
    : undefined;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "motive",
    providerAccountId,
    apiCall: (accessToken) =>
      fuelPurchaseList({
        accessToken,
        startDate: config.startDate,
        endDate: config.endDate,
        fuelType: config.fuelType,
        vehicleIds,
        perPage: config.perPage,
        pageNo: config.pageNo,
      }),
  });

  return {
    output: {
      fuelPurchases: result.items,
      count: result.items.length,
      total: result.total,
    },
  };
};
