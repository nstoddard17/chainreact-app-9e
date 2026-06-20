/**
 * @jest-environment node
 *
 * Connected-app UI exposure descriptor (Slice ANALYTICS-SOURCES-SLACK-UI-1;
 * GitHub re-exposed in ANALYTICS-SOURCES-GITHUB-UI-2). Both Slack and GitHub are
 * exposed; the `exposed` switch remains the chokepoint for any future provider.
 */

import {
  allConnectedAppSources,
  exposedConnectedAppSources,
  findMetricOption,
  getConnectedAppSource,
  getExposedConnectedAppSource,
  metricsForType,
} from "@/features/analytics/connectedAppSources";

describe("exposure gating", () => {
  it("exposes GitHub in the widget UI (re-enabled after the connection was fixed)", () => {
    expect(exposedConnectedAppSources().map((s) => s.provider)).toContain("github");
    expect(getConnectedAppSource("github")?.exposed).toBe(true);
    expect(getExposedConnectedAppSource("github")?.displayName).toBe("GitHub");
  });

  it("exposes Slack", () => {
    expect(exposedConnectedAppSources().map((s) => s.provider)).toContain("slack");
    expect(getExposedConnectedAppSource("slack")?.displayName).toBe("Slack");
  });

  it("exposes Google Calendar", () => {
    expect(exposedConnectedAppSources().map((s) => s.provider)).toContain("google-calendar");
    expect(getExposedConnectedAppSource("google-calendar")?.displayName).toBe("Google Calendar");
  });

  it("exposes Gmail", () => {
    expect(exposedConnectedAppSources().map((s) => s.provider)).toContain("gmail");
    expect(getExposedConnectedAppSource("gmail")?.displayName).toBe("Gmail");
  });

  it("exposes Stripe", () => {
    expect(exposedConnectedAppSources().map((s) => s.provider)).toContain("stripe");
    expect(getExposedConnectedAppSource("stripe")?.displayName).toBe("Stripe");
  });

  it("exposes Microsoft Outlook", () => {
    expect(exposedConnectedAppSources().map((s) => s.provider)).toContain("microsoft-outlook");
    expect(getExposedConnectedAppSource("microsoft-outlook")?.displayName).toBe("Microsoft Outlook");
  });

  it("exposes Outlook Calendar", () => {
    expect(exposedConnectedAppSources().map((s) => s.provider)).toContain("microsoft-outlook-calendar");
    expect(getExposedConnectedAppSource("microsoft-outlook-calendar")?.displayName).toBe("Outlook Calendar");
  });

  it("every descriptor declares a credential visibility matching its sharing model", () => {
    expect(getConnectedAppSource("slack")?.visibility).toBe("account");
    expect(getConnectedAppSource("github")?.visibility).toBe("personal");
    expect(getConnectedAppSource("google-calendar")?.visibility).toBe("personal");
    expect(getConnectedAppSource("gmail")?.visibility).toBe("personal");
    // Stripe is a shared business account → account-wide visibility.
    expect(getConnectedAppSource("stripe")?.visibility).toBe("account");
    // Outlook is a personal mailbox → per-viewer visibility.
    expect(getConnectedAppSource("microsoft-outlook")?.visibility).toBe("personal");
    // Outlook Calendar is a personal calendar → per-viewer visibility.
    expect(getConnectedAppSource("microsoft-outlook-calendar")?.visibility).toBe("personal");
    // Notion is a shared workspace grant → account-wide visibility.
    expect(getConnectedAppSource("notion")?.visibility).toBe("account");
    // Trello is a personal connection → per-viewer visibility.
    expect(getConnectedAppSource("trello")?.visibility).toBe("personal");
    // Airtable is a personal connection → per-viewer visibility.
    expect(getConnectedAppSource("airtable")?.visibility).toBe("personal");
    // Monday is a personal connection → per-viewer visibility.
    expect(getConnectedAppSource("monday")?.visibility).toBe("personal");
    // HubSpot is a shared portal grant → account-wide visibility.
    expect(getConnectedAppSource("hubspot")?.visibility).toBe("account");
    // Shopify is a shared store → account-wide visibility.
    expect(getConnectedAppSource("shopify")?.visibility).toBe("account");
    // Mailchimp is a shared marketing account → account-wide visibility.
    expect(getConnectedAppSource("mailchimp")?.visibility).toBe("account");
    // Dropbox is a personal connection → per-viewer visibility.
    expect(getConnectedAppSource("dropbox")?.visibility).toBe("personal");
    // OneDrive is a personal connection → per-viewer visibility.
    expect(getConnectedAppSource("microsoft-onedrive")?.visibility).toBe("personal");
    // Google Drive is a personal connection → per-viewer visibility.
    expect(getConnectedAppSource("google-drive")?.visibility).toBe("personal");
    // Discord is a personal connection gate → per-viewer visibility.
    expect(getConnectedAppSource("discord")?.visibility).toBe("personal");
    // Microsoft Teams is a personal connection → per-viewer visibility.
    expect(getConnectedAppSource("microsoft-teams")?.visibility).toBe("personal");
    // Google Docs + Sheets are personal connections → per-viewer visibility.
    expect(getConnectedAppSource("google-docs")?.visibility).toBe("personal");
    expect(getConnectedAppSource("google-sheets")?.visibility).toBe("personal");
  });
});

describe("Google Docs + Sheets metric/filter shape", () => {
  const docs = getExposedConnectedAppSource("google-docs")!;
  const sheets = getExposedConnectedAppSource("google-sheets")!;

  it("exposes Docs with a count scalar on stat + created/modified series on line/bar, no filters", () => {
    expect(exposedConnectedAppSources().map((s) => s.provider)).toContain("google-docs");
    expect(getExposedConnectedAppSource("google-docs")?.displayName).toBe("Google Docs");
    expect(metricsForType(docs, "stat").map((m) => m.id)).toEqual(["documents_count"]);
    expect(metricsForType(docs, "line").map((m) => m.id).sort()).toEqual([
      "documents_created_over_time",
      "documents_modified_over_time",
    ]);
    expect(metricsForType(docs, "bar").map((m) => m.id).sort()).toEqual([
      "documents_created_over_time",
      "documents_modified_over_time",
    ]);
    for (const type of ["stat", "line", "bar"] as const) {
      for (const m of metricsForType(docs, type)) expect(m.filters).toEqual([]);
    }
  });

  it("exposes Sheets with a count scalar on stat + created/modified series on line/bar, no filters", () => {
    expect(exposedConnectedAppSources().map((s) => s.provider)).toContain("google-sheets");
    expect(getExposedConnectedAppSource("google-sheets")?.displayName).toBe("Google Sheets");
    expect(metricsForType(sheets, "stat").map((m) => m.id)).toEqual(["spreadsheets_count"]);
    expect(metricsForType(sheets, "line").map((m) => m.id).sort()).toEqual([
      "spreadsheets_created_over_time",
      "spreadsheets_modified_over_time",
    ]);
    expect(metricsForType(sheets, "donut")).toEqual([]);
    for (const type of ["stat", "line", "bar"] as const) {
      for (const m of metricsForType(sheets, type)) expect(m.filters).toEqual([]);
    }
  });
});

describe("Microsoft Teams metric/filter shape", () => {
  const teams = getExposedConnectedAppSource("microsoft-teams")!;

  it("exposes Teams with team/channel scalars on stat, message series on line/bar, by-channel bar-only", () => {
    expect(exposedConnectedAppSources().map((s) => s.provider)).toContain("microsoft-teams");
    expect(getExposedConnectedAppSource("microsoft-teams")?.displayName).toBe("Microsoft Teams");
    expect(metricsForType(teams, "stat").map((m) => m.id).sort()).toEqual([
      "active_channels_count",
      "channel_messages_count",
      "team_channels_count",
    ]);
    expect(metricsForType(teams, "line").map((m) => m.id)).toEqual(["channel_messages_over_time"]);
    expect(metricsForType(teams, "bar").map((m) => m.id).sort()).toEqual([
      "channel_messages_over_time",
      "messages_by_channel",
    ]);
    expect(metricsForType(teams, "donut")).toEqual([]);
  });

  it("team-only metrics take just teams_team; channel metrics take team + channel", () => {
    expect(findMetricOption(teams, "stat", "team_channels_count")?.filters).toEqual(["teams_team"]);
    expect(findMetricOption(teams, "stat", "channel_messages_count")?.filters).toEqual([
      "teams_team",
      "teams_channel",
    ]);
    expect(findMetricOption(teams, "line", "channel_messages_over_time")?.filters).toEqual([
      "teams_team",
      "teams_channel",
    ]);
    expect(findMetricOption(teams, "bar", "messages_by_channel")?.filters).toEqual(["teams_team"]);
  });
});

describe("Discord metric/filter shape", () => {
  const discord = getExposedConnectedAppSource("discord")!;

  it("exposes Discord with server/channel scalars on stat, message series on line/bar, by-channel bar-only", () => {
    expect(exposedConnectedAppSources().map((s) => s.provider)).toContain("discord");
    expect(getExposedConnectedAppSource("discord")?.displayName).toBe("Discord");
    expect(metricsForType(discord, "stat").map((m) => m.id).sort()).toEqual([
      "active_channels_count",
      "messages_count",
      "server_channels_count",
      "server_member_count",
    ]);
    expect(metricsForType(discord, "line").map((m) => m.id)).toEqual(["channel_messages_over_time"]);
    expect(metricsForType(discord, "bar").map((m) => m.id).sort()).toEqual([
      "channel_messages_over_time",
      "messages_by_channel",
    ]);
    expect(metricsForType(discord, "donut")).toEqual([]);
  });

  it("guild-only metrics take just discord_guild; channel metrics take guild + channel", () => {
    expect(findMetricOption(discord, "stat", "server_channels_count")?.filters).toEqual(["discord_guild"]);
    expect(findMetricOption(discord, "stat", "messages_count")?.filters).toEqual([
      "discord_guild",
      "discord_channel",
    ]);
    expect(findMetricOption(discord, "line", "channel_messages_over_time")?.filters).toEqual([
      "discord_guild",
      "discord_channel",
    ]);
    expect(findMetricOption(discord, "bar", "messages_by_channel")?.filters).toEqual(["discord_guild"]);
  });
});

describe("Google Drive metric/filter shape", () => {
  const gdrive = getExposedConnectedAppSource("google-drive")!;

  it("exposes Google Drive with file/folder scalars for stat and file series for line/bar; files_by_type bar-only", () => {
    expect(exposedConnectedAppSources().map((s) => s.provider)).toContain("google-drive");
    expect(getExposedConnectedAppSource("google-drive")?.displayName).toBe("Google Drive");
    expect(metricsForType(gdrive, "stat").map((m) => m.id).sort()).toEqual([
      "files_count",
      "folders_count",
    ]);
    expect(metricsForType(gdrive, "line").map((m) => m.id)).toEqual(["files_modified_over_time"]);
    expect(metricsForType(gdrive, "bar").map((m) => m.id).sort()).toEqual([
      "files_by_type",
      "files_modified_over_time",
    ]);
    expect(metricsForType(gdrive, "line").map((m) => m.id)).not.toContain("files_by_type");
    expect(metricsForType(gdrive, "donut")).toEqual([]);
  });

  it("every Google Drive metric takes a single (optional) gdrive_folder filter", () => {
    for (const type of ["stat", "line", "bar"] as const) {
      for (const m of metricsForType(gdrive, type)) {
        expect(m.filters).toEqual(["gdrive_folder"]);
      }
    }
  });
});

describe("OneDrive metric/filter shape", () => {
  const onedrive = getExposedConnectedAppSource("microsoft-onedrive")!;

  it("exposes OneDrive with file/folder scalars for stat and file series for line/bar; files_by_type bar-only", () => {
    expect(exposedConnectedAppSources().map((s) => s.provider)).toContain("microsoft-onedrive");
    expect(getExposedConnectedAppSource("microsoft-onedrive")?.displayName).toBe("OneDrive");
    expect(metricsForType(onedrive, "stat").map((m) => m.id).sort()).toEqual([
      "files_count",
      "folders_count",
    ]);
    expect(metricsForType(onedrive, "line").map((m) => m.id)).toEqual(["files_modified_over_time"]);
    expect(metricsForType(onedrive, "bar").map((m) => m.id).sort()).toEqual([
      "files_by_type",
      "files_modified_over_time",
    ]);
    expect(metricsForType(onedrive, "line").map((m) => m.id)).not.toContain("files_by_type");
    expect(metricsForType(onedrive, "donut")).toEqual([]);
  });

  it("every OneDrive metric takes a single (optional) onedrive_folder filter", () => {
    for (const type of ["stat", "line", "bar"] as const) {
      for (const m of metricsForType(onedrive, type)) {
        expect(m.filters).toEqual(["onedrive_folder"]);
      }
    }
  });
});

describe("Dropbox metric/filter shape", () => {
  const dropbox = getExposedConnectedAppSource("dropbox")!;

  it("exposes Dropbox with file/folder scalars for stat and file series for line/bar; files_by_type bar-only", () => {
    expect(exposedConnectedAppSources().map((s) => s.provider)).toContain("dropbox");
    expect(getExposedConnectedAppSource("dropbox")?.displayName).toBe("Dropbox");
    expect(metricsForType(dropbox, "stat").map((m) => m.id).sort()).toEqual([
      "files_count",
      "folders_count",
    ]);
    expect(metricsForType(dropbox, "line").map((m) => m.id)).toEqual(["files_modified_over_time"]);
    expect(metricsForType(dropbox, "bar").map((m) => m.id).sort()).toEqual([
      "files_by_type",
      "files_modified_over_time",
    ]);
    expect(metricsForType(dropbox, "line").map((m) => m.id)).not.toContain("files_by_type");
    expect(metricsForType(dropbox, "donut")).toEqual([]);
  });

  it("every Dropbox metric takes a single (optional) dropbox_folder filter", () => {
    for (const type of ["stat", "line", "bar"] as const) {
      for (const m of metricsForType(dropbox, type)) {
        expect(m.filters).toEqual(["dropbox_folder"]);
      }
    }
  });
});

describe("Mailchimp metric/filter shape", () => {
  const mailchimp = getExposedConnectedAppSource("mailchimp")!;

  it("exposes Mailchimp with audience/campaign scalars for stat and campaign series for line/bar", () => {
    expect(exposedConnectedAppSources().map((s) => s.provider)).toContain("mailchimp");
    expect(getExposedConnectedAppSource("mailchimp")?.displayName).toBe("Mailchimp");
    expect(metricsForType(mailchimp, "stat").map((m) => m.id).sort()).toEqual([
      "audience_member_count",
      "campaign_count",
    ]);
    expect(metricsForType(mailchimp, "line").map((m) => m.id)).toEqual(["campaigns_sent_over_time"]);
    expect(metricsForType(mailchimp, "bar").map((m) => m.id)).toEqual(["campaigns_sent_over_time"]);
    expect(metricsForType(mailchimp, "donut")).toEqual([]);
  });

  it("audience_member_count needs an audience filter; campaign metrics take none", () => {
    expect(findMetricOption(mailchimp, "stat", "audience_member_count")?.filters).toEqual(["mailchimp_audience"]);
    expect(findMetricOption(mailchimp, "stat", "campaign_count")?.filters).toEqual([]);
    expect(findMetricOption(mailchimp, "line", "campaigns_sent_over_time")?.filters).toEqual([]);
  });
});

describe("Shopify metric/filter shape", () => {
  const shopify = getExposedConnectedAppSource("shopify")!;

  it("exposes Shopify with sales scalars for stat and over-time series for line/bar; no filters", () => {
    expect(exposedConnectedAppSources().map((s) => s.provider)).toContain("shopify");
    expect(getExposedConnectedAppSource("shopify")?.displayName).toBe("Shopify");
    expect(metricsForType(shopify, "stat").map((m) => m.id).sort()).toEqual([
      "orders_count",
      "paid_orders_count",
      "revenue_sum",
    ]);
    expect(metricsForType(shopify, "line").map((m) => m.id).sort()).toEqual([
      "orders_over_time",
      "revenue_over_time",
    ]);
    expect(metricsForType(shopify, "bar").map((m) => m.id)).toEqual(
      metricsForType(shopify, "line").map((m) => m.id),
    );
    expect(metricsForType(shopify, "donut")).toEqual([]);
    expect(metricsForType(shopify, "table")).toEqual([]);
    for (const type of ["stat", "line", "bar"] as const) {
      for (const m of metricsForType(shopify, type)) expect(m.filters).toEqual([]);
    }
  });
});

describe("HubSpot metric/filter shape", () => {
  const hubspot = getExposedConnectedAppSource("hubspot")!;

  it("exposes HubSpot with deal scalars for stat, created-over-time series for line/bar, and deals_by_stage bar-only", () => {
    expect(exposedConnectedAppSources().map((s) => s.provider)).toContain("hubspot");
    expect(getExposedConnectedAppSource("hubspot")?.displayName).toBe("HubSpot");
    expect(metricsForType(hubspot, "stat").map((m) => m.id).sort()).toEqual([
      "closed_won_deals_count",
      "open_deals_count",
    ]);
    expect(metricsForType(hubspot, "line").map((m) => m.id).sort()).toEqual([
      "companies_created_over_time",
      "contacts_created_over_time",
      "deals_created_over_time",
      "tickets_created_over_time",
    ]);
    expect(metricsForType(hubspot, "bar").map((m) => m.id).sort()).toEqual([
      "companies_created_over_time",
      "contacts_created_over_time",
      "deals_by_stage",
      "deals_created_over_time",
      "tickets_created_over_time",
    ]);
    // deals_by_stage is bar-only — never offered on a line widget.
    expect(metricsForType(hubspot, "line").map((m) => m.id)).not.toContain("deals_by_stage");
    expect(metricsForType(hubspot, "donut")).toEqual([]);
    expect(metricsForType(hubspot, "table")).toEqual([]);
  });

  it("count-only metrics take no filter; deals_by_stage takes a single hubspot_pipeline filter", () => {
    for (const type of ["stat", "line"] as const) {
      for (const m of metricsForType(hubspot, type)) {
        expect(m.filters).toEqual([]);
      }
    }
    expect(findMetricOption(hubspot, "bar", "deals_by_stage")?.filters).toEqual(["hubspot_pipeline"]);
    expect(findMetricOption(hubspot, "bar", "deals_created_over_time")?.filters).toEqual([]);
  });
});

describe("Monday metric/filter shape", () => {
  const monday = getExposedConnectedAppSource("monday")!;

  it("exposes Monday with a board-scoped scalar/series; items_by_group is bar-only", () => {
    expect(exposedConnectedAppSources().map((s) => s.provider)).toContain("monday");
    expect(metricsForType(monday, "stat").map((m) => m.id)).toEqual(["open_items_count"]);
    expect(metricsForType(monday, "line").map((m) => m.id)).toEqual(["items_created_over_time"]);
    expect(metricsForType(monday, "bar").map((m) => m.id).sort()).toEqual([
      "items_by_group",
      "items_created_over_time",
    ]);
    expect(metricsForType(monday, "line").map((m) => m.id)).not.toContain("items_by_group");
    expect(metricsForType(monday, "donut")).toEqual([]);
  });

  it("every Monday metric takes a single monday_board filter", () => {
    for (const type of ["stat", "line", "bar"] as const) {
      for (const m of metricsForType(monday, type)) {
        expect(m.filters).toEqual(["monday_board"]);
      }
    }
  });
});

describe("Airtable metric/filter shape", () => {
  const airtable = getExposedConnectedAppSource("airtable")!;

  it("exposes Airtable; record metrics need base+table, tables_count needs base only", () => {
    expect(exposedConnectedAppSources().map((s) => s.provider)).toContain("airtable");
    expect(metricsForType(airtable, "stat").map((m) => m.id).sort()).toEqual([
      "record_count",
      "tables_count",
    ]);
    expect(metricsForType(airtable, "line").map((m) => m.id)).toEqual(["records_created_over_time"]);
    expect(metricsForType(airtable, "bar").map((m) => m.id)).toEqual(["records_created_over_time"]);
    expect(metricsForType(airtable, "donut")).toEqual([]);
  });

  it("record metrics take base + table; tables_count takes base only", () => {
    expect(findMetricOption(airtable, "stat", "record_count")?.filters).toEqual([
      "airtable_base",
      "airtable_table",
    ]);
    expect(findMetricOption(airtable, "stat", "tables_count")?.filters).toEqual(["airtable_base"]);
    expect(findMetricOption(airtable, "line", "records_created_over_time")?.filters).toEqual([
      "airtable_base",
      "airtable_table",
    ]);
  });
});

describe("Trello metric/filter shape", () => {
  const trello = getExposedConnectedAppSource("trello")!;

  it("exposes Trello with board-scoped scalars/series; cards_by_list is bar-only", () => {
    expect(exposedConnectedAppSources().map((s) => s.provider)).toContain("trello");
    expect(metricsForType(trello, "stat").map((m) => m.id).sort()).toEqual([
      "closed_cards_count",
      "open_cards_count",
      "overdue_cards_count",
    ]);
    expect(metricsForType(trello, "line").map((m) => m.id)).toEqual(["cards_created_over_time"]);
    expect(metricsForType(trello, "bar").map((m) => m.id).sort()).toEqual([
      "cards_by_list",
      "cards_created_over_time",
    ]);
    // cards_by_list must NOT appear on a line widget.
    expect(metricsForType(trello, "line").map((m) => m.id)).not.toContain("cards_by_list");
    expect(metricsForType(trello, "donut")).toEqual([]);
  });

  it("every Trello metric takes a single trello_board filter", () => {
    for (const type of ["stat", "line", "bar"] as const) {
      for (const m of metricsForType(trello, type)) {
        expect(m.filters).toEqual(["trello_board"]);
      }
    }
  });
});

describe("Notion metric/filter shape", () => {
  const notion = getExposedConnectedAppSource("notion")!;

  it("offers page-activity scalars for stat and series for line/bar; none take a filter", () => {
    expect(metricsForType(notion, "stat").map((m) => m.id).sort()).toEqual([
      "recently_updated_count",
      "total_pages_count",
    ]);
    expect(metricsForType(notion, "line").map((m) => m.id).sort()).toEqual([
      "pages_created_over_time",
      "pages_edited_over_time",
    ]);
    expect(metricsForType(notion, "bar").map((m) => m.id)).toEqual(
      metricsForType(notion, "line").map((m) => m.id),
    );
    expect(metricsForType(notion, "donut")).toEqual([]);
    for (const type of ["stat", "line", "bar"] as const) {
      for (const m of metricsForType(notion, type)) expect(m.filters).toEqual([]);
    }
  });

  it("exposes Notion in the widget UI", () => {
    expect(exposedConnectedAppSources().map((s) => s.provider)).toContain("notion");
    expect(getExposedConnectedAppSource("notion")?.displayName).toBe("Notion");
  });
});

describe("Outlook Calendar metric/filter shape", () => {
  const cal = getExposedConnectedAppSource("microsoft-outlook-calendar")!;

  it("offers a scalar for stat, series for line/bar; busy_hours_by_day is bar-only", () => {
    expect(metricsForType(cal, "stat").map((m) => m.id)).toEqual(["upcoming_meetings_count"]);
    expect(metricsForType(cal, "line").map((m) => m.id).sort()).toEqual([
      "meeting_hours_over_time",
      "meetings_over_time",
    ]);
    expect(metricsForType(cal, "bar").map((m) => m.id).sort()).toEqual([
      "busy_hours_by_day",
      "meeting_hours_over_time",
      "meetings_over_time",
    ]);
    expect(metricsForType(cal, "line").map((m) => m.id)).not.toContain("busy_hours_by_day");
    expect(metricsForType(cal, "donut")).toEqual([]);
  });

  it("every Outlook Calendar metric takes a single outlookcal_calendar filter", () => {
    for (const type of ["stat", "line", "bar"] as const) {
      for (const m of metricsForType(cal, type)) {
        expect(m.filters).toEqual(["outlookcal_calendar"]);
      }
    }
  });
});

describe("Outlook metric/filter shape", () => {
  const outlook = getExposedConnectedAppSource("microsoft-outlook")!;

  it("offers scalars for stat (unread no-filter, folder needs outlook_folder) and series for line/bar", () => {
    expect(metricsForType(outlook, "stat").map((m) => m.id).sort()).toEqual([
      "folder_message_count",
      "unread_count",
    ]);
    expect(metricsForType(outlook, "line").map((m) => m.id).sort()).toEqual([
      "emails_received_over_time",
      "emails_sent_over_time",
    ]);
    expect(metricsForType(outlook, "donut")).toEqual([]);
  });

  it("unread_count takes NO filter; folder_message_count takes an outlook_folder filter", () => {
    expect(findMetricOption(outlook, "stat", "unread_count")?.filters).toEqual([]);
    expect(findMetricOption(outlook, "stat", "folder_message_count")?.filters).toEqual(["outlook_folder"]);
    expect(findMetricOption(outlook, "line", "emails_received_over_time")?.filters).toEqual([]);
  });
});

describe("Stripe metric/filter shape", () => {
  const stripe = getExposedConnectedAppSource("stripe")!;

  it("offers payment scalars for stat and series for line/bar, none for donut/table", () => {
    expect(metricsForType(stripe, "stat").map((m) => m.id).sort()).toEqual([
      "failed_payment_count",
      "gross_payment_volume",
      "successful_payment_count",
    ]);
    expect(metricsForType(stripe, "line").map((m) => m.id).sort()).toEqual([
      "gross_volume_over_time",
      "successful_payments_over_time",
    ]);
    expect(metricsForType(stripe, "bar").map((m) => m.id)).toEqual(
      metricsForType(stripe, "line").map((m) => m.id),
    );
    expect(metricsForType(stripe, "donut")).toEqual([]);
    expect(metricsForType(stripe, "table")).toEqual([]);
  });

  it("no Stripe metric takes a filter (date window is server-owned, no raw query)", () => {
    for (const type of ["stat", "line", "bar"] as const) {
      for (const m of metricsForType(stripe, type)) {
        expect(m.filters).toEqual([]);
      }
    }
  });
});

describe("Gmail metric/filter shape", () => {
  const gmail = getExposedConnectedAppSource("gmail")!;

  it("offers scalars for stat (unread no-filter, label needs gmail_label) and series for line/bar", () => {
    expect(metricsForType(gmail, "stat").map((m) => m.id).sort()).toEqual([
      "label_message_count",
      "unread_count",
    ]);
    expect(metricsForType(gmail, "line").map((m) => m.id).sort()).toEqual([
      "emails_received_over_time",
      "emails_sent_over_time",
    ]);
    expect(metricsForType(gmail, "donut")).toEqual([]);
  });

  it("unread_count takes NO filter; label_message_count takes a gmail_label filter", () => {
    expect(findMetricOption(gmail, "stat", "unread_count")?.filters).toEqual([]);
    expect(findMetricOption(gmail, "stat", "label_message_count")?.filters).toEqual(["gmail_label"]);
    // series metrics take no filter (server-owned queries)
    expect(findMetricOption(gmail, "line", "emails_received_over_time")?.filters).toEqual([]);
  });
});

describe("Google Calendar metric/filter shape", () => {
  const gcal = getExposedConnectedAppSource("google-calendar")!;

  it("offers a scalar for stat, series for line/bar; busy_hours_by_day is bar-only", () => {
    expect(metricsForType(gcal, "stat").map((m) => m.id)).toEqual(["upcoming_meetings_count"]);
    expect(metricsForType(gcal, "line").map((m) => m.id).sort()).toEqual([
      "meeting_hours_over_time",
      "meetings_over_time",
    ]);
    expect(metricsForType(gcal, "bar").map((m) => m.id).sort()).toEqual([
      "busy_hours_by_day",
      "meeting_hours_over_time",
      "meetings_over_time",
    ]);
    // busy_hours_by_day must NOT appear on a line widget.
    expect(metricsForType(gcal, "line").map((m) => m.id)).not.toContain("busy_hours_by_day");
    expect(metricsForType(gcal, "donut")).toEqual([]);
  });

  it("every Google Calendar metric takes a single gcal_calendar filter", () => {
    for (const type of ["stat", "line", "bar"] as const) {
      for (const m of metricsForType(gcal, type)) {
        expect(m.filters).toEqual(["gcal_calendar"]);
      }
    }
  });
});

describe("GitHub metric/filter shape", () => {
  const github = getExposedConnectedAppSource("github")!;

  it("offers scalar metrics for stat and series metrics for line/bar (not donut/table)", () => {
    expect(metricsForType(github, "stat").map((m) => m.id).sort()).toEqual([
      "open_issues",
      "open_prs",
    ]);
    expect(metricsForType(github, "line").map((m) => m.id).sort()).toEqual([
      "issues_opened",
      "prs_merged",
      "prs_opened",
    ]);
    expect(metricsForType(github, "bar").map((m) => m.id)).toEqual(
      metricsForType(github, "line").map((m) => m.id),
    );
    expect(metricsForType(github, "donut")).toEqual([]);
    expect(metricsForType(github, "table")).toEqual([]);
  });

  it("every GitHub metric takes a single repo filter (no multi-repo / qualifiers)", () => {
    for (const type of ["stat", "line", "bar"] as const) {
      for (const m of metricsForType(github, type)) {
        expect(m.filters).toEqual(["repo"]);
      }
    }
  });
});

describe("Slack metric/filter shape", () => {
  const slack = getExposedConnectedAppSource("slack")!;

  it("offers scalar metrics for stat and series metrics for line/bar", () => {
    expect(metricsForType(slack, "stat").map((m) => m.id).sort()).toEqual([
      "active_users_count",
      "channel_activity_count",
    ]);
    expect(metricsForType(slack, "line").map((m) => m.id).sort()).toEqual([
      "keyword_mentions",
      "messages_over_time",
    ]);
    // donut/table/etc. don't take a Slack metric.
    expect(metricsForType(slack, "donut")).toEqual([]);
  });

  it("keyword_mentions requires both channel and keyword; others just channel", () => {
    expect(findMetricOption(slack, "line", "keyword_mentions")?.filters).toEqual([
      "slack_channel",
      "keyword",
    ]);
    expect(findMetricOption(slack, "stat", "channel_activity_count")?.filters).toEqual([
      "slack_channel",
    ]);
  });
});

it("all descriptors expose only registry-safe metric keys (no arbitrary methods)", () => {
  for (const s of allConnectedAppSources()) {
    for (const list of Object.values(s.metricsByType)) {
      for (const m of list ?? []) {
        expect(m.id).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    }
  }
});
