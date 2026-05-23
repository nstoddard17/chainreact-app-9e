import {
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { searchLists } from "@/integrations/_shared/hubspot/api/lists";

/**
 * `hubspot:lists` options resolver — Slice 3.HUBSPOT-2 (stretch).
 *
 * Backs the `listId` field on `add_contact_to_list` +
 * `remove_from_list`. Lists every non-archived HubSpot list visible
 * to the connected portal via `POST /crm/v3/lists/search` (the v3
 * lists discovery surface).
 *
 * Architecture mirrors `hubspot:owners`:
 *   - `requiresIntegration: true`.
 *   - No `requiredDeps` — lists are portal-scoped.
 *   - Wrapper goes through `refreshAndRetry`.
 *
 * Scope: `crm.lists.read` (already in the manifest; no reconnect
 * needed).
 *
 * Mapping (HubSpot list → OptionItem):
 *   - `value`: `listId` string.
 *   - `label`: `name` when present; otherwise the listId as a
 *     last-resort.
 *   - `description`: `processingType` — `MANUAL` (static, controlled
 *     by API/UI) or `DYNAMIC` (rule-engine-controlled). Surfaced
 *     because HubSpot's membership add/remove actions REJECT dynamic
 *     lists with a 400 `VALIDATION_ERROR`. The description warns
 *     workflow authors which lists are safe targets for the
 *     accompanying actions.
 *
 * `hasMore` propagates from the API wrapper's `offset` / `hasMore`
 * field. v1 of the resolver does NOT paginate; the first 200 lists
 * are returned and `hasMore: true` signals the renderer to surface
 * "refine search to narrow."
 *
 * Client-side `q` filter mirrors other HubSpot resolvers: case-
 * insensitive substring match on the label.
 *
 * Error sanitization mirrors `hubspot:owners`.
 */

interface HubSpotListLike {
  listId: string;
  name?: string | null;
  processingType?: string | null;
  archived?: boolean;
}

function pickLabel(name: string | null | undefined, listId: string): string {
  if (typeof name === "string" && name.length > 0) return name;
  return listId;
}

export const hubspotListsResolver: OptionsResolver = {
  source: "hubspot:lists",
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
        apiCall: (accessToken) => searchLists({ accessToken, count: 200 }),
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
        "Couldn't load HubSpot lists. Try again.",
      );
    }

    const items: Array<{ value: string; label: string; description?: string }> = [];
    for (const raw of (response.lists ?? []) as HubSpotListLike[]) {
      if (typeof raw.listId !== "string" || raw.listId.length === 0) continue;
      if (raw.archived === true) continue;
      const label = pickLabel(raw.name ?? null, raw.listId);
      const processingType =
        typeof raw.processingType === "string" && raw.processingType.length > 0
          ? raw.processingType
          : null;
      items.push(
        processingType
          ? { value: raw.listId, label, description: processingType }
          : { value: raw.listId, label },
      );
    }

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    const hasMore = response.hasMore === true;

    return { items: filtered, hasMore };
  },
};
