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
  | "outlook_folder";

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

const ALL: readonly ConnectedAppSourceUi[] = [GITHUB, SLACK, GOOGLE_CALENDAR, GMAIL, STRIPE, OUTLOOK];

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
