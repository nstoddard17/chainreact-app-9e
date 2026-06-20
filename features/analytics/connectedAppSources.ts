import type { AnalyticsWidgetType } from "@/contracts/analytics";

/**
 * Connected-app analytics UI exposure descriptor (Slice ANALYTICS-SOURCES-SLACK-UI-1).
 *
 * SINGLE SOURCE OF TRUTH for which connected-app providers the Analytics widget
 * UI offers, and how each one's config panel + widget body render. The analytics
 * SOURCE REGISTRY (services/analytics/sources/registry.ts) decides what's
 * APPROVED for read-only querying; THIS module decides what's actually EXPOSED to
 * users in the builder. They are deliberately separate:
 *
 *   - A provider can be registered (backend reachable, tested) but NOT exposed
 *     here — so no user-facing widget ships until it's smoke-testable.
 *   - Slack and GitHub are both exposed (smoke-tested). GitHub was briefly held
 *     back (ANALYTICS-SOURCES-SLACK-1) when it couldn't be authenticated-smoked;
 *     re-exposed in ANALYTICS-SOURCES-GITHUB-UI-2 once the GitHub connection was
 *     fixed. The `exposed` switch stays the chokepoint for any future provider.
 *
 * No backend behavior depends on this file — it is client-safe (no server imports)
 * and purely drives the config panel + widget body. Setting `exposed: false`
 * removes a provider's toggle, config controls, AND its widget-body rendering path
 * cleanly (no dead/fake controls).
 */

/** A filter input the config panel renders for a connected-app metric. */
export type ConnectedAppFilterKind =
  | "repo"
  | "slack_channel"
  | "keyword"
  | "gcal_calendar"
  | "gmail_label"
  | "outlook_folder"
  | "outlookcal_calendar"
  | "trello_board"
  | "airtable_base"
  | "airtable_table"
  | "monday_board"
  | "hubspot_pipeline"
  | "mailchimp_audience"
  | "dropbox_folder"
  | "onedrive_folder"
  | "gdrive_folder";

export interface ConnectedAppMetricOption {
  /** Metric key — MUST match an approved metric in the source registry. */
  id: string;
  label: string;
  /**
   * Extra filter inputs this metric needs (beyond the provider's required base
   * filter). Drives which controls the config panel shows and which filter keys
   * are written to `dataSource.filters`. The server re-validates every key
   * against the metric's `supportedFilters` — this is UX only.
   */
  filters: readonly ConnectedAppFilterKind[];
}

export interface ConnectedAppSourceUi {
  /** Provider key — matches the source registry + credentialSharing policy. */
  provider: string;
  displayName: string;
  /**
   * Master exposure switch. Only `exposed: true` providers appear in the widget
   * config UI / widget body. Flip to expose a provider once it is smoke-testable.
   */
  exposed: boolean;
  /** Toggle button icon (shared analytics icon set). */
  icon: string;
  /** Where the "connect" CTA points (Apps page). */
  connectHref: string;
  /** Missing-connection title shown in the widget body. */
  connectTitle: string;
  /** Missing-connection helper sentence. */
  connectHelp: string;
  /** Connect CTA button label. */
  connectCtaLabel: string;
  /**
   * Attribution prefix shown on a rendered widget. `account` providers (shared
   * workspace credential) read the same data for every account member; `personal`
   * providers read each viewer's OWN connection. This drives copy + matches the
   * credential-sharing policy in core/integrations/credentialSharing.ts.
   */
  visibility: "account" | "personal";
  /** Attribution prefix, e.g. "Slack workspace" or "Your GitHub". */
  attributionPrefix: string;
  /** Per-widget-type metric options (scalar → stat; series → line/bar). */
  metricsByType: Partial<Record<AnalyticsWidgetType, readonly ConnectedAppMetricOption[]>>;
}

const SERIES_TYPES = ["line", "bar"] as const;

function seriesForBoth(
  options: readonly ConnectedAppMetricOption[],
): Partial<Record<AnalyticsWidgetType, readonly ConnectedAppMetricOption[]>> {
  return Object.fromEntries(SERIES_TYPES.map((t) => [t, options]));
}

const GITHUB: ConnectedAppSourceUi = {
  provider: "github",
  displayName: "GitHub",
  // Exposed (ANALYTICS-SOURCES-GITHUB-UI-2) now that the GitHub connection is
  // fixed and smoke-testable. Personal credential — each viewer sees their own.
  exposed: true,
  icon: "Webhook",
  connectHref: "/apps",
  connectTitle: "Connect your GitHub account",
  connectHelp: "This widget uses your own GitHub connection. Connect it to see your data.",
  connectCtaLabel: "Connect GitHub",
  visibility: "personal",
  attributionPrefix: "Your GitHub",
  metricsByType: {
    stat: [
      { id: "open_issues", label: "Open issues", filters: ["repo"] },
      { id: "open_prs", label: "Open pull requests", filters: ["repo"] },
    ],
    ...seriesForBoth([
      { id: "issues_opened", label: "Issues opened over time", filters: ["repo"] },
      { id: "prs_opened", label: "Pull requests opened over time", filters: ["repo"] },
      { id: "prs_merged", label: "Pull requests merged over time", filters: ["repo"] },
    ]),
  },
};

const SLACK: ConnectedAppSourceUi = {
  provider: "slack",
  displayName: "Slack",
  exposed: true,
  icon: "Comment",
  connectHref: "/apps",
  connectTitle: "Connect your Slack workspace",
  connectHelp:
    "This widget reads activity from your workspace's connected Slack. Connect Slack to see it.",
  connectCtaLabel: "Connect Slack",
  // Slack is an ACCOUNT-shared workspace bot token — every account member sees the
  // same workspace data (core/integrations/credentialSharing.ts → "account").
  visibility: "account",
  attributionPrefix: "Slack workspace",
  metricsByType: {
    stat: [
      { id: "channel_activity_count", label: "Messages in channel", filters: ["slack_channel"] },
      { id: "active_users_count", label: "Active people in channel", filters: ["slack_channel"] },
    ],
    ...seriesForBoth([
      { id: "messages_over_time", label: "Messages over time", filters: ["slack_channel"] },
      {
        id: "keyword_mentions",
        label: "Keyword mentions over time",
        filters: ["slack_channel", "keyword"],
      },
    ]),
  },
};

const GOOGLE_CALENDAR: ConnectedAppSourceUi = {
  provider: "google-calendar",
  displayName: "Google Calendar",
  exposed: true,
  icon: "Clock",
  connectHref: "/apps",
  connectTitle: "Connect your Google Calendar",
  connectHelp:
    "This widget uses your own Google Calendar connection. Connect it to see your data.",
  connectCtaLabel: "Connect Google Calendar",
  // Personal credential — each viewer sees THEIR OWN calendar data, never a
  // co-member's (core/integrations/credentialSharing.ts → "personal").
  visibility: "personal",
  attributionPrefix: "Your Google Calendar",
  metricsByType: {
    stat: [{ id: "upcoming_meetings_count", label: "Upcoming meetings", filters: ["gcal_calendar"] }],
    line: [
      { id: "meetings_over_time", label: "Meetings over time", filters: ["gcal_calendar"] },
      { id: "meeting_hours_over_time", label: "Meeting hours over time", filters: ["gcal_calendar"] },
    ],
    bar: [
      { id: "meetings_over_time", label: "Meetings over time", filters: ["gcal_calendar"] },
      { id: "meeting_hours_over_time", label: "Meeting hours over time", filters: ["gcal_calendar"] },
      { id: "busy_hours_by_day", label: "Busy hours by weekday", filters: ["gcal_calendar"] },
    ],
  },
};

const GMAIL: ConnectedAppSourceUi = {
  provider: "gmail",
  displayName: "Gmail",
  exposed: true,
  icon: "Comment",
  connectHref: "/apps",
  connectTitle: "Connect your Gmail",
  connectHelp: "This widget uses your own Gmail connection. Connect it to see your data.",
  connectCtaLabel: "Connect Gmail",
  // Personal credential — each viewer sees THEIR OWN Gmail data, never a
  // co-member's (core/integrations/credentialSharing.ts → "personal").
  visibility: "personal",
  attributionPrefix: "Your Gmail",
  metricsByType: {
    stat: [
      { id: "unread_count", label: "Unread emails", filters: [] },
      { id: "label_message_count", label: "Emails in a label", filters: ["gmail_label"] },
    ],
    ...seriesForBoth([
      { id: "emails_received_over_time", label: "Emails received over time", filters: [] },
      { id: "emails_sent_over_time", label: "Emails sent over time", filters: [] },
    ]),
  },
};

const STRIPE: ConnectedAppSourceUi = {
  provider: "stripe",
  displayName: "Stripe",
  exposed: true,
  icon: "Cube",
  connectHref: "/apps",
  connectTitle: "Connect your Stripe account",
  connectHelp:
    "This widget reads payment totals from your account's connected Stripe. Connect Stripe to see it.",
  connectCtaLabel: "Connect Stripe",
  // Stripe is an ACCOUNT-shared business account — every account member sees the
  // same payment data (core/integrations/credentialSharing.ts → "account").
  visibility: "account",
  attributionPrefix: "Stripe account",
  metricsByType: {
    stat: [
      { id: "successful_payment_count", label: "Successful payments", filters: [] },
      { id: "gross_payment_volume", label: "Gross payment volume", filters: [] },
      { id: "failed_payment_count", label: "Failed payments", filters: [] },
    ],
    ...seriesForBoth([
      { id: "successful_payments_over_time", label: "Successful payments over time", filters: [] },
      { id: "gross_volume_over_time", label: "Gross volume over time", filters: [] },
    ]),
  },
};

const OUTLOOK: ConnectedAppSourceUi = {
  provider: "microsoft-outlook",
  displayName: "Microsoft Outlook",
  exposed: true,
  icon: "Comment",
  connectHref: "/apps",
  connectTitle: "Connect your Outlook",
  connectHelp: "This widget uses your own Outlook connection. Connect it to see your data.",
  connectCtaLabel: "Connect Outlook",
  // Personal credential — each viewer sees THEIR OWN Outlook data, never a
  // co-member's (core/integrations/credentialSharing.ts → "personal").
  visibility: "personal",
  attributionPrefix: "Your Outlook",
  metricsByType: {
    stat: [
      { id: "unread_count", label: "Unread emails", filters: [] },
      { id: "folder_message_count", label: "Emails in a folder", filters: ["outlook_folder"] },
    ],
    ...seriesForBoth([
      { id: "emails_received_over_time", label: "Emails received over time", filters: [] },
      { id: "emails_sent_over_time", label: "Emails sent over time", filters: [] },
    ]),
  },
};

const OUTLOOK_CALENDAR: ConnectedAppSourceUi = {
  provider: "microsoft-outlook-calendar",
  displayName: "Outlook Calendar",
  exposed: true,
  icon: "Clock",
  connectHref: "/apps",
  connectTitle: "Connect your Outlook Calendar",
  connectHelp: "This widget uses your own Outlook Calendar connection. Connect it to see your data.",
  connectCtaLabel: "Connect Outlook Calendar",
  // Personal credential — each viewer sees THEIR OWN calendar data, never a
  // co-member's (core/integrations/credentialSharing.ts → "personal").
  visibility: "personal",
  attributionPrefix: "Your Outlook Calendar",
  metricsByType: {
    stat: [{ id: "upcoming_meetings_count", label: "Upcoming meetings", filters: ["outlookcal_calendar"] }],
    line: [
      { id: "meetings_over_time", label: "Meetings over time", filters: ["outlookcal_calendar"] },
      { id: "meeting_hours_over_time", label: "Meeting hours over time", filters: ["outlookcal_calendar"] },
    ],
    bar: [
      { id: "meetings_over_time", label: "Meetings over time", filters: ["outlookcal_calendar"] },
      { id: "meeting_hours_over_time", label: "Meeting hours over time", filters: ["outlookcal_calendar"] },
      { id: "busy_hours_by_day", label: "Busy hours by weekday", filters: ["outlookcal_calendar"] },
    ],
  },
};

const NOTION: ConnectedAppSourceUi = {
  provider: "notion",
  displayName: "Notion",
  exposed: true,
  icon: "Database",
  connectHref: "/apps",
  connectTitle: "Connect your Notion workspace",
  connectHelp:
    "This widget reads page activity from your account's connected Notion workspace. Connect Notion to see it.",
  connectCtaLabel: "Connect Notion",
  // Notion is an ACCOUNT-shared workspace grant — every account member sees the
  // same workspace aggregates (core/integrations/credentialSharing.ts → "account").
  visibility: "account",
  attributionPrefix: "Notion workspace",
  metricsByType: {
    stat: [
      { id: "total_pages_count", label: "Total pages", filters: [] },
      { id: "recently_updated_count", label: "Recently updated pages", filters: [] },
    ],
    ...seriesForBoth([
      { id: "pages_created_over_time", label: "Pages created over time", filters: [] },
      { id: "pages_edited_over_time", label: "Pages edited over time", filters: [] },
    ]),
  },
};

const TRELLO: ConnectedAppSourceUi = {
  provider: "trello",
  displayName: "Trello",
  exposed: true,
  icon: "Layers",
  connectHref: "/apps",
  connectTitle: "Connect your Trello",
  connectHelp: "This widget uses your own Trello connection. Connect it to see your data.",
  connectCtaLabel: "Connect Trello",
  // Personal credential — each viewer sees THEIR OWN Trello data, never a
  // co-member's (core/integrations/credentialSharing.ts → "personal").
  visibility: "personal",
  attributionPrefix: "Your Trello",
  metricsByType: {
    stat: [
      { id: "open_cards_count", label: "Open cards", filters: ["trello_board"] },
      { id: "closed_cards_count", label: "Archived cards", filters: ["trello_board"] },
      { id: "overdue_cards_count", label: "Overdue cards", filters: ["trello_board"] },
    ],
    line: [{ id: "cards_created_over_time", label: "Cards created over time", filters: ["trello_board"] }],
    bar: [
      { id: "cards_created_over_time", label: "Cards created over time", filters: ["trello_board"] },
      { id: "cards_by_list", label: "Cards by list", filters: ["trello_board"] },
    ],
  },
};

const AIRTABLE: ConnectedAppSourceUi = {
  provider: "airtable",
  displayName: "Airtable",
  exposed: true,
  icon: "Database",
  connectHref: "/apps",
  connectTitle: "Connect your Airtable",
  connectHelp: "This widget uses your own Airtable connection. Connect it to see your data.",
  connectCtaLabel: "Connect Airtable",
  // Personal credential — each viewer sees THEIR OWN Airtable data, never a
  // co-member's (core/integrations/credentialSharing.ts → "personal").
  visibility: "personal",
  attributionPrefix: "Your Airtable",
  metricsByType: {
    stat: [
      { id: "record_count", label: "Record count", filters: ["airtable_base", "airtable_table"] },
      { id: "tables_count", label: "Tables in base", filters: ["airtable_base"] },
    ],
    ...seriesForBoth([
      {
        id: "records_created_over_time",
        label: "Records created over time",
        filters: ["airtable_base", "airtable_table"],
      },
    ]),
  },
};

const MONDAY: ConnectedAppSourceUi = {
  provider: "monday",
  displayName: "Monday",
  exposed: true,
  icon: "Layers",
  connectHref: "/apps",
  connectTitle: "Connect your Monday",
  connectHelp: "This widget uses your own Monday connection. Connect it to see your data.",
  connectCtaLabel: "Connect Monday",
  // Personal credential — each viewer sees THEIR OWN Monday data, never a
  // co-member's (core/integrations/credentialSharing.ts → "personal").
  visibility: "personal",
  attributionPrefix: "Your Monday",
  metricsByType: {
    stat: [{ id: "open_items_count", label: "Open items", filters: ["monday_board"] }],
    line: [{ id: "items_created_over_time", label: "Items created over time", filters: ["monday_board"] }],
    bar: [
      { id: "items_created_over_time", label: "Items created over time", filters: ["monday_board"] },
      { id: "items_by_group", label: "Items by group", filters: ["monday_board"] },
    ],
  },
};

const HUBSPOT: ConnectedAppSourceUi = {
  provider: "hubspot",
  displayName: "HubSpot",
  exposed: true,
  icon: "Database",
  connectHref: "/apps",
  connectTitle: "Connect your HubSpot account",
  connectHelp:
    "This widget reads CRM totals from your account's connected HubSpot portal. Connect HubSpot to see it.",
  connectCtaLabel: "Connect HubSpot",
  // HubSpot is an ACCOUNT-shared portal grant — every account member sees the same
  // portal-level CRM aggregates (core/integrations/credentialSharing.ts → "account").
  visibility: "account",
  attributionPrefix: "HubSpot account",
  metricsByType: {
    stat: [
      { id: "open_deals_count", label: "Open deals", filters: [] },
      { id: "closed_won_deals_count", label: "Closed-won deals", filters: [] },
    ],
    line: [
      { id: "contacts_created_over_time", label: "Contacts created over time", filters: [] },
      { id: "deals_created_over_time", label: "Deals created over time", filters: [] },
      { id: "companies_created_over_time", label: "Companies created over time", filters: [] },
      { id: "tickets_created_over_time", label: "Tickets created over time", filters: [] },
    ],
    bar: [
      { id: "contacts_created_over_time", label: "Contacts created over time", filters: [] },
      { id: "deals_created_over_time", label: "Deals created over time", filters: [] },
      { id: "companies_created_over_time", label: "Companies created over time", filters: [] },
      { id: "tickets_created_over_time", label: "Tickets created over time", filters: [] },
      // Pipeline-health breakdown — bar only; needs a deal-pipeline pick.
      { id: "deals_by_stage", label: "Deals by stage", filters: ["hubspot_pipeline"] },
    ],
  },
};

const SHOPIFY: ConnectedAppSourceUi = {
  provider: "shopify",
  displayName: "Shopify",
  exposed: true,
  icon: "Cube",
  connectHref: "/apps",
  connectTitle: "Connect your Shopify store",
  connectHelp:
    "This widget reads order totals from your account's connected Shopify store. Connect Shopify to see it.",
  connectCtaLabel: "Connect Shopify",
  // Shopify is an ACCOUNT-shared store — every account member sees the same store
  // sales (core/integrations/credentialSharing.ts → "account").
  visibility: "account",
  attributionPrefix: "Shopify store",
  metricsByType: {
    stat: [
      { id: "orders_count", label: "Orders", filters: [] },
      { id: "paid_orders_count", label: "Paid orders", filters: [] },
      { id: "revenue_sum", label: "Revenue", filters: [] },
    ],
    ...seriesForBoth([
      { id: "orders_over_time", label: "Orders over time", filters: [] },
      { id: "revenue_over_time", label: "Revenue over time", filters: [] },
    ]),
  },
};

const MAILCHIMP: ConnectedAppSourceUi = {
  provider: "mailchimp",
  displayName: "Mailchimp",
  exposed: true,
  icon: "Comment",
  connectHref: "/apps",
  connectTitle: "Connect your Mailchimp account",
  connectHelp:
    "This widget reads audience + campaign totals from your account's connected Mailchimp. Connect Mailchimp to see it.",
  connectCtaLabel: "Connect Mailchimp",
  // Mailchimp is an ACCOUNT-shared marketing account — every account member sees the
  // same account/audience aggregates (core/integrations/credentialSharing.ts → "account").
  visibility: "account",
  attributionPrefix: "Mailchimp account",
  metricsByType: {
    stat: [
      { id: "audience_member_count", label: "Audience members", filters: ["mailchimp_audience"] },
      { id: "campaign_count", label: "Campaigns sent", filters: [] },
    ],
    ...seriesForBoth([
      { id: "campaigns_sent_over_time", label: "Campaigns sent over time", filters: [] },
    ]),
  },
};

const DROPBOX: ConnectedAppSourceUi = {
  provider: "dropbox",
  displayName: "Dropbox",
  exposed: true,
  icon: "Layers",
  connectHref: "/apps",
  connectTitle: "Connect your Dropbox",
  connectHelp: "This widget uses your own Dropbox connection. Connect it to see your data.",
  connectCtaLabel: "Connect Dropbox",
  // Personal credential — each viewer sees THEIR OWN Dropbox file metadata, never a
  // co-member's (core/integrations/credentialSharing.ts → "personal").
  visibility: "personal",
  attributionPrefix: "Your Dropbox",
  metricsByType: {
    stat: [
      { id: "files_count", label: "Files", filters: ["dropbox_folder"] },
      { id: "folders_count", label: "Folders", filters: ["dropbox_folder"] },
    ],
    line: [{ id: "files_modified_over_time", label: "Files modified over time", filters: ["dropbox_folder"] }],
    bar: [
      { id: "files_modified_over_time", label: "Files modified over time", filters: ["dropbox_folder"] },
      { id: "files_by_type", label: "Files by type", filters: ["dropbox_folder"] },
    ],
  },
};

const ONEDRIVE: ConnectedAppSourceUi = {
  provider: "microsoft-onedrive",
  displayName: "OneDrive",
  exposed: true,
  icon: "Layers",
  connectHref: "/apps",
  connectTitle: "Connect your OneDrive",
  connectHelp: "This widget uses your own OneDrive connection. Connect it to see your data.",
  connectCtaLabel: "Connect OneDrive",
  // Personal credential — each viewer sees THEIR OWN OneDrive file metadata, never a
  // co-member's (core/integrations/credentialSharing.ts → "personal").
  visibility: "personal",
  attributionPrefix: "Your OneDrive",
  metricsByType: {
    stat: [
      { id: "files_count", label: "Files", filters: ["onedrive_folder"] },
      { id: "folders_count", label: "Folders", filters: ["onedrive_folder"] },
    ],
    line: [{ id: "files_modified_over_time", label: "Files modified over time", filters: ["onedrive_folder"] }],
    bar: [
      { id: "files_modified_over_time", label: "Files modified over time", filters: ["onedrive_folder"] },
      { id: "files_by_type", label: "Files by type", filters: ["onedrive_folder"] },
    ],
  },
};

const GOOGLE_DRIVE: ConnectedAppSourceUi = {
  provider: "google-drive",
  displayName: "Google Drive",
  exposed: true,
  icon: "Layers",
  connectHref: "/apps",
  connectTitle: "Connect your Google Drive",
  connectHelp: "This widget uses your own Google Drive connection. Connect it to see your data.",
  connectCtaLabel: "Connect Google Drive",
  // Personal credential — each viewer sees THEIR OWN Google Drive file metadata, never
  // a co-member's (core/integrations/credentialSharing.ts → "personal").
  visibility: "personal",
  attributionPrefix: "Your Google Drive",
  metricsByType: {
    stat: [
      { id: "files_count", label: "Files", filters: ["gdrive_folder"] },
      { id: "folders_count", label: "Folders", filters: ["gdrive_folder"] },
    ],
    line: [{ id: "files_modified_over_time", label: "Files modified over time", filters: ["gdrive_folder"] }],
    bar: [
      { id: "files_modified_over_time", label: "Files modified over time", filters: ["gdrive_folder"] },
      { id: "files_by_type", label: "Files by type", filters: ["gdrive_folder"] },
    ],
  },
};

const ALL: readonly ConnectedAppSourceUi[] = [
  GITHUB,
  SLACK,
  GOOGLE_CALENDAR,
  GMAIL,
  STRIPE,
  OUTLOOK,
  OUTLOOK_CALENDAR,
  NOTION,
  TRELLO,
  AIRTABLE,
  MONDAY,
  HUBSPOT,
  SHOPIFY,
  MAILCHIMP,
  DROPBOX,
  ONEDRIVE,
  GOOGLE_DRIVE,
];

/** Every connected-app descriptor (exposed or not) — for tests + lookups. */
export function allConnectedAppSources(): readonly ConnectedAppSourceUi[] {
  return ALL;
}

/** Only the connected-app providers currently EXPOSED in the widget UI. */
export function exposedConnectedAppSources(): readonly ConnectedAppSourceUi[] {
  return ALL.filter((s) => s.exposed);
}

/** Descriptor for `provider`, or null. Returns even non-exposed providers. */
export function getConnectedAppSource(provider: string): ConnectedAppSourceUi | null {
  return ALL.find((s) => s.provider === provider) ?? null;
}

/** Descriptor for `provider` ONLY when exposed — null otherwise (UI-facing lookup). */
export function getExposedConnectedAppSource(provider: string): ConnectedAppSourceUi | null {
  const source = getConnectedAppSource(provider);
  return source && source.exposed ? source : null;
}

/** Metric options an EXPOSED provider offers for a widget type ([] when none). */
export function metricsForType(
  source: ConnectedAppSourceUi,
  type: AnalyticsWidgetType,
): readonly ConnectedAppMetricOption[] {
  return source.metricsByType[type] ?? [];
}

/** The metric option for `(provider, metricKey, type)`, or null. */
export function findMetricOption(
  source: ConnectedAppSourceUi,
  type: AnalyticsWidgetType,
  metricKey: string,
): ConnectedAppMetricOption | null {
  return metricsForType(source, type).find((m) => m.id === metricKey) ?? null;
}
