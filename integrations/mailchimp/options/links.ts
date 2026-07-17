import {
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { NotFoundError } from "@/integrations/_shared/mailchimp/errors";
import { reportClickDetails } from "@/integrations/_shared/mailchimp/api/reports";

/**
 * `mailchimp:links` options resolver — RESOLVERS-2 contradiction sweep.
 *
 * Backs the `url` filter on the `link_clicked` trigger, which was a plain
 * text box asking the author to type the tracked URL by hand.
 *
 * Why that was worse than an inconvenience: the poll matches
 * `config.url` against the URL string Mailchimp reports VERBATIM. A URL
 * that differs by a trailing slash, a `?utm_*` parameter, or http-vs-https
 * simply never matches — so the trigger fires zero times, reports no error,
 * and looks correctly configured. The failure is silent, which is the worst
 * kind. Picking from the campaign's real tracked links removes the entire
 * class.
 *
 * Cascade child of the sibling `campaignId` field (dep names are keyed by
 * the parent FIELD name). `campaignId` is itself OPTIONAL on this trigger
 * ("any recent sent campaign"), so with no campaign chosen this resolver
 * reports MISSING_DEPENDENCY and the picker says "Select a campaign first"
 * — honest, because Mailchimp only exposes clicked URLs per campaign report.
 * Manual entry stays enabled for the watch-any-campaign case.
 *
 * The wrapper (`reportClickDetails`, GET /reports/{id}/click-details) is the
 * SAME call this trigger's poll loop already makes every tick — no new API
 * surface, no new scope (Mailchimp's OAuth grants account-wide access and
 * ignores scopes), and nothing to reconnect.
 *
 * value = the URL itself, NOT Mailchimp's internal url id: the runtime
 * schema + poll filter compare on the URL string, so the picker must commit
 * exactly what the matcher expects. `id` goes in the description instead.
 *
 * Only links with recorded clicks appear — click-details is a REPORT. A
 * campaign nobody has clicked yet lists nothing; manual entry covers
 * pre-arming a filter before the first click.
 */
export const mailchimpLinksResolver: OptionsResolver = {
  source: "mailchimp:links",
  provider: "mailchimp",
  requiresIntegration: true,
  requiredDeps: ["campaignId"],
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Mailchimp integration. Connect Mailchimp first.",
      );
    }
    const integration = ctx.integration;

    const dc = integration.accountMetadata.dc;
    if (typeof dc !== "string" || dc.length === 0) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "Reconnect Mailchimp — missing datacenter info.",
      );
    }

    const campaignId = ctx.deps.campaignId;
    if (typeof campaignId !== "string" || campaignId.length === 0) {
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select a campaign first — Mailchimp lists clicked links per campaign.",
      );
    }

    let urls;
    try {
      urls = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "mailchimp",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          reportClickDetails({ accessToken, dc, campaignId, count: 100 }),
      });
    } catch (err) {
      if (
        err instanceof IntegrationActionRequiredError ||
        err instanceof Unauthorized401Error
      ) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Mailchimp and try again.",
        );
      }
      if (err instanceof NotFoundError) {
        // Campaign deleted, or it has no click report yet — empty picker,
        // not an error (mirrors microsoft-excel:worksheets / powerbi cascades).
        return { items: [], hasMore: false };
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load this campaign's links. Try again.",
      );
    }

    const items: Array<{ value: string; label: string; description?: string }> =
      [];
    for (const u of urls) {
      if (typeof u.url !== "string" || u.url.length === 0) continue;
      const clicks =
        typeof u.total_clicks === "number" ? u.total_clicks : undefined;
      const description =
        clicks !== undefined
          ? `${clicks} click${clicks === 1 ? "" : "s"}`
          : undefined;
      items.push(
        description !== undefined
          ? { value: u.url, label: u.url, description }
          : { value: u.url, label: u.url },
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
