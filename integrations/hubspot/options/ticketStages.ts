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
import { findPipelineById, mapStageToOption } from "./_pipelineMapping";

/**
 * `hubspot:ticket_stages` options resolver — Slice 3.HUBSPOT-2.
 *
 * Backs the `hs_pipeline_stage` field on `create_ticket` +
 * `update_ticket`. Scoped to the parent `hs_pipeline` via
 * `dependsOn`. Structurally identical to `hubspot:deal_stages` — the
 * differences are:
 *   - `requiredDeps: ["hs_pipeline"]` (matches the ticket schema's
 *     parent field name; deal uses `pipeline`).
 *   - `objectType: "tickets"` on the wrapper call.
 *
 * Scope: `tickets` (already granted).
 *
 * See `dealStages.ts` JSDoc for full architecture notes including the
 * "pipeline id missing → empty items not throw" rationale.
 */
export const hubspotTicketStagesResolver: OptionsResolver = {
  source: "hubspot:ticket_stages",
  provider: "hubspot",
  requiresIntegration: true,
  requiredDeps: ["hs_pipeline"],
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active HubSpot integration. Connect HubSpot first.",
      );
    }

    const pipelineId = ctx.deps.hs_pipeline;
    if (typeof pipelineId !== "string" || pipelineId.length === 0) {
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select a ticket pipeline first.",
      );
    }

    let response;
    try {
      response = await refreshAndRetry({
        userId: ctx.userId,
        provider: "hubspot",
        accountId: null,
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
        "Couldn't load HubSpot ticket stages. Try again.",
      );
    }

    const pipeline = findPipelineById(response.results ?? [], pipelineId);
    if (!pipeline) {
      return { items: [], hasMore: false };
    }

    const items: Array<{ value: string; label: string }> = [];
    for (const stage of pipeline.stages ?? []) {
      const mapped = mapStageToOption(stage);
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
