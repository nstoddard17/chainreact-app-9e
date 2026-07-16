import { hubspotRequest, crmPath } from "./_request";

/**
 * HubSpot CRM v3 `properties` resource wrapper — property metadata read.
 *
 * Endpoints:
 *   - GET /crm/v3/properties/{objectType}/{propertyName}
 *     Returns one property's definition, including its enumeration `options`
 *     for `enumeration`-typed properties (dropdowns / checkboxes / radios).
 *   - GET /crm/v3/properties/{objectType} (RESOLVERS-1)
 *     Returns every non-archived property definition for the object type.
 *     Docs: https://developers.hubspot.com/docs/guides/api/crm/properties
 *
 * Used by the `hubspot:property_options` resolver family to read a portal's
 * REAL, customizable enum options for a property (e.g. `dealtype` on deals)
 * instead of imposing a hardcoded list that would reject valid custom values,
 * and by the `hubspot:{object}_properties` property-NAME resolvers backing
 * the get-family `filterProperty` / `properties` pickers.
 *
 * Scope: per HubSpot's public API spec, the properties reads accept EITHER
 * `crm.schemas.{objectType}.read` OR the object-level read/write scopes
 * (`crm.objects.{objectType}.read`, broad `tickets`, `automation`, …) as
 * alternatives. The manifest carries schema-read scopes for deals/contacts/
 * companies; tickets ride the broad `tickets` scope; products/line_items ride
 * their `crm.objects.*.read` scopes. A 403 (token predating a scope) maps to
 * `PROVIDER_REAUTH_REQUIRED` at the resolver layer; manual entry keeps the
 * field usable regardless.
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
  /** True for portal-hidden properties — dropped from author-facing pickers. */
  hidden?: boolean | null;
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

// ─── propertiesList (RESOLVERS-1) ───────────────────────────────────────────

export interface PropertiesListInput {
  accessToken: string;
  /** HubSpot object type — e.g. "deals", "contacts", "line_items". */
  objectType: string;
}

export interface PropertiesListResponse {
  results: HubSpotProperty[];
}

/**
 * List every (non-archived) property definition for an object type:
 * `GET /crm/v3/properties/{objectType}`. Single unpaged response —
 * HubSpot returns the full property set in one call.
 */
export async function propertiesList(
  input: PropertiesListInput,
): Promise<PropertiesListResponse> {
  return hubspotRequest<PropertiesListResponse>({
    accessToken: input.accessToken,
    method: "GET",
    path: crmPath(`properties/${encodeURIComponent(input.objectType)}`),
    resourceForNotFound: `properties for ${input.objectType}`,
  });
}
