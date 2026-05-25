import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { listCreate } from "../../_shared/mailchimp/api/lists";
import { resolveDc } from "./_resolveDc";
import { CreateAudienceConfigSchema } from "./createAudience.schema";

/**
 * Mailchimp `create_audience` action handler — Slice 14 Commit 3.
 *
 * POSTs `/lists` to create a new audience (Mailchimp's UI name for a
 * list). Compliance fields (contact address, permission reminder,
 * campaign defaults) are required by Mailchimp per CAN-SPAM and are
 * passed through verbatim — the schema enforces presence so no
 * silent defaults reach the wire.
 *
 * Output shape: { audienceId, name, webId, dateCreated, memberCount }.
 * `webId` is Mailchimp's internal numeric id (different from
 * `audienceId` which is the API id like `"abc1234567"`).
 */
export const createAudience: ActionHandler = async (input) => {
  const config = CreateAudienceConfigSchema.parse(input.config);

  const { dc, accountId } = await resolveDc({
    userId: input.userId,
    triggerEvent: input.triggerEvent,
  });

  const list = await refreshAndRetry({
    userId: input.userId,
    provider: "mailchimp",
    accountId,
    apiCall: (accessToken) =>
      listCreate({
        accessToken,
        dc,
        name: config.name,
        permissionReminder: config.permission_reminder,
        emailTypeOption: config.email_type_option,
        contact: { ...config.contact },
        campaignDefaults: { ...config.campaign_defaults },
        ...(config.use_archive_bar !== undefined
          ? { useArchiveBar: config.use_archive_bar }
          : {}),
        ...(config.notify_on_subscribe !== undefined
          ? { notifyOnSubscribe: config.notify_on_subscribe }
          : {}),
        ...(config.notify_on_unsubscribe !== undefined
          ? { notifyOnUnsubscribe: config.notify_on_unsubscribe }
          : {}),
        ...(config.marketing_permissions !== undefined
          ? { marketingPermissions: config.marketing_permissions }
          : {}),
        ...(config.double_optin !== undefined
          ? { doubleOptin: config.double_optin }
          : {}),
      }),
  });

  return {
    output: {
      audienceId: list.id,
      name: list.name,
      webId: list.web_id ?? null,
      dateCreated: list.date_created ?? null,
      memberCount: list.stats?.member_count ?? 0,
    },
  };
};
