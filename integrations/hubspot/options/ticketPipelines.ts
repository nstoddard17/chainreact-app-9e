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
 * `hubspot:ticket_pipelines` options resolver — Slice 3.HUBSPOT-2.
 *
 * Backs the `hs_pipeline` field on `create_ticket` + `update_ticket`.
 * Structurally identical to `hubspot:deal_pipelines` — the only
 * difference is the objectType the wrapper passes through (`tickets`
 * vs `deals`). Each portal typically has 1–3 ticket pipelines.
 *
 * Scope: `tickets` (already in the manifest; no reconnect needed).
 *
 * See `dealPipelines.ts` JSDoc for full architecture notes.
 */
export const hubspotTicketPipelinesResolver: OptionsResolver = {
  source: "hubspot:ticket_pipelines",
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

    let response;
    try {
      response = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "hubspot",
        providerAccountId: null,
        apiCall: (accessToken) =>
          pipelinesList({ accessToken, objectType: "tickets" }),
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
        "Couldn't load HubSpot ticket pipelines. Try again.",
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
