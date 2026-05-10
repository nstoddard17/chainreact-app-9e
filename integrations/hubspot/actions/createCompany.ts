import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  companiesCreate,
  companiesUpdate,
  findCompanyByDomain,
  type HubSpotCompany,
} from "../../_shared/hubspot/api/companies";
import { ConflictError } from "../../_shared/hubspot/errors";
import { CreateCompanyConfigSchema } from "./createCompany.schema";

const OPTIONAL_FIELDS = [
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
 * HubSpot `create_company` action handler — Slice 13 Batch 1.
 *
 * POSTs `/crm/v3/objects/companies`. Duplicate-handling mirrors
 * `create_contact` — on 409 ConflictError, optionally search-by-domain
 * + PATCH/return. `findCompanyByDomain` is the deterministic recovery
 * path (V2 fix for V1's no-recovery shape).
 *
 * Note: V1's createHubSpotCompany doesn't ship a duplicate-handling
 * field — V2 adds it for parity with create_contact and to give
 * workflow authors a clean upsert path.
 *
 * If the user picked `'update'` / `'skip'` but didn't supply a
 * `domain`, the recovery search has nothing to query against — falls
 * back to re-throwing the original ConflictError. Workflows that want
 * upsert semantics SHOULD supply a domain.
 */
export const createCompany: ActionHandler = async (input) => {
  const config = CreateCompanyConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "hubspot"
      ? input.triggerEvent.accountId
      : null;

  const properties: Record<string, string> = { name: config.name };
  for (const k of OPTIONAL_FIELDS) {
    const v = config[k];
    if (typeof v === "string" && v.length > 0) {
      properties[k] = v;
    }
  }

  let wasUpdate = false;
  let wasSkip = false;
  let company: HubSpotCompany;

  try {
    company = await refreshAndRetry({
      userId: input.userId,
      provider: "hubspot",
      accountId,
      apiCall: (accessToken) =>
        companiesCreate({ accessToken, properties }),
    });
  } catch (err) {
    if (
      !(err instanceof ConflictError) ||
      config.duplicateHandling === "fail" ||
      !config.domain
    ) {
      throw err;
    }
    const existing = await refreshAndRetry({
      userId: input.userId,
      provider: "hubspot",
      accountId,
      apiCall: (accessToken) =>
        findCompanyByDomain({ accessToken, domain: config.domain! }),
    });
    if (!existing) {
      throw err;
    }
    if (config.duplicateHandling === "skip") {
      company = existing;
      wasSkip = true;
    } else {
      company = await refreshAndRetry({
        userId: input.userId,
        provider: "hubspot",
        accountId,
        apiCall: (accessToken) =>
          companiesUpdate({
            accessToken,
            companyId: existing.id,
            properties,
          }),
      });
      wasUpdate = true;
    }
  }

  return {
    output: {
      companyId: company.id,
      name: company.properties.name ?? config.name,
      domain: company.properties.domain ?? null,
      createdAt: company.createdAt ?? null,
      updatedAt: company.updatedAt ?? null,
      wasUpdate,
      wasSkip,
      properties: company.properties,
    },
  };
};
