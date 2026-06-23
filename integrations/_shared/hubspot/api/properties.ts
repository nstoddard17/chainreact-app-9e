import { hubspotRequest, crmPath } from "./_request";

/**
 * HubSpot CRM v3 `properties` resource wrapper — property metadata read.
 *
 * Endpoint:
 *   - GET /crm/v3/properties/{objectType}/{propertyName}
 *     Returns one property's definition, including its enumeration `options`
 *     for `enumeration`-typed properties (dropdowns / checkboxes / radios).
 *
 * Used by the `hubspot:property_options` resolver family to read a portal's
 * REAL, customizable enum options for a property (e.g. `dealtype` on deals)
 * instead of imposing a hardcoded list that would reject valid custom values.
 *
 * Scope: this read is covered by `crm.schemas.{objectType}.read`. Only object
 * types whose schema-read scope is in the HubSpot manifest may be wired (at
 * the time of writing: deals — `crm.schemas.deals.read`). Other object types
 * require a manifest scope add + re-consent and are intentionally NOT wired.
 */

/** One enumeration option as HubSpot returns it. */
export interface HubSpotPropertyOption {
  label: string;
  value: string;
  description?: string | null;
  displayOrder?: number | null;
  hidden?: boolean | null;
}

export interface HubSpotProperty {
  name: string;
  label?: string | null;
  type?: string | null;
  fieldType?: string | null;
  options?: HubSpotPropertyOption[] | null;
}

export interface PropertyGetInput {
  accessToken: string;
  /** HubSpot object type — e.g. "deals", "contacts", "tickets". */
  objectType: string;
  /** Internal property name — e.g. "dealtype", "lifecyclestage". */
  propertyName: string;
}

export async function propertyGet(
  input: PropertyGetInput,
): Promise<HubSpotProperty> {
  return hubspotRequest<HubSpotProperty>({
    accessToken: input.accessToken,
    method: "GET",
    path: crmPath(
      `properties/${encodeURIComponent(input.objectType)}/${encodeURIComponent(input.propertyName)}`,
    ),
    resourceForNotFound: `property ${input.objectType}.${input.propertyName}`,
  });
}
