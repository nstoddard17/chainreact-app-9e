import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { dealsUpdate } from "../../_shared/hubspot/api/deals";
import { UpdateDealConfigSchema } from "./updateDeal.schema";

const UPDATABLE_FIELDS = [
  "dealname",
  "dealstage",
  "pipeline",
  "amount",
  "closedate",
  "dealtype",
  "description",
  "hubspot_owner_id",
] as const;

/**
 * HubSpot `update_deal` action handler — Slice 13 Batch 1.
 *
 * PATCHes `/crm/v3/objects/deals/{id}`. Drops empty fields; throws if
 * no property fields are provided.
 */
export const updateDeal: ActionHandler = async (input) => {
  const config = UpdateDealConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "hubspot"
      ? input.triggerEvent.accountId
      : null;

  const properties: Record<string, string> = {};
  for (const k of UPDATABLE_FIELDS) {
    const v = config[k];
    if (typeof v === "string" && v.length > 0) {
      properties[k] = v;
    }
  }
  if (Object.keys(properties).length === 0) {
    throw new Error(
      "hubspot update_deal: at least one property field must be provided.",
    );
  }

  const deal = await refreshAndRetry({
    userId: input.userId,
    provider: "hubspot",
    accountId,
    apiCall: (accessToken) =>
      dealsUpdate({
        accessToken,
        dealId: config.dealId,
        properties,
      }),
  });

  return {
    output: {
      dealId: deal.id,
      dealname: deal.properties.dealname ?? null,
      dealstage: deal.properties.dealstage ?? null,
      pipeline: deal.properties.pipeline ?? null,
      amount: deal.properties.amount ?? null,
      closedate: deal.properties.closedate ?? null,
      updatedAt: deal.updatedAt ?? null,
      properties: deal.properties,
    },
  };
};
