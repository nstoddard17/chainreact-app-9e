import {
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
 * Scope gating: `propertyGet` is covered by `crm.schemas.{objectType}.read`.
 * Only object types whose schema-read scope is already granted may be wired.
 * At launch that is DEALS only (`crm.schemas.deals.read` is in the manifest).
 * Contacts / companies / tickets need a manifest scope add + re-consent and are
 * deliberately left as free text (no silent scope expansion).
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
