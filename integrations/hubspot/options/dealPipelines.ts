import {
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { pipelinesList } from "@/integrations/_shared/hubspot/api/pipelines";
import { mapPipelineToOption } from "./_pipelineMapping";

/**
 * `hubspot:deal_pipelines` options resolver — Slice 3.HUBSPOT-2.
 *
 * Backs the `pipeline` field on `create_deal` + `update_deal`. Lists
 * every non-archived deal pipeline visible to the connected HubSpot
 * portal via `GET /crm/v3/pipelines/deals`.
 *
 * Architecture mirrors `hubspot:owners`:
 *   - `requiresIntegration: true`.
 *   - No `requiredDeps` — pipelines are portal-scoped.
 *   - Wrapper goes through `refreshAndRetry` (HubSpot is
 *     oauth_with_refresh).
 *
 * Scope: `crm.schemas.deals.read` (already in the HubSpot manifest;
 * no reconnect needed).
 *
 * `hasMore: false` always — the HubSpot pipelines endpoint is
 * unpaginated and returns every pipeline in one call. Portals have 1–5
 * deal pipelines in practice.
 *
 * Client-side `q` filter mirrors other HubSpot resolvers: case-
 * insensitive substring match against the label.
 *
 * Error sanitization mirrors `hubspot:owners`.
 */
export const hubspotDealPipelinesResolver: OptionsResolver = {
  source: "hubspot:deal_pipelines",
  provider: "hubspot",
  requiresIntegration: true,
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active HubSpot integration. Connect HubSpot first.",
      );
    }

    let response;
    try {
      response = await refreshAndRetry({
        userId: ctx.userId,
        provider: "hubspot",
        accountId: null,
        apiCall: (accessToken) =>
          pipelinesList({ accessToken, objectType: "deals" }),
      });
    } catch (err) {
      if (err instanceof IntegrationActionRequiredError) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect HubSpot and try again.",
        );
      }
      if (err instanceof Unauthorized401Error) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect HubSpot and try again.",
        );
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load HubSpot deal pipelines. Try again.",
      );
    }

    const items: Array<{ value: string; label: string }> = [];
    for (const raw of response.results ?? []) {
      const mapped = mapPipelineToOption(raw);
      if (mapped) items.push({ value: mapped.value, label: mapped.label });
    }

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    return { items: filtered, hasMore: false };
  },
};
