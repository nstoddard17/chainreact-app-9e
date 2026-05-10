import { mailchimpRequest } from "./_request";

/**
 * Mailchimp Marketing API v3 `campaigns` resource wrappers — Slice 14
 * Commit 5.
 *
 * Used by the `campaign_created` / `email_opened` / `link_clicked`
 * polling triggers to enumerate the user's campaigns and surface
 * per-campaign settings (subject, title) for trigger output payloads.
 *
 * Endpoints covered:
 *   - GET /campaigns                                   (campaignsList — filtered, paginated)
 *   - GET /campaigns/{campaignId}                      (campaignGet — single record)
 *
 * The list endpoint accepts a richly-filtered query — Slice 14 Batch
 * 1 polling triggers use:
 *   - `status=sent` (email_opened + link_clicked)
 *   - `sort_field=create_time&sort_dir=DESC` (campaign_created)
 *   - `list_id={audienceId}` (campaign_created audience filter)
 *   - `count` + `offset` (pagination — bounded at 100 per Mailchimp)
 *
 * Mailchimp's campaign id is a stable, opaque string (e.g.
 * `"abc123def456"`). The polling triggers use it as the dedup key
 * for `webhook_event_dedup`.
 */

export interface MailchimpCampaignSettings {
  /**
   * Internal title set by the campaign author. NOT visible to
   * recipients (that's `subject_line`). Used as a friendly display
   * label for the trigger payload.
   */
  title?: string;
  subject_line?: string;
  from_name?: string;
  reply_to?: string;
  preview_text?: string;
}

export interface MailchimpCampaign {
  id: string;
  web_id?: number;
  type?: string;
  status?: string;
  create_time?: string;
  send_time?: string;
  recipients?: { list_id?: string; list_name?: string };
  settings?: MailchimpCampaignSettings;
}

interface MailchimpCampaignsListResponse {
  campaigns?: MailchimpCampaign[];
  total_items?: number;
}

// ─── campaignsList ──────────────────────────────────────────────────────────

export interface CampaignsListInput {
  accessToken: string;
  dc: string;
  /**
   * Filter by campaign status — `'sent'` (most useful for activity
   * polling), `'save'` (drafts), `'schedule'`, `'sending'`. Omit for
   * "any status".
   */
  status?: string;
  /** Filter by audience (list) id. */
  listId?: string;
  /** Sort field — `'create_time'` and `'send_time'` are the common picks. */
  sortField?: "create_time" | "send_time";
  sortDir?: "ASC" | "DESC";
  /** Page size — Mailchimp caps at 1000; V2 wrappers clamp at 100. */
  count?: number;
  /** Pagination offset. */
  offset?: number;
}

export async function campaignsList(
  input: CampaignsListInput,
): Promise<readonly MailchimpCampaign[]> {
  const query = new URLSearchParams();
  if (input.status) query.set("status", input.status);
  if (input.listId) query.set("list_id", input.listId);
  if (input.sortField) query.set("sort_field", input.sortField);
  if (input.sortDir) query.set("sort_dir", input.sortDir);
  query.set("count", String(Math.min(input.count ?? 50, 100)));
  if (input.offset !== undefined) query.set("offset", String(input.offset));

  const response = await mailchimpRequest<MailchimpCampaignsListResponse>({
    accessToken: input.accessToken,
    dc: input.dc,
    method: "GET",
    path: "/campaigns",
    query,
    resourceForNotFound: "campaigns (list)",
  });
  return response.campaigns ?? [];
}

// ─── campaignGet ────────────────────────────────────────────────────────────

export interface CampaignGetInput {
  accessToken: string;
  dc: string;
  campaignId: string;
}

export async function campaignGet(
  input: CampaignGetInput,
): Promise<MailchimpCampaign> {
  return mailchimpRequest<MailchimpCampaign>({
    accessToken: input.accessToken,
    dc: input.dc,
    method: "GET",
    path: `/campaigns/${encodeURIComponent(input.campaignId)}`,
    resourceForNotFound: `campaign ${input.campaignId}`,
  });
}
