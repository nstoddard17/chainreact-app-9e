import {
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { ownersList } from "@/integrations/_shared/hubspot/api/owners";

/**
 * `hubspot:owners` options resolver — Slice 3.HUBSPOT-2.
 *
 * Backs the `hubspot_owner_id` field across 8 HubSpot actions:
 * `create_deal`, `update_deal`, `create_ticket`, `update_ticket`,
 * `create_note`, `create_task`, `create_call`, `create_meeting`.
 *
 * Architecture mirrors `google-sheets:spreadsheets`:
 *   - `requiresIntegration: true` — route loads the active HubSpot
 *     integration row + short-circuits with INTEGRATION_DISCONNECTED
 *     if absent.
 *   - No `requiredDeps` — owners are portal-scoped; the picker opens
 *     against the connected portal.
 *   - Wrapper goes through `refreshAndRetry` because HubSpot uses
 *     OAuth-with-refresh; stale access tokens get a single refresh +
 *     retry cycle.
 *
 * Mapping (HubSpot owner → OptionItem):
 *   - `value`: owner id (`HubSpotOwner.id`) — the same string used as
 *     `hubspot_owner_id` foreign key on contacts / companies / deals /
 *     tickets / engagements. NOT `userId` (which is HubSpot's app-
 *     user numeric id, a separate identifier).
 *   - `label`: full name when both `firstName` + `lastName` are
 *     present (e.g. "Alice Adams"); otherwise email; otherwise the
 *     id as last-resort. Owners without any of those (rare —
 *     usually deactivated team members) drop out so the picker stays
 *     legible.
 *   - `description`: email when it ISN'T already the label. Gives
 *     workflow authors disambiguation when two owners share a name.
 *
 * Client-side `q` filter: case-insensitive substring match against
 * label + description (covers "search by email when only name is
 * shown" + "search by name when email is shown").
 *
 * `hasMore` derives from the wrapper's pagination cursor. v1 returns
 * a single page of up to 100 owners; multi-page pagination is
 * deferred (portal owner counts are typically <50; the cap fits).
 *
 * Error sanitization mirrors `google-sheets:spreadsheets`:
 *   - `IntegrationActionRequiredError` / `Unauthorized401Error` →
 *     INTEGRATION_DISCONNECTED with a reconnect prompt.
 *   - Any other thrown error → PROVIDER_ERROR with a sanitized
 *     message. No token / raw HubSpot body leakage.
 */

interface HubSpotOwnerLike {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

function buildLabel(owner: HubSpotOwnerLike): {
  label: string;
  description?: string;
} | null {
  const first =
    typeof owner.firstName === "string" && owner.firstName.length > 0
      ? owner.firstName
      : null;
  const last =
    typeof owner.lastName === "string" && owner.lastName.length > 0
      ? owner.lastName
      : null;
  const email =
    typeof owner.email === "string" && owner.email.length > 0
      ? owner.email
      : null;

  if (first && last) {
    return email ? { label: `${first} ${last}`, description: email } : { label: `${first} ${last}` };
  }
  if (first) {
    return email ? { label: first, description: email } : { label: first };
  }
  if (last) {
    return email ? { label: last, description: email } : { label: last };
  }
  if (email) {
    // Email-only label; no separate description to avoid duplication.
    return { label: email };
  }
  return null;
}

export const hubspotOwnersResolver: OptionsResolver = {
  source: "hubspot:owners",
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
        apiCall: (accessToken) => ownersList({ accessToken, limit: 100 }),
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
        "Couldn't load HubSpot owners. Try again.",
      );
    }

    const items: Array<{ value: string; label: string; description?: string }> = [];
    for (const raw of response.results ?? []) {
      if (typeof raw.id !== "string" || raw.id.length === 0) continue;
      const built = buildLabel(raw);
      if (!built) continue;
      items.push(
        built.description
          ? { value: raw.id, label: built.label, description: built.description }
          : { value: raw.id, label: built.label },
      );
    }

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => {
            if (item.label.toLowerCase().includes(lowerQ)) return true;
            if (item.description && item.description.toLowerCase().includes(lowerQ)) return true;
            return false;
          })
        : items;

    const hasMore =
      typeof response.paging?.next?.after === "string" &&
      response.paging.next.after.length > 0;

    return {
      items: filtered,
      hasMore,
    };
  },
};
