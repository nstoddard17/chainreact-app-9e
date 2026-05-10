import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { companiesUpdate } from "../../_shared/hubspot/api/companies";
import { UpdateCompanyConfigSchema } from "./updateCompany.schema";

const UPDATABLE_FIELDS = [
  "name",
  "domain",
  "phone",
  "website",
  "address",
  "city",
  "state",
  "zip",
  "country",
  "industry",
  "description",
  "annualrevenue",
  "numberofemployees",
  "lifecyclestage",
] as const;

/**
 * HubSpot `update_company` action handler — Slice 13 Batch 1.
 *
 * PATCHes `/crm/v3/objects/companies/{id}`. Drops empty values; throws
 * if no property fields are provided (no-op PATCH = misconfigured
 * workflow).
 */
export const updateCompany: ActionHandler = async (input) => {
  const config = UpdateCompanyConfigSchema.parse(input.config);

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
      "hubspot update_company: at least one property field must be provided.",
    );
  }

  const company = await refreshAndRetry({
    userId: input.userId,
    provider: "hubspot",
    accountId,
    apiCall: (accessToken) =>
      companiesUpdate({
        accessToken,
        companyId: config.companyId,
        properties,
      }),
  });

  return {
    output: {
      companyId: company.id,
      name: company.properties.name ?? null,
      domain: company.properties.domain ?? null,
      updatedAt: company.updatedAt ?? null,
      properties: company.properties,
    },
  };
};
