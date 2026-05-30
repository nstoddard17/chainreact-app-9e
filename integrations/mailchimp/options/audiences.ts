import {
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { listsList } from "@/integrations/_shared/mailchimp/api/lists";

/**
 * `mailchimp:audiences` options resolver — Slice 3.MAILCHIMP-2.
 *
 * Backs the audience / list picker across the Mailchimp action +
 * trigger surface. Action schemas use mixed field names — most use
 * `audience_id` (9 actions: add/update/remove/get subscriber, add/remove
 * tag, create segment, create custom event, add note), while
 * `unsubscribe_subscriber` + `get_subscribers` use `listId`. Mailchimp's
 * API calls audiences "lists" — they are the same resource. Trigger
 * schemas use `audienceId` (camelCase) on `audience_event` /
 * `campaign_created`, and `listId` on `segment_updated` /
 * `subscriber_added_to_segment`. The resolver carries no
 * `requiredDeps`, so consumers attach via `optionsSource:
 * "mailchimp:audiences"` regardless of their local field name.
 *
 * Architecture mirrors `hubspot:owners`:
 *   - `requiresIntegration: true`.
 *   - No `requiredDeps` — audiences are account-scoped.
 *   - Wrapper goes through `refreshAndRetry`. Mailchimp tokens are
 *     non-refreshable (manifest `refreshable: false`), so on 401 the
 *     refresh path throws `IntegrationActionRequiredError(reason:
 *     "refresh_not_supported")` — same surface as Slack / GitHub /
 *     Shopify and identical handling here.
 *
 * Mailchimp `dc` (datacenter prefix) lives on `integration.accountMetadata.dc`
 * (persisted at OAuth callback by `_shared/mailchimp/api/me.ts`). The
 * resolver reads it directly off `ctx.integration`; if missing we map
 * to `INTEGRATION_DISCONNECTED` so the user is prompted to reconnect
 * rather than seeing a `MissingDataCenterError` stack trace.
 *
 * Mapping (Mailchimp list → OptionItem):
 *   - `value`: `id` string (the audience id used by every action /
 *     trigger consumer).
 *   - `label`: `name` when non-empty, else the id as fallback.
 *   - `description`: `stats.member_count` when present, rendered as
 *     `"42 members"` (singular at 1) per accepted plan decision D-MC4.
 *
 * `hasMore` propagates from the wrapper's `totalItems` vs page size.
 * Mailchimp's `listsList` clamps `count` at 100; accounts with > 100
 * audiences are rare but the renderer is correctly informed.
 *
 * Client-side `q` filter mirrors other resolvers: case-insensitive
 * substring match against the label.
 *
 * Error sanitization mirrors `hubspot:owners`. Mailchimp's wrapper
 * surfaces 401 as `Unauthorized401Error` (caught by `refreshAndRetry`)
 * which becomes `IntegrationActionRequiredError(reason: "refresh_not_supported")`
 * in the non-refreshable model. Anything else is collapsed to
 * `PROVIDER_ERROR` with a sanitized message — provider error bodies
 * never reach the browser.
 */
export const mailchimpAudiencesResolver: OptionsResolver = {
  source: "mailchimp:audiences",
  provider: "mailchimp",
  requiresIntegration: true,
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Mailchimp integration. Connect Mailchimp first.",
      );
    }

    const integration = ctx.integration;

    const dc = ctx.integration.accountMetadata.dc;
    if (typeof dc !== "string" || dc.length === 0) {
      // dc is captured at OAuth callback. Missing dc on an otherwise
      // active row means the row was created before dc capture landed
      // (legacy) OR the metadata was corrupted. Reconnect rebuilds it.
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "Reconnect Mailchimp — missing datacenter info.",
      );
    }

    const providerAccountId = integration.providerAccountId;

    let response;
    try {
      response = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "mailchimp",
        providerAccountId,
        apiCall: (accessToken) =>
          listsList({ accessToken, dc, count: 100 }),
      });
    } catch (err) {
      if (err instanceof IntegrationActionRequiredError) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Mailchimp and try again.",
        );
      }
      if (err instanceof Unauthorized401Error) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Mailchimp and try again.",
        );
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load Mailchimp audiences. Try again.",
      );
    }

    const items: Array<{ value: string; label: string; description?: string }> = [];
    for (const list of response.lists) {
      if (typeof list.id !== "string" || list.id.length === 0) continue;
      const label =
        typeof list.name === "string" && list.name.length > 0
          ? list.name
          : list.id;
      const memberCount = list.stats?.member_count;
      if (typeof memberCount === "number" && Number.isFinite(memberCount)) {
        items.push({
          value: list.id,
          label,
          description:
            memberCount === 1 ? "1 member" : `${memberCount} members`,
        });
      } else {
        items.push({ value: list.id, label });
      }
    }

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    const hasMore = response.totalItems > response.lists.length;

    return { items: filtered, hasMore };
  },
};
