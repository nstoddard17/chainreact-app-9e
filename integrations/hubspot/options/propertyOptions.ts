import {
  InsufficientScopeError,
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { propertyGet } from "@/integrations/_shared/hubspot/api/properties";

/**
 * `hubspot:property_options` resolver family — reads a HubSpot property's REAL,
 * portal-customizable enumeration options so authors pick from the values that
 * actually exist in the connected portal instead of a hardcoded guess.
 *
 * Why a per-property factory (and not one generic source): a resolver's only
 * inputs are its `source` key + the `deps[*]` query params, and `deps` values
 * come from SIBLING field values — there is no channel for a constant
 * (objectType, propertyName) pair tied to a specific field. So each wired
 * property registers its own source via `makeHubspotPropertyOptionsResolver`,
 * which closes over the constants. The fetch / sanitize / error logic is shared.
 *
 * Scope gating: `propertyGet` is covered by `crm.schemas.{objectType}.read`
 * (deals/contacts/companies) — those scopes are in the manifest. Tickets has no
 * granular `crm.schemas.tickets.read` scope in HubSpot's catalog; the broad,
 * already-granted `tickets` scope covers ticket property reads. A token that
 * predates a newly-required scope returns HTTP 403 → `InsufficientScopeError` →
 * `PROVIDER_REAUTH_REQUIRED` (reconnect prompt; refresh can't add a scope). The
 * field keeps `allowManualEntry`, so it stays usable meanwhile.
 *
 * Mapping (HubSpot option → OptionItem):
 *   - `value`: the INTERNAL option value HubSpot stores (what the property
 *     write expects) — never the display label.
 *   - `label`: the human display label (falls back to the value).
 *   - hidden options are dropped so deprecated/internal values stay out of the
 *     picker.
 * The field keeps `allowManualEntry` so a custom value the read can't list is
 * still settable.
 */

interface MakeResolverInput {
  /** Source key, e.g. "hubspot:deal_dealtype". */
  source: string;
  /** HubSpot object type, e.g. "deals". */
  objectType: string;
  /** Internal property name, e.g. "dealtype". */
  propertyName: string;
}

export function makeHubspotPropertyOptionsResolver(
  input: MakeResolverInput,
): OptionsResolver {
  const { source, objectType, propertyName } = input;
  return {
    source,
    provider: "hubspot",
    requiresIntegration: true,
    async resolve(ctx) {
      if (!ctx.integration) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "No active HubSpot integration. Connect HubSpot first.",
        );
      }

      const integration = ctx.integration;

      let property;
      try {
        property = await refreshAndRetry({
          accountId: integration.accountId,
          provider: "hubspot",
          providerAccountId: null,
          apiCall: (accessToken) =>
            propertyGet({ accessToken, objectType, propertyName }),
        });
      } catch (err) {
        if (err instanceof InsufficientScopeError) {
          // Old token missing the schema-read scope — reconnect to grant it.
          throw new OptionsResolverError(
            "PROVIDER_REAUTH_REQUIRED",
            "Reconnect HubSpot to allow reading this property's options.",
          );
        }
        if (
          err instanceof IntegrationActionRequiredError ||
          err instanceof Unauthorized401Error
        ) {
          throw new OptionsResolverError(
            "INTEGRATION_DISCONNECTED",
            "Reconnect HubSpot and try again.",
          );
        }
        throw new OptionsResolverError(
          "PROVIDER_ERROR",
          "Couldn't load HubSpot property options. Try again.",
        );
      }

      const items: Array<{ value: string; label: string; description?: string }> =
        [];
      for (const opt of property.options ?? []) {
        if (typeof opt.value !== "string" || opt.value.length === 0) continue;
        if (opt.hidden === true) continue;
        const label =
          typeof opt.label === "string" && opt.label.length > 0
            ? opt.label
            : opt.value;
        const description =
          typeof opt.description === "string" && opt.description.length > 0
            ? opt.description
            : undefined;
        items.push(description ? { value: opt.value, label, description } : { value: opt.value, label });
      }

      const lowerQ = ctx.q.toLowerCase();
      const filtered =
        lowerQ.length > 0
          ? items.filter(
              (item) =>
                item.label.toLowerCase().includes(lowerQ) ||
                item.value.toLowerCase().includes(lowerQ),
            )
          : items;

      // HubSpot returns the full option set in one response (no paging).
      return { items: filtered, hasMore: false };
    },
  };
}

/**
 * `hubspot:deal_dealtype` — the portal's deal-type enum (`dealtype` property on
 * deals). Read covered by the already-granted `crm.schemas.deals.read` scope.
 */
export const hubspotDealTypeOptionsResolver: OptionsResolver =
  makeHubspotPropertyOptionsResolver({
    source: "hubspot:deal_dealtype",
    objectType: "deals",
    propertyName: "dealtype",
  });

// CONFIG-FIELD-UX-SWEEP-4 (Marcus-approved pre-launch scope adds). Contacts +
// companies use the newly-added `crm.schemas.{contacts,companies}.read` scopes;
// tickets uses the existing broad `tickets` scope (HubSpot has no granular
// `crm.schemas.tickets.read`). All keep `allowManualEntry` for custom values.

/** `lifecyclestage` enum on contacts. */
export const hubspotContactLifecycleStageOptionsResolver: OptionsResolver =
  makeHubspotPropertyOptionsResolver({
    source: "hubspot:contact_lifecyclestage",
    objectType: "contacts",
    propertyName: "lifecyclestage",
  });

/** `hs_lead_status` enum on contacts. */
export const hubspotContactLeadStatusOptionsResolver: OptionsResolver =
  makeHubspotPropertyOptionsResolver({
    source: "hubspot:contact_lead_status",
    objectType: "contacts",
    propertyName: "hs_lead_status",
  });

/** `lifecyclestage` enum on companies. */
export const hubspotCompanyLifecycleStageOptionsResolver: OptionsResolver =
  makeHubspotPropertyOptionsResolver({
    source: "hubspot:company_lifecyclestage",
    objectType: "companies",
    propertyName: "lifecyclestage",
  });

/** `hs_ticket_category` enum on tickets. */
export const hubspotTicketCategoryOptionsResolver: OptionsResolver =
  makeHubspotPropertyOptionsResolver({
    source: "hubspot:ticket_category",
    objectType: "tickets",
    propertyName: "hs_ticket_category",
  });

/** `source_type` enum on tickets. */
export const hubspotTicketSourceTypeOptionsResolver: OptionsResolver =
  makeHubspotPropertyOptionsResolver({
    source: "hubspot:ticket_source_type",
    objectType: "tickets",
    propertyName: "source_type",
  });

/**
 * `hubspot:call_disposition` — RESOLVERS-1. The portal's call-outcome enum
 * (`hs_call_disposition` on calls). Values are portal-configured GUIDs with
 * human labels ("Connected", "No answer", …) — exactly the picker-vs-paste
 * case: authors can't guess a GUID, so create_call's field was free text.
 * Reads GET /crm/v3/properties/calls/hs_call_disposition.
 *
 * Scope note: the manifest has no calls-specific scope; per HubSpot's public
 * API spec the properties read accepts the already-granted `automation` /
 * `tickets` scopes among its alternatives, so this is expected to work like
 * the ticket property reads (closeout §11 posture) — needs live smoke. If a
 * portal 403s, the resolver maps to PROVIDER_REAUTH_REQUIRED and the field's
 * `allowManualEntry` keeps free-text GUIDs working.
 */
export const hubspotCallDispositionOptionsResolver: OptionsResolver =
  makeHubspotPropertyOptionsResolver({
    source: "hubspot:call_disposition",
    objectType: "calls",
    propertyName: "hs_call_disposition",
  });
