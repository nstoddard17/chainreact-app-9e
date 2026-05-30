import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { dealsCreate } from "../../_shared/hubspot/api/deals";
import { CreateDealConfigSchema } from "./createDeal.schema";

const OPTIONAL_FIELDS = [
  "pipeline",
  "amount",
  "closedate",
  "dealtype",
  "description",
  "hubspot_owner_id",
] as const;

/**
 * HubSpot `create_deal` action handler — Slice 13 Batch 1.
 *
 * POSTs `/crm/v3/objects/deals` with required dealname + dealstage.
 * Optional fields are dropped from the payload if empty.
 *
 * Output shape:
 *   { dealId, dealname, dealstage, pipeline, amount, closedate,
 *     createdAt, updatedAt, properties }
 *
 * Note: V1's createHubSpotDeal also performs deal-to-company and
 * deal-to-contact association via separate PUT calls. Slice 13 Batch 1
 * does NOT port these — association is a multi-call surface (the
 * association-types API has expanded significantly since V1's port)
 * and warrants its own slice. Workflows that need associations can
 * use HubSpot's webhook/automation features post-create.
 */
export const createDeal: ActionHandler = async (input) => {
  const config = CreateDealConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "hubspot"
      ? input.triggerEvent.providerAccountId
      : null;

  const properties: Record<string, string> = {
    dealname: config.dealname,
    dealstage: config.dealstage,
  };
  for (const k of OPTIONAL_FIELDS) {
    const v = config[k];
    if (typeof v === "string" && v.length > 0) {
      properties[k] = v;
    }
  }

  const deal = await refreshAndRetry({
    accountId: input.accountId,
    provider: "hubspot",
    providerAccountId,
    apiCall: (accessToken) =>
      dealsCreate({ accessToken, properties }),
  });

  return {
    output: {
      dealId: deal.id,
      dealname: deal.properties.dealname ?? config.dealname,
      dealstage: deal.properties.dealstage ?? config.dealstage,
      pipeline: deal.properties.pipeline ?? null,
      amount: deal.properties.amount ?? null,
      closedate: deal.properties.closedate ?? null,
      createdAt: deal.createdAt ?? null,
      updatedAt: deal.updatedAt ?? null,
      properties: deal.properties,
    },
  };
};
