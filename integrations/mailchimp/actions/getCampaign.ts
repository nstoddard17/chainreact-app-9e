import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { campaignGet } from "../../_shared/mailchimp/api/campaigns";
import { resolveDc } from "./_resolveDc";
import { GetCampaignConfigSchema } from "./getCampaign.schema";

/**
 * Mailchimp `get_campaign` action handler — Mailchimp 2.1 Commit 1.
 *
 * GETs `/campaigns/{campaignId}` via the existing `campaignGet`
 * wrapper. Pure read; no Q11 surface. NotFound surfaces from the
 * wrapper as `NotFoundError` so workflow authors branch on the
 * error rather than receiving a `{found: false}` shape (different
 * from V1's mixed-success-payload pattern).
 *
 * **Bounded output projection** — no raw Mailchimp body spread.
 * Settings + recipients nested objects are projected to bounded
 * sub-shapes so downstream nodes can pin against stable field names.
 */
export const getCampaign: ActionHandler = async (input) => {
  const config = GetCampaignConfigSchema.parse(input.config);

  const { dc, providerAccountId } = await resolveDc({
    accountId: input.accountId,
    userId: input.userId,
    triggerEvent: input.triggerEvent,
  });

  const campaign = await refreshAndRetry({
    accountId: input.accountId,
    provider: "mailchimp",
    providerAccountId,
    apiCall: (accessToken) =>
      campaignGet({
        accessToken,
        dc,
        campaignId: config.campaignId,
      }),
  });

  return {
    output: {
      campaignId: campaign.id,
      webId: campaign.web_id ?? null,
      type: campaign.type ?? null,
      status: campaign.status ?? null,
      createTime: campaign.create_time ?? null,
      sendTime: campaign.send_time ?? null,
      // Mailchimp surfaces these on the campaign body; the existing
      // wrapper type doesn't enumerate them — read off the typed shape
      // we declared and fall back to null for fields not in
      // MailchimpCampaign's documented subset.
      archiveUrl:
        (campaign as { archive_url?: string }).archive_url ?? null,
      longArchiveUrl:
        (campaign as { long_archive_url?: string }).long_archive_url ?? null,
      emailsSent:
        (campaign as { emails_sent?: number }).emails_sent ?? 0,
      contentType:
        (campaign as { content_type?: string }).content_type ?? null,
      settings: {
        title: campaign.settings?.title ?? null,
        subjectLine: campaign.settings?.subject_line ?? null,
        previewText: campaign.settings?.preview_text ?? null,
        fromName: campaign.settings?.from_name ?? null,
        replyTo: campaign.settings?.reply_to ?? null,
      },
      recipients: {
        listId: campaign.recipients?.list_id ?? null,
        listName: campaign.recipients?.list_name ?? null,
        recipientCount:
          (campaign.recipients as { recipient_count?: number } | undefined)
            ?.recipient_count ?? 0,
      },
    },
  };
};
