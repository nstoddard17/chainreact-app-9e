import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { OptionItem, OptionsResolver } from "@/services/options/types";
import { propertiesList } from "@/integrations/_shared/hubspot/api/properties";
import { mapHubspotOptionsError, requireHubspotIntegration } from "./_shared";

/**
 * `hubspot:{contact,company,deal,ticket,product,line_item}_properties`
 * property-NAME resolvers — RESOLVERS-1.
 *
 * Back the get-family `filterProperty` combobox and the per-chip
 * `properties` picker on get_contacts / get_companies / get_deals /
 * get_tickets / get_products / get_line_items: authors pick from the
 * portal's REAL property definitions (standard + custom) instead of
 * hand-typing internal names.
 *
 * Endpoint: GET /crm/v3/properties/{objectType} (api/properties.ts
 * `propertiesList`; docs:
 * https://developers.hubspot.com/docs/guides/api/crm/properties).
 * HubSpot returns the full set in one unpaged response → local `ctx.q`
 * filtering (matches label OR internal name so "hs_" prefix searches
 * work), alpha-sorted by label, `hasMore: false`.
 *
 * Mapping (property definition → OptionItem):
 *   - `value`: the INTERNAL property name (what the search endpoint's
 *     filters + `properties` list expect) — never the display label.
 *   - `label`: the human display label (falls back to the name).
 *   - `description`: the internal name when it differs from the label,
 *     so authors can disambiguate similarly-labelled properties.
 *   - portal-hidden properties are dropped.
 * No property VALUES are ever read — definitions only (names + labels).
 *
 * Scopes: per HubSpot's public API spec the properties read accepts the
 * schema-read scopes OR the object read scopes as alternatives. The
 * manifest carries `crm.schemas.{contacts,companies,deals}.read`;
 * tickets ride the broad `tickets` scope (no granular
 * `crm.schemas.tickets.read` exists — modernization closeout §11);
 * products / line_items ride their already-granted
 * `crm.objects.{products,line_items}.read` scopes. A 403 maps to
 * `PROVIDER_REAUTH_REQUIRED`; the fields keep `allowManualEntry` so
 * free-text property names still work regardless.
 */

interface MakePropertyNamesInput {
  /** Source key, e.g. "hubspot:contact_properties". */
  source: string;
  /** HubSpot object type path segment, e.g. "contacts". */
  objectType: string;
  /** Noun for the sanitized PROVIDER_ERROR copy, e.g. "contact properties". */
  what: string;
}

export function makeHubspotPropertyNamesResolver(
  input: MakePropertyNamesInput,
): OptionsResolver {
  const { source, objectType, what } = input;
  return {
    source,
    provider: "hubspot",
    requiresIntegration: true,
    async resolve(ctx) {
      const integration = requireHubspotIntegration(ctx);

      let response;
      try {
        response = await refreshAndRetry({
          accountId: integration.accountId,
          provider: "hubspot",
          providerAccountId: null,
          apiCall: (accessToken) =>
            propertiesList({ accessToken, objectType }),
        });
      } catch (err) {
        mapHubspotOptionsError(err, what);
      }

      const items: OptionItem[] = [];
      for (const property of response.results ?? []) {
        if (typeof property.name !== "string" || property.name.length === 0) {
          continue;
        }
        if (property.hidden === true) continue;
        const label =
          typeof property.label === "string" && property.label.length > 0
            ? property.label
            : property.name;
        items.push(
          label === property.name
            ? { value: property.name, label }
            : { value: property.name, label, description: property.name },
        );
      }

      // Local q filter over label AND internal name (authors search
      // either "Lead status" or "hs_lead_status"), then alpha sort.
      const lowerQ = ctx.q.toLowerCase();
      const filtered =
        lowerQ.length > 0
          ? items.filter(
              (item) =>
                item.label.toLowerCase().includes(lowerQ) ||
                item.value.toLowerCase().includes(lowerQ),
            )
          : items;
      filtered.sort((a, b) => a.label.localeCompare(b.label));

      // Full definition set arrives in one response — nothing beyond it.
      return { items: filtered, hasMore: false };
    },
  };
}

/** `hubspot:contact_properties` — contact property names for get_contacts. */
export const hubspotContactPropertiesResolver: OptionsResolver =
  makeHubspotPropertyNamesResolver({
    source: "hubspot:contact_properties",
    objectType: "contacts",
    what: "contact properties",
  });

/** `hubspot:company_properties` — company property names for get_companies. */
export const hubspotCompanyPropertiesResolver: OptionsResolver =
  makeHubspotPropertyNamesResolver({
    source: "hubspot:company_properties",
    objectType: "companies",
    what: "company properties",
  });

/** `hubspot:deal_properties` — deal property names for get_deals. */
export const hubspotDealPropertiesResolver: OptionsResolver =
  makeHubspotPropertyNamesResolver({
    source: "hubspot:deal_properties",
    objectType: "deals",
    what: "deal properties",
  });

/** `hubspot:ticket_properties` — ticket property names for get_tickets. */
export const hubspotTicketPropertiesResolver: OptionsResolver =
  makeHubspotPropertyNamesResolver({
    source: "hubspot:ticket_properties",
    objectType: "tickets",
    what: "ticket properties",
  });

/** `hubspot:product_properties` — product property names for get_products. */
export const hubspotProductPropertiesResolver: OptionsResolver =
  makeHubspotPropertyNamesResolver({
    source: "hubspot:product_properties",
    objectType: "products",
    what: "product properties",
  });

/** `hubspot:line_item_properties` — line item property names for get_line_items. */
export const hubspotLineItemPropertiesResolver: OptionsResolver =
  makeHubspotPropertyNamesResolver({
    source: "hubspot:line_item_properties",
    objectType: "line_items",
    what: "line item properties",
  });
