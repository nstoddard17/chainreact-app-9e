import {
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { membersList } from "@/integrations/_shared/mailchimp/api/members";

/**
 * `mailchimp:members` options resolver.
 *
 * Backs the subscriber / `email` picker on `mailchimp:get_subscriber` — the
 * member is selected FROM a chosen audience, so this depends on the audience
 * id. Field name on the consumer is `audience_id` (see get_subscriber schema),
 * so `requiredDeps` + the consumer `dependsOn` both use `audience_id`.
 *
 * Read-only: `GET /lists/{audienceId}/members` (the same endpoint the
 * `get_subscribers` action uses), one bounded page (100). Reuses `membersList`.
 * Mailchimp `dc` comes off `integration.accountMetadata.dc` (mirrors the
 * `mailchimp:audiences` resolver).
 *
 * Mapping (Mailchimp member → OptionItem):
 *   - `value`: `email_address` (the value `get_subscriber` resolves a member by).
 *   - `label`: `email_address`.
 *   - `description`: member `status` when present.
 */
export const mailchimpMembersResolver: OptionsResolver = {
  source: "mailchimp:members",
  provider: "mailchimp",
  requiresIntegration: true,
  requiredDeps: ["audience_id"],
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

    const audienceId = ctx.deps.audience_id;
    if (typeof audienceId !== "string" || audienceId.length === 0) {
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select an audience first.",
      );
    }

    let result;
    try {
      result = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "mailchimp",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          membersList({ accessToken, dc, audienceId, count: 100 }),
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
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load Mailchimp subscribers. Try again.",
      );
    }

    const items: Array<{ value: string; label: string; description?: string }> = [];
    for (const m of result.members) {
      if (typeof m.email_address !== "string" || m.email_address.length === 0) continue;
      items.push(
        typeof m.status === "string" && m.status.length > 0
          ? { value: m.email_address, label: m.email_address, description: m.status }
          : { value: m.email_address, label: m.email_address },
      );
    }

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    return { items: filtered, hasMore: result.totalItems > result.members.length };
  },
};
