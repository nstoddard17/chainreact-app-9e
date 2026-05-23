import {
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { campaignsList } from "@/integrations/_shared/mailchimp/api/campaigns";

/**
 * `mailchimp:campaigns` options resolver — Slice 3.MAILCHIMP-2.
 *
 * Backs the `campaignId` picker on the campaign-scoped actions
 * (`get_campaign`, `get_campaign_stats`) and on the trigger filters
 * (`email_opened`, `link_clicked`). All consumers share the
 * `campaignId` field name — no `requiredDeps` needed.
 *
 * Architecture mirrors `mailchimp:audiences`:
 *   - `requiresIntegration: true`.
 *   - No `requiredDeps` — campaigns are account-scoped.
 *   - Wrapper goes through `refreshAndRetry` (non-refreshable model;
 *     401 surfaces as `IntegrationActionRequiredError(reason:
 *     "refresh_not_supported")`).
 *
 * Sort order: `create_time DESC` so the most recently authored campaigns
 * surface first. Workflow authors typically reach for "the campaign I
 * just made" — newest-first matches that mental model. Mailchimp's
 * default sort is unspecified.
 *
 * Mapping (Mailchimp campaign → OptionItem):
 *   - `value`: `id` string.
 *   - `label`: `settings.title` (authored title) preferred —
 *     `settings.subject_line` falls back when title is empty, then the
 *     id as a last-resort. Internal title is the workflow author's own
 *     name for the campaign; subject line is what recipients see. We
 *     intentionally do NOT include the recipient-facing subject line in
 *     a separate description field — combobox UX stays compact.
 *   - `description`: `status` (sent / save / schedule / sending) +
 *     short `type` (regular / plaintext / absplit / rss / variate)
 *     when present. Workflow authors filtering by status need to see
 *     it; "Closed (sent)" vs "Draft (save)" disambiguates two
 *     similarly-named campaigns at a glance.
 *
 * Deliberately NOT included: campaign HTML content, archive_url,
 * preview_text, from_name, reply_to. None of those are needed for
 * picker UX and several (archive_url) leak public-facing URLs we don't
 * want surfaced in the builder dropdown.
 *
 * `hasMore` is always `false` — the wrapper does not return
 * `total_items` (only the `campaigns[]` array). v1 of the resolver
 * does not paginate; workflow authors with > 100 campaigns can use
 * the `q` filter to narrow.
 *
 * Client-side `q` filter mirrors other resolvers: case-insensitive
 * substring match against the label.
 *
 * Error sanitization mirrors `mailchimp:audiences`. Provider error
 * bodies never reach the browser.
 */
export const mailchimpCampaignsResolver: OptionsResolver = {
  source: "mailchimp:campaigns",
  provider: "mailchimp",
  requiresIntegration: true,
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Mailchimp integration. Connect Mailchimp first.",
      );
    }

    const dc = ctx.integration.accountMetadata.dc;
    if (typeof dc !== "string" || dc.length === 0) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "Reconnect Mailchimp — missing datacenter info.",
      );
    }

    const accountId = ctx.integration.providerAccountId;

    let campaigns;
    try {
      campaigns = await refreshAndRetry({
        userId: ctx.userId,
        provider: "mailchimp",
        accountId,
        apiCall: (accessToken) =>
          campaignsList({
            accessToken,
            dc,
            sortField: "create_time",
            sortDir: "DESC",
            count: 100,
          }),
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
        "Couldn't load Mailchimp campaigns. Try again.",
      );
    }

    const items: Array<{ value: string; label: string; description?: string }> = [];
    for (const c of campaigns) {
      if (typeof c.id !== "string" || c.id.length === 0) continue;
      const title =
        typeof c.settings?.title === "string" && c.settings.title.length > 0
          ? c.settings.title
          : null;
      const subjectLine =
        typeof c.settings?.subject_line === "string" &&
        c.settings.subject_line.length > 0
          ? c.settings.subject_line
          : null;
      const label = title ?? subjectLine ?? c.id;

      const status =
        typeof c.status === "string" && c.status.length > 0 ? c.status : null;
      const type =
        typeof c.type === "string" && c.type.length > 0 ? c.type : null;
      const descriptionParts: string[] = [];
      if (status !== null) descriptionParts.push(status);
      if (type !== null) descriptionParts.push(type);
      const description =
        descriptionParts.length > 0 ? descriptionParts.join(" · ") : undefined;

      items.push(
        description !== undefined
          ? { value: c.id, label, description }
          : { value: c.id, label },
      );
    }

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    return { items: filtered, hasMore: false };
  },
};
