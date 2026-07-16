import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { OptionItem, OptionsResolver } from "@/services/options/types";
import {
  objectsSearchByQuery,
  type ObjectsSearchByQueryInput,
} from "@/integrations/_shared/hubspot/api/objectSearch";
import { mapHubspotOptionsError, requireHubspotIntegration } from "./_shared";

/**
 * `hubspot:{contacts,companies,deals,tickets,products,line_items}` record
 * pickers — RESOLVERS-1.
 *
 * Back the raw-ID fields on the update-family actions (update_contact /
 * update_company / update_deal / update_ticket / update_product /
 * update_line_item / remove_line_item), create_line_item's dealId +
 * hs_product_id, and the engagement association fields on create_note /
 * create_task / create_call / create_meeting.
 *
 * SERVER-side search: HubSpot's CRM search endpoint is search-shaped, so
 * `ctx.q` is passed straight through as the endpoint's `query` param
 * (POST /crm/v3/objects/{objectType}/search — see api/objectSearch.ts;
 * docs: https://developers.hubspot.com/docs/guides/api/crm/search).
 * One bounded page of 50; `hasMore` is honest from HubSpot's paging
 * cursor / total ("refine with search" hint — pagination is not a
 * cursor here). No local re-sort: HubSpot's relevance/recency order is
 * the useful order for a search-shaped picker.
 *
 * Labels are the record's DISPLAY property only:
 *   - contact: `firstname lastname` (fallback: the id — NEVER the email;
 *     email is not even requested from the API),
 *   - company: `name` · deal: `dealname` · ticket: `subject` ·
 *     product / line item: `name`.
 * `description` carries the record id for disambiguation; `value` is the
 * id string the handler schemas store.
 *
 * Scopes — all reads covered by scopes already in the manifest:
 * `crm.objects.{contacts,companies,deals,products,line_items}.read`;
 * tickets ride the broad `tickets` scope. No reconnect required.
 *
 * Access gating is central (`services/options/resolveOptionsSource.ts`);
 * resolvers carry no auth logic beyond the integration guard.
 */

const PAGE_SIZE = 50;

interface MakeRecordSearchInput {
  /** Source key, e.g. "hubspot:contacts". */
  source: string;
  /** CRM object type path segment, e.g. "contacts". */
  objectType: ObjectsSearchByQueryInput["objectType"];
  /**
   * Display properties requested per row — the MINIMAL set the label
   * needs. Never includes email/phone/amount properties.
   */
  properties: readonly string[];
  /** Builds the human label from the requested properties; null → id fallback. */
  buildLabel: (properties: Record<string, string | null>) => string | null;
  /** Plural noun for the sanitized PROVIDER_ERROR copy, e.g. "contacts". */
  what: string;
}

function makeHubspotRecordSearchResolver(
  input: MakeRecordSearchInput,
): OptionsResolver {
  const { source, objectType, properties, buildLabel, what } = input;
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
            objectsSearchByQuery({
              accessToken,
              objectType,
              limit: PAGE_SIZE,
              properties,
              ...(ctx.q.length > 0 ? { query: ctx.q } : {}),
            }),
        });
      } catch (err) {
        mapHubspotOptionsError(err, what);
      }

      const items: OptionItem[] = [];
      for (const record of response.results ?? []) {
        if (typeof record.id !== "string" || record.id.length === 0) continue;
        const built = buildLabel(record.properties ?? {});
        const label =
          typeof built === "string" && built.trim().length > 0
            ? built.trim()
            : record.id;
        items.push({ value: record.id, label, description: record.id });
      }

      const hasMore =
        (typeof response.paging?.next?.after === "string" &&
          response.paging.next.after.length > 0) ||
        (typeof response.total === "number" && response.total > items.length);

      return { items, hasMore };
    },
  };
}

/** Reads a single string property off the HubSpot property map, or null. */
function prop(
  properties: Record<string, string | null>,
  name: string,
): string | null {
  const v = properties[name];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/**
 * `hubspot:contacts` — label is `firstname lastname` ONLY (id fallback).
 * Email is deliberately neither requested nor displayed (PII posture —
 * mirrors `slack:users`' no-email rule).
 */
export const hubspotContactsResolver: OptionsResolver =
  makeHubspotRecordSearchResolver({
    source: "hubspot:contacts",
    objectType: "contacts",
    properties: ["firstname", "lastname"],
    buildLabel: (p) => {
      const first = prop(p, "firstname");
      const last = prop(p, "lastname");
      if (first && last) return `${first} ${last}`;
      return first ?? last;
    },
    what: "contacts",
  });

/** `hubspot:companies` — label is the company `name` (id fallback). */
export const hubspotCompaniesResolver: OptionsResolver =
  makeHubspotRecordSearchResolver({
    source: "hubspot:companies",
    objectType: "companies",
    properties: ["name"],
    buildLabel: (p) => prop(p, "name"),
    what: "companies",
  });

/** `hubspot:deals` — label is the `dealname` (id fallback). Never the amount. */
export const hubspotDealsResolver: OptionsResolver =
  makeHubspotRecordSearchResolver({
    source: "hubspot:deals",
    objectType: "deals",
    properties: ["dealname"],
    buildLabel: (p) => prop(p, "dealname"),
    what: "deals",
  });

/** `hubspot:tickets` — label is the ticket `subject` (id fallback). */
export const hubspotTicketsResolver: OptionsResolver =
  makeHubspotRecordSearchResolver({
    source: "hubspot:tickets",
    objectType: "tickets",
    properties: ["subject"],
    buildLabel: (p) => prop(p, "subject"),
    what: "tickets",
  });

/** `hubspot:products` — label is the product `name` (id fallback). Never the price. */
export const hubspotProductsResolver: OptionsResolver =
  makeHubspotRecordSearchResolver({
    source: "hubspot:products",
    objectType: "products",
    properties: ["name"],
    buildLabel: (p) => prop(p, "name"),
    what: "products",
  });

/** `hubspot:line_items` — label is the line item `name` (id fallback). Never amounts. */
export const hubspotLineItemsResolver: OptionsResolver =
  makeHubspotRecordSearchResolver({
    source: "hubspot:line_items",
    objectType: "line_items",
    properties: ["name"],
    buildLabel: (p) => prop(p, "name"),
    what: "line items",
  });
