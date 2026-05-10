import { mailchimpRequest } from "./_request";

/**
 * Mailchimp Marketing API v3 `/reports/...` resource wrappers — Slice
 * 14 Commit 5.
 *
 * Used by `email_opened` and `link_clicked` polling triggers:
 *   - `reportSummary` — get the campaign's report top-line (used for
 *     totalOpens / totalClicks counts persisted in the polling snapshot).
 *   - `reportOpenDetails` — paginate the members who opened the
 *     campaign (most-recent first). Used after a totalOpens delta to
 *     surface the new openers.
 *   - `reportClickDetails` — list the URLs clicked in the campaign.
 *     Used after a totalClicks delta to surface the new clicks.
 *   - `reportClickDetailMembers` — for one of the URLs, list the
 *     members who clicked it. Used to attribute each click to a
 *     subscriber for the trigger output payload.
 *
 * Mailchimp's reports endpoints are READ-ONLY on the sent-campaign
 * surface — they're observation-only and idempotent.
 */

// ─── reportSummary ──────────────────────────────────────────────────────────

export interface MailchimpReportSummary {
  id: string;
  campaign_title?: string;
  subject_line?: string;
  list_id?: string;
  list_name?: string;
  emails_sent?: number;
  opens?: { opens_total?: number; unique_opens?: number };
  clicks?: { clicks_total?: number; unique_clicks?: number };
  bounces?: { hard_bounces?: number; soft_bounces?: number };
}

export interface ReportSummaryInput {
  accessToken: string;
  dc: string;
  campaignId: string;
}

export async function reportSummary(
  input: ReportSummaryInput,
): Promise<MailchimpReportSummary> {
  return mailchimpRequest<MailchimpReportSummary>({
    accessToken: input.accessToken,
    dc: input.dc,
    method: "GET",
    path: `/reports/${encodeURIComponent(input.campaignId)}`,
    resourceForNotFound: `report for campaign ${input.campaignId}`,
  });
}

// ─── reportOpenDetails ──────────────────────────────────────────────────────

export interface MailchimpOpenMember {
  email_id?: string;
  email_address?: string;
  list_id?: string;
  /** Most recent opens; Mailchimp returns up to 5 timestamps per member. */
  opens?: Array<{ timestamp?: string }>;
  /** Total opens across all timestamps. */
  opens_count?: number;
}

interface MailchimpOpenDetailsResponse {
  campaign_id?: string;
  members?: MailchimpOpenMember[];
  total_items?: number;
}

export interface ReportOpenDetailsInput {
  accessToken: string;
  dc: string;
  campaignId: string;
  /** Page size — Mailchimp caps at 1000; V2 wrappers clamp at 100. */
  count?: number;
  offset?: number;
}

export async function reportOpenDetails(
  input: ReportOpenDetailsInput,
): Promise<readonly MailchimpOpenMember[]> {
  const query = new URLSearchParams();
  query.set("count", String(Math.min(input.count ?? 50, 100)));
  if (input.offset !== undefined) query.set("offset", String(input.offset));
  // Sort by timestamp DESC so the most-recent opens come first; the
  // poll handler slices the head off this list to fit the
  // delta-count.
  query.set("sort_field", "timestamp");
  query.set("sort_dir", "DESC");

  const response = await mailchimpRequest<MailchimpOpenDetailsResponse>({
    accessToken: input.accessToken,
    dc: input.dc,
    method: "GET",
    path: `/reports/${encodeURIComponent(input.campaignId)}/open-details`,
    query,
    resourceForNotFound: `open-details for campaign ${input.campaignId}`,
  });
  return response.members ?? [];
}

// ─── reportClickDetails ─────────────────────────────────────────────────────

export interface MailchimpClickUrl {
  id?: string;
  url?: string;
  total_clicks?: number;
  click_percentage?: number;
  unique_clicks?: number;
  unique_click_percentage?: number;
}

interface MailchimpClickDetailsResponse {
  campaign_id?: string;
  urls_clicked?: MailchimpClickUrl[];
  total_items?: number;
}

export interface ReportClickDetailsInput {
  accessToken: string;
  dc: string;
  campaignId: string;
  count?: number;
  offset?: number;
}

export async function reportClickDetails(
  input: ReportClickDetailsInput,
): Promise<readonly MailchimpClickUrl[]> {
  const query = new URLSearchParams();
  query.set("count", String(Math.min(input.count ?? 50, 100)));
  if (input.offset !== undefined) query.set("offset", String(input.offset));

  const response = await mailchimpRequest<MailchimpClickDetailsResponse>({
    accessToken: input.accessToken,
    dc: input.dc,
    method: "GET",
    path: `/reports/${encodeURIComponent(input.campaignId)}/click-details`,
    query,
    resourceForNotFound: `click-details for campaign ${input.campaignId}`,
  });
  return response.urls_clicked ?? [];
}

// ─── reportClickDetailMembers ───────────────────────────────────────────────

export interface MailchimpClickMember {
  email_id?: string;
  email_address?: string;
  list_id?: string;
  clicks?: number;
}

interface MailchimpClickMembersResponse {
  campaign_id?: string;
  url_id?: string;
  members?: MailchimpClickMember[];
  total_items?: number;
}

export interface ReportClickDetailMembersInput {
  accessToken: string;
  dc: string;
  campaignId: string;
  urlId: string;
  count?: number;
  offset?: number;
}

export async function reportClickDetailMembers(
  input: ReportClickDetailMembersInput,
): Promise<readonly MailchimpClickMember[]> {
  const query = new URLSearchParams();
  query.set("count", String(Math.min(input.count ?? 50, 100)));
  if (input.offset !== undefined) query.set("offset", String(input.offset));

  const response = await mailchimpRequest<MailchimpClickMembersResponse>({
    accessToken: input.accessToken,
    dc: input.dc,
    method: "GET",
    path: `/reports/${encodeURIComponent(input.campaignId)}/click-details/${encodeURIComponent(input.urlId)}/members`,
    query,
    resourceForNotFound: `click members for campaign ${input.campaignId} url ${input.urlId}`,
  });
  return response.members ?? [];
}
