import {
  getAnalyticsSource,
  getAnalyticsSourceMetric,
  isApprovedSourceMetric,
  listAnalyticsSources,
} from "@/services/analytics/sources/registry";

/**
 * Analytics source registry (Slice ANALYTICS-SOURCES-1) — approved-only lookup;
 * unknown provider/metric rejected. No dynamic dispatch from arbitrary strings.
 */

describe("analytics source registry", () => {
  it("resolves a registered source", () => {
    const s = getAnalyticsSource("internal");
    expect(s).not.toBeNull();
    expect(s?.providerKey).toBe("internal");
    expect(s?.connectedApp).toBe(false);
  });

  it("returns null for an unknown provider (no arbitrary execution)", () => {
    expect(getAnalyticsSource("definitely-not-a-provider")).toBeNull();
    expect(getAnalyticsSource("__proto__")).toBeNull();
    expect(getAnalyticsSource("")).toBeNull();
  });

  it("resolves an approved metric and rejects unknown ones", () => {
    expect(getAnalyticsSourceMetric("internal", "runs_over_time")).not.toBeNull();
    expect(getAnalyticsSourceMetric("internal", "rm -rf")).toBeNull();
    expect(getAnalyticsSourceMetric("nope", "runs_over_time")).toBeNull();
  });

  it("isApprovedSourceMetric gates (provider, metric) pairs", () => {
    expect(isApprovedSourceMetric("internal", "success_rate")).toBe(true);
    expect(isApprovedSourceMetric("internal", "arbitrary_method")).toBe(false);
    expect(isApprovedSourceMetric("github", "open_issues")).toBe(true);
    expect(isApprovedSourceMetric("github", "delete_repo")).toBe(false);
    expect(isApprovedSourceMetric("stripe", "revenue")).toBe(false); // not an approved metric key
  });

  it("registers GitHub as a connected-app source (ANALYTICS-SOURCES-GITHUB-1)", () => {
    const gh = getAnalyticsSource("github");
    expect(gh?.connectedApp).toBe(true);
    expect(gh?.metrics.map((m) => m.key).sort()).toEqual(
      ["issues_opened", "open_issues", "open_prs", "prs_merged", "prs_opened"],
    );
  });

  it("registers Slack as a connected-app source (ANALYTICS-SOURCES-SLACK-1)", () => {
    const slack = getAnalyticsSource("slack");
    expect(slack?.connectedApp).toBe(true);
    expect(slack?.metrics.map((m) => m.key).sort()).toEqual(
      ["active_users_count", "channel_activity_count", "keyword_mentions", "messages_over_time"],
    );
    expect(isApprovedSourceMetric("slack", "messages_over_time")).toBe(true);
    expect(isApprovedSourceMetric("slack", "read_all_dms")).toBe(false);
  });

  it("registers Google Calendar as a connected-app source (ANALYTICS-SOURCES-GCAL-1)", () => {
    const gcal = getAnalyticsSource("google-calendar");
    expect(gcal?.connectedApp).toBe(true);
    expect(gcal?.metrics.map((m) => m.key).sort()).toEqual([
      "busy_hours_by_day",
      "meeting_hours_over_time",
      "meetings_over_time",
      "upcoming_meetings_count",
    ]);
    expect(isApprovedSourceMetric("google-calendar", "meetings_over_time")).toBe(true);
    expect(isApprovedSourceMetric("google-calendar", "list_attendees")).toBe(false);
  });

  it("registers Gmail as a connected-app source (ANALYTICS-SOURCES-GMAIL-1)", () => {
    const gmail = getAnalyticsSource("gmail");
    expect(gmail?.connectedApp).toBe(true);
    expect(gmail?.metrics.map((m) => m.key).sort()).toEqual([
      "emails_received_over_time",
      "emails_sent_over_time",
      "label_message_count",
      "unread_count",
    ]);
    expect(isApprovedSourceMetric("gmail", "unread_count")).toBe(true);
    expect(isApprovedSourceMetric("gmail", "read_message_bodies")).toBe(false);
  });

  it("registers Stripe as a connected-app source (ANALYTICS-SOURCES-STRIPE-1)", () => {
    const stripe = getAnalyticsSource("stripe");
    expect(stripe?.connectedApp).toBe(true);
    expect(stripe?.metrics.map((m) => m.key).sort()).toEqual([
      "failed_payment_count",
      "gross_payment_volume",
      "gross_volume_over_time",
      "successful_payment_count",
      "successful_payments_over_time",
    ]);
    expect(isApprovedSourceMetric("stripe", "gross_payment_volume")).toBe(true);
    expect(isApprovedSourceMetric("stripe", "list_customers")).toBe(false);
    // No filters on any Stripe metric (no arbitrary query surface).
    for (const m of stripe!.metrics) expect(m.supportedFilters).toEqual([]);
  });

  it("registers Microsoft Outlook as a connected-app source (ANALYTICS-SOURCES-OUTLOOK-1)", () => {
    const outlook = getAnalyticsSource("microsoft-outlook");
    expect(outlook?.connectedApp).toBe(true);
    expect(outlook?.metrics.map((m) => m.key).sort()).toEqual([
      "emails_received_over_time",
      "emails_sent_over_time",
      "folder_message_count",
      "unread_count",
    ]);
    expect(isApprovedSourceMetric("microsoft-outlook", "unread_count")).toBe(true);
    expect(isApprovedSourceMetric("microsoft-outlook", "read_message_bodies")).toBe(false);
  });

  it("registers Microsoft Outlook Calendar as a connected-app source (ANALYTICS-SOURCES-OUTLOOK-CAL-1)", () => {
    const cal = getAnalyticsSource("microsoft-outlook-calendar");
    expect(cal?.connectedApp).toBe(true);
    expect(cal?.metrics.map((m) => m.key).sort()).toEqual([
      "busy_hours_by_day",
      "meeting_hours_over_time",
      "meetings_over_time",
      "upcoming_meetings_count",
    ]);
    expect(isApprovedSourceMetric("microsoft-outlook-calendar", "meetings_over_time")).toBe(true);
    expect(isApprovedSourceMetric("microsoft-outlook-calendar", "list_attendees")).toBe(false);
    // Calendar filter only (no arbitrary Graph query surface).
    for (const m of cal!.metrics) expect(m.supportedFilters).toEqual(["outlook_calendar"]);
  });

  it("registers Notion as a connected-app source (ANALYTICS-SOURCES-NOTION-1)", () => {
    const notion = getAnalyticsSource("notion");
    expect(notion?.connectedApp).toBe(true);
    expect(notion?.metrics.map((m) => m.key).sort()).toEqual([
      "pages_created_over_time",
      "pages_edited_over_time",
      "recently_updated_count",
      "total_pages_count",
    ]);
    expect(isApprovedSourceMetric("notion", "total_pages_count")).toBe(true);
    expect(isApprovedSourceMetric("notion", "read_page_content")).toBe(false);
    // No filters on any Notion metric (no arbitrary search-query surface).
    for (const m of notion!.metrics) expect(m.supportedFilters).toEqual([]);
  });

  it("registers Trello as a connected-app source (ANALYTICS-SOURCES-TRELLO-1)", () => {
    const trello = getAnalyticsSource("trello");
    expect(trello?.connectedApp).toBe(true);
    expect(trello?.metrics.map((m) => m.key).sort()).toEqual([
      "cards_by_list",
      "cards_created_over_time",
      "closed_cards_count",
      "open_cards_count",
      "overdue_cards_count",
    ]);
    expect(isApprovedSourceMetric("trello", "open_cards_count")).toBe(true);
    expect(isApprovedSourceMetric("trello", "read_card_text")).toBe(false);
    // Every Trello metric is board-scoped (a validated board id; no raw query).
    for (const m of trello!.metrics) expect(m.supportedFilters).toEqual(["board"]);
  });

  it("registers Airtable as a connected-app source (ANALYTICS-SOURCES-AIRTABLE-1)", () => {
    const airtable = getAnalyticsSource("airtable");
    expect(airtable?.connectedApp).toBe(true);
    expect(airtable?.metrics.map((m) => m.key).sort()).toEqual([
      "record_count",
      "records_created_over_time",
      "tables_count",
    ]);
    expect(isApprovedSourceMetric("airtable", "record_count")).toBe(true);
    expect(isApprovedSourceMetric("airtable", "read_cell_values")).toBe(false);
    const byKey = Object.fromEntries(airtable!.metrics.map((m) => [m.key, m.supportedFilters]));
    expect(byKey.record_count).toEqual(["airtable_base", "airtable_table"]);
    expect(byKey.tables_count).toEqual(["airtable_base"]);
  });

  it("registers Monday as a connected-app source (ANALYTICS-SOURCES-MONDAY-1)", () => {
    const monday = getAnalyticsSource("monday");
    expect(monday?.connectedApp).toBe(true);
    expect(monday?.metrics.map((m) => m.key).sort()).toEqual([
      "items_by_group",
      "items_created_over_time",
      "open_items_count",
    ]);
    expect(isApprovedSourceMetric("monday", "open_items_count")).toBe(true);
    expect(isApprovedSourceMetric("monday", "read_item_columns")).toBe(false);
    for (const m of monday!.metrics) expect(m.supportedFilters).toEqual(["monday_board"]);
  });

  it("registers HubSpot as a connected-app source (ANALYTICS-SOURCES-HUBSPOT-1)", () => {
    const hubspot = getAnalyticsSource("hubspot");
    expect(hubspot?.connectedApp).toBe(true);
    expect(hubspot?.metrics.map((m) => m.key).sort()).toEqual([
      "closed_won_deals_count",
      "companies_created_over_time",
      "contacts_created_over_time",
      "deals_by_stage",
      "deals_created_over_time",
      "open_deals_count",
      "tickets_created_over_time",
    ]);
    expect(isApprovedSourceMetric("hubspot", "open_deals_count")).toBe(true);
    expect(isApprovedSourceMetric("hubspot", "deals_by_stage")).toBe(true);
    expect(isApprovedSourceMetric("hubspot", "list_contact_emails")).toBe(false);
    // Only deals_by_stage takes a (pipeline) filter; the count-only metrics take none.
    const byKey = Object.fromEntries(hubspot!.metrics.map((m) => [m.key, m.supportedFilters]));
    expect(byKey.deals_by_stage).toEqual(["hubspot_pipeline"]);
    expect(byKey.open_deals_count).toEqual([]);
    expect(byKey.contacts_created_over_time).toEqual([]);
  });

  it("registers Shopify as a connected-app source (ANALYTICS-SOURCES-SHOPIFY-1)", () => {
    const shopify = getAnalyticsSource("shopify");
    expect(shopify?.connectedApp).toBe(true);
    expect(shopify?.metrics.map((m) => m.key).sort()).toEqual([
      "orders_count",
      "orders_over_time",
      "paid_orders_count",
      "revenue_over_time",
      "revenue_sum",
    ]);
    expect(isApprovedSourceMetric("shopify", "revenue_sum")).toBe(true);
    expect(isApprovedSourceMetric("shopify", "list_customers")).toBe(false);
    // Count/sum-only, no picker → no metric takes a filter (no arbitrary query surface).
    for (const m of shopify!.metrics) expect(m.supportedFilters).toEqual([]);
  });

  it("registers Mailchimp as a connected-app source (ANALYTICS-SOURCES-MAILCHIMP-1)", () => {
    const mailchimp = getAnalyticsSource("mailchimp");
    expect(mailchimp?.connectedApp).toBe(true);
    expect(mailchimp?.metrics.map((m) => m.key).sort()).toEqual([
      "audience_member_count",
      "campaign_count",
      "campaigns_sent_over_time",
    ]);
    expect(isApprovedSourceMetric("mailchimp", "audience_member_count")).toBe(true);
    expect(isApprovedSourceMetric("mailchimp", "list_subscriber_emails")).toBe(false);
    const byKey = Object.fromEntries(mailchimp!.metrics.map((m) => [m.key, m.supportedFilters]));
    expect(byKey.audience_member_count).toEqual(["mailchimp_audience"]);
    expect(byKey.campaign_count).toEqual([]);
  });

  it("lists approved sources with their metric catalog", () => {
    const cat = listAnalyticsSources();
    const internal = cat.find((c) => c.providerKey === "internal");
    expect(internal).toBeDefined();
    expect(internal?.connectedApp).toBe(false);
    expect(internal?.metrics.map((m) => m.key)).toEqual(
      expect.arrayContaining(["runs_over_time", "success_rate", "top_workflows"]),
    );
    // Internal stays non-connected; GitHub is the first connected-app source.
    expect(cat.find((c) => c.providerKey === "github")?.connectedApp).toBe(true);
  });
});
