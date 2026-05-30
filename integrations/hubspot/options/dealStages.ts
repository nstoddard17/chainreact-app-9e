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
 * `hubspot:deal_stages` options resolver — Slice 3.HUBSPOT-2.
 *
 * Backs the `dealstage` field on `create_deal` + `update_deal`. Scoped
 * to the parent `pipeline` via `dependsOn`. Lists every non-archived
 * stage on the selected deal pipeline by walking the inline `stages[]`
 * array returned by `GET /crm/v3/pipelines/deals`.
 *
 * Architecture:
 *   - `requiresIntegration: true`.
 *   - `requiredDeps: ["pipeline"]` — route validates + short-circuits
 *     with MISSING_DEPENDENCY before dispatch. Builder cascade renders
 *     a passive "Select Pipeline first" trigger.
 *   - Wrapper goes through `refreshAndRetry`.
 *
 * The HubSpot API returns pipelines with their inline stages — there's
 * no separate `stages/{pipelineId}` endpoint. The resolver fetches all
 * deal pipelines (one call, unpaginated, ≤5 entries typically) and
 * filters client-side to the requested pipeline. Round-trip cost is
 * the same as a dedicated endpoint would be.
 *
 * Stage order is preserved as HubSpot returns it (`stages[]` is
 * already ordered by `displayOrder` in HubSpot's response). Workflow
 * authors reason about "the first stage" / "the last stage" by
 * position; preserving order is load-bearing.
 *
 * Scope: `crm.schemas.deals.read` (already granted).
 *
 * Error sanitization mirrors `hubspot:owners` + a NotFoundError-style
 * branch surfaces when the requested pipeline id doesn't exist —
 * returns an empty `items` array rather than throwing (the picker
 * shows "No options" + the workflow author re-picks the pipeline).
 */
export const hubspotDealStagesResolver: OptionsResolver = {
  source: "hubspot:deal_stages",
  provider: "hubspot",
  requiresIntegration: true,
  requiredDeps: ["pipeline"],
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active HubSpot integration. Connect HubSpot first.",
      );
    }

    const integration = ctx.integration;

    const pipelineId = ctx.deps.pipeline;
    if (typeof pipelineId !== "string" || pipelineId.length === 0) {
      // Defense-in-depth — the route's requiredDeps guard should fire
      // before we reach here.
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select a deal pipeline first.",
      );
    }

    let response;
    try {
      response = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "hubspot",
        providerAccountId: null,
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
        "Couldn't load HubSpot deal stages. Try again.",
      );
    }

    const pipeline = findPipelineById(response.results ?? [], pipelineId);
    if (!pipeline) {
      // Pipeline id no longer exists (renamed / archived) — empty
      // picker. NOT a thrown error: the workflow author's next move is
      // to re-pick the parent pipeline, and the cascade clears
      // `dealstage` automatically when they do.
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
