/** @jest-environment node */
/**
 * Config-field UX sweep (CONFIG-FIELD-UX-SWEEP) — metadata-only adoptions:
 *   - Outlook Calendar create/update event: datetime + timezone controls.
 *   - Google Analytics run_report: date controls for the custom range.
 *   - Google Calendar create/update event: colorId static enum select.
 *
 * Proves the new field types are wired, the stored config KEYS are unchanged
 * (handlers/schemas read the same keys / value formats), required-ness is
 * preserved, and every touched meta still validates against ActionMetaSchema.
 */
import { ActionMetaSchema, type ActionMeta, type FieldMeta } from "@/contracts/actionMeta";
import { TriggerMetaSchema } from "@/contracts/triggerMeta";
// CS-6E — schedule_post / publish_post_now are DEFERRED (unregistered/hidden), so
// their config-UX is asserted from the retained orphan meta OBJECTS, not the registry.
import { edenSchedulePostMeta } from "@/integrations/eden/actions/scheduling/schedulePost.meta";
import { edenPublishPostNowMeta } from "@/integrations/eden/actions/scheduling/publishPostNow.meta";
import {
  listActionMetasForProvider,
  listTriggerMetasForProvider,
} from "@/services/discovery/_registry";

function meta(provider: string, key: string): ActionMeta {
  const m = listActionMetasForProvider(provider).find((x) => x.key === key);
  if (!m) throw new Error(`meta not found: ${key}`);
  return m;
}
function field(m: ActionMeta, name: string): FieldMeta {
  const f = m.fields.find((x) => x.name === name);
  if (!f) throw new Error(`field not found: ${m.key}.${name}`);
  return f;
}

describe("sweep — Outlook Calendar datetime + timezone controls", () => {
  it.each([
    "microsoft-outlook-calendar:create_event",
    "microsoft-outlook-calendar:update_event",
  ])("%s start/end are datetime; time zones are timezone (keys unchanged)", (key) => {
    const m = meta("microsoft-outlook-calendar", key);
    expect(field(m, "startDateTime").type).toBe("datetime");
    expect(field(m, "endDateTime").type).toBe("datetime");
    expect(field(m, "startTimeZone").type).toBe("timezone");
    expect(field(m, "endTimeZone").type).toBe("timezone");
    // No raw "text" smell left on these temporal keys.
    expect(field(m, "startDateTime").type).not.toBe("text");
    expect(ActionMetaSchema.safeParse(m).success).toBe(true);
  });

  it("create_event keeps start/end required; update_event keeps them optional (validation unchanged)", () => {
    const create = meta("microsoft-outlook-calendar", "microsoft-outlook-calendar:create_event");
    expect(field(create, "startDateTime").required).toBe(true);
    expect(field(create, "endDateTime").required).toBe(true);
    const update = meta("microsoft-outlook-calendar", "microsoft-outlook-calendar:update_event");
    expect(field(update, "startDateTime").required).toBe(false);
  });
});

describe("sweep — Google Analytics custom-range date controls", () => {
  it("run_report startDate/endDate are date controls, still optional, keys unchanged", () => {
    const m = meta("google-analytics", "google-analytics:run_report");
    expect(field(m, "startDate").type).toBe("date");
    expect(field(m, "endDate").type).toBe("date");
    expect(field(m, "startDate").required).toBe(false);
    expect(ActionMetaSchema.safeParse(m).success).toBe(true);
  });
});

describe("sweep — Google Calendar colorId static enum", () => {
  it.each([
    "google-calendar:create_event",
    "google-calendar:update_event",
  ])("%s colorId is a static select of the 11 Google Calendar colors storing 1..11", (key) => {
    const m = meta("google-calendar", key);
    const colorId = field(m, "colorId");
    expect(colorId.type).toBe("select");
    expect(colorId.optionsSource).toBeUndefined(); // static, not a resolver
    const opts = colorId.options ?? [];
    expect(opts).toHaveLength(11);
    expect(opts.map((o) => o.value)).toEqual(
      ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"],
    );
    // Friendly labels, stable Google Calendar event color names.
    expect(opts[0]!.label).toMatch(/lavender/i);
    expect(opts[10]!.label).toMatch(/tomato/i);
    // Cosmetic, stays optional (no hidden default introduced).
    expect(colorId.required).toBe(false);
    expect(colorId.defaultValue).toBeUndefined();
    expect(ActionMetaSchema.safeParse(m).success).toBe(true);
  });
});

describe("sweep — Slack single-value user fields use the slack:users picker", () => {
  const expectUserPicker = (f: FieldMeta) => {
    expect(f.type).toBe("combobox");
    expect(f.optionsSource).toBe("slack:users");
    expect(f.allowManualEntry).toBe(true);
  };

  it.each([
    ["slack:send_direct_message", "userId", true],
    ["slack:get_user_info", "user", true],
    ["slack:remove_user_from_channel", "user", true],
  ] as const)("%s.%s is a slack:users combobox (required=%s, key unchanged)", (key, name, req) => {
    const m = meta("slack", key);
    const f = field(m, name);
    expectUserPicker(f);
    expect(f.required).toBe(req);
    expect(f.name).toBe(name); // stored config key unchanged → handler/schema intact
    expect(ActionMetaSchema.safeParse(m).success).toBe(true);
  });

  it("new_direct_message sender filter (trigger) is a slack:users combobox, still optional", () => {
    const t = listTriggerMetasForProvider("slack").find((x) => x.key === "slack:message.im");
    if (!t) throw new Error("slack:message.im trigger not found");
    const f = t.fields.find((x) => x.name === "withUserId");
    expect(f).toBeDefined();
    expectUserPicker(f!);
    expect(f!.required).toBe(false);
    expect(TriggerMetaSchema.safeParse(t).success).toBe(true);
  });

  it("invite_users_to_channel users is a per-chip slack:users picker (string-array shape unchanged)", () => {
    const invite = listActionMetasForProvider("slack").find(
      (x) => x.key === "slack:invite_users_to_channel",
    );
    if (!invite) throw new Error("invite_users_to_channel not found");
    const users = invite.fields.find((x) => x.name === "users");
    expect(users).toBeDefined();
    // Stays a multi-value chip input (string-array) — the picker is per-chip
    // (gmail labelIds pattern), NOT a single-select combobox conversion.
    expect(users!.type).toBe("string-array");
    expect(users!.optionsSource).toBe("slack:users");
    expect(users!.allowManualEntry).toBe(true); // paste / wire raw U-ids still works
    expect(users!.required).toBe(true);
    expect(users!.name).toBe("users"); // stored config key unchanged → handler intact
    expect(ActionMetaSchema.safeParse(invite).success).toBe(true);
  });
});

// ─── SWEEP-2 — Drive file pickers + Gmail labels per-chip picker ─────────────

describe("sweep-2 — Google Drive fileId fields use the google-drive:files picker", () => {
  it.each([
    "google-drive:delete_file",
    "google-drive:get_file_metadata",
    "google-drive:move_file",
  ])("%s fileId is a google-drive:files combobox with manual entry (key unchanged)", (key) => {
    const m = meta("google-drive", key);
    const f = field(m, "fileId");
    expect(f.type).toBe("combobox");
    expect(f.optionsSource).toBe("google-drive:files");
    expect(f.allowManualEntry).toBe(true);
    expect(f.name).toBe("fileId"); // stored config key unchanged → handler intact
    expect(ActionMetaSchema.safeParse(m).success).toBe(true);
  });
});

describe("sweep-2 — Gmail add_label labelIds is a per-chip label picker", () => {
  it("labelIds stays string-array but adds gmail:labels + manual entry (stores ids)", () => {
    const m = meta("gmail", "gmail:add_label");
    const f = field(m, "labelIds");
    expect(f.type).toBe("string-array"); // still an array — handler shape unchanged
    expect(f.optionsSource).toBe("gmail:labels");
    expect(f.allowManualEntry).toBe(true);
    expect(ActionMetaSchema.safeParse(m).success).toBe(true);
  });
});

// ─── SWEEP-3 — instant (datetime-utc) + location + HubSpot dealtype enum ──────

describe("sweep-3 — instant (datetime-utc) fields for offset/Z-requiring values", () => {
  it.each([
    ["slack", "slack:schedule_message", "postAt", true],
    ["mailchimp", "mailchimp:create_custom_event", "occurred_at", false],
    ["google-calendar", "google-calendar:list_events", "timeMin", false],
    ["google-calendar", "google-calendar:list_events", "timeMax", false],
    ["microsoft-outlook-calendar", "microsoft-outlook-calendar:list_events", "startDateTime", false],
    ["microsoft-outlook-calendar", "microsoft-outlook-calendar:list_events", "endDateTime", false],
    ["trello", "trello:create_card", "due", false],
    ["trello", "trello:create_card", "start", false],
    ["trello", "trello:update_card", "due", false],
    ["trello", "trello:update_card", "start", false],
    ["hubspot", "hubspot:create_meeting", "hs_meeting_start_time", false],
    ["hubspot", "hubspot:create_meeting", "hs_meeting_end_time", false],
    ["hubspot", "hubspot:create_meeting", "hs_timestamp", false],
    ["hubspot", "hubspot:create_call", "hs_timestamp", false],
    ["hubspot", "hubspot:create_note", "hs_timestamp", false],
    ["hubspot", "hubspot:create_task", "hs_timestamp", false],
  ] as const)("%s %s.%s is datetime-utc (key + required unchanged)", (provider, key, name, req) => {
    const m = meta(provider, key);
    const f = field(m, name);
    expect(f.type).toBe("datetime-utc");
    expect(f.name).toBe(name); // stored config key unchanged → handler/schema intact
    expect(f.required).toBe(req);
    expect(ActionMetaSchema.safeParse(m).success).toBe(true);
  });

  it("does NOT convert wall-clock calendar fields (create_event start/end stay plain datetime + separate timezone)", () => {
    const gc = meta("google-calendar", "google-calendar:create_event");
    expect(field(gc, "startDateTime").type).toBe("datetime"); // wall-clock, NOT instant
    expect(field(gc, "endDateTime").type).toBe("datetime");
    expect(field(gc, "timezone").type).toBe("timezone");
  });
});

describe("sweep-3 — location fields use the address autocomplete renderer", () => {
  it.each([
    ["google-calendar", "google-calendar:create_event", "location"],
    ["google-calendar", "google-calendar:update_event", "location"],
    ["microsoft-outlook-calendar", "microsoft-outlook-calendar:create_event", "location"],
    ["microsoft-outlook-calendar", "microsoft-outlook-calendar:update_event", "location"],
    ["hubspot", "hubspot:create_meeting", "hs_meeting_location"],
  ] as const)("%s %s.%s is a location field (stores a string, key unchanged)", (provider, key, name) => {
    const m = meta(provider, key);
    const f = field(m, name);
    expect(f.type).toBe("location");
    expect(f.name).toBe(name); // handler still reads the same string key
    expect(f.required).toBe(false);
    expect(ActionMetaSchema.safeParse(m).success).toBe(true);
  });
});

describe("sweep-3 — HubSpot deal `dealtype` uses the portal property-options resolver", () => {
  it.each(["hubspot:create_deal", "hubspot:update_deal"])(
    "%s dealtype is a hubspot:deal_dealtype combobox with manual entry (stores internal value)",
    (key) => {
      const m = meta("hubspot", key);
      const f = field(m, "dealtype");
      expect(f.type).toBe("combobox");
      expect(f.optionsSource).toBe("hubspot:deal_dealtype");
      expect(f.allowManualEntry).toBe(true); // custom portal values still settable
      expect(f.name).toBe("dealtype");
      expect(ActionMetaSchema.safeParse(m).success).toBe(true);
    },
  );
});

// ─── SWEEP-4 — Marcus-approved pre-launch scope adds (gcal/hubspot/slack) ─────

describe("sweep-4 — Google Calendar calendarId uses the google-calendar:calendars picker", () => {
  it.each([
    "google-calendar:create_event",
    "google-calendar:list_events",
    "google-calendar:update_event",
    "google-calendar:delete_event",
    "google-calendar:add_attendees",
  ])("%s calendarId is a combobox + manual entry, default 'primary' (key unchanged)", (key) => {
    const m = meta("google-calendar", key);
    const f = field(m, "calendarId");
    expect(f.type).toBe("combobox");
    expect(f.optionsSource).toBe("google-calendar:calendars");
    expect(f.allowManualEntry).toBe(true);
    expect(f.defaultValue).toBe("primary"); // stored value still the calendar id string
    expect(f.name).toBe("calendarId");
    expect(ActionMetaSchema.safeParse(m).success).toBe(true);
  });

  it("the event_changed trigger calendarId is the same picker", () => {
    const t = listTriggerMetasForProvider("google-calendar").find(
      (x) => x.key === "google-calendar:event_changed",
    );
    if (!t) throw new Error("google-calendar:event_changed not found");
    const f = t.fields.find((x) => x.name === "calendarId")!;
    expect(f.type).toBe("combobox");
    expect(f.optionsSource).toBe("google-calendar:calendars");
    expect(f.allowManualEntry).toBe(true);
    expect(TriggerMetaSchema.safeParse(t).success).toBe(true);
  });
});

describe("sweep-4 — HubSpot contacts/companies/tickets portal enum pickers", () => {
  it.each([
    ["hubspot:create_contact", "lifecyclestage", "hubspot:contact_lifecyclestage"],
    ["hubspot:update_contact", "lifecyclestage", "hubspot:contact_lifecyclestage"],
    ["hubspot:create_contact", "hs_lead_status", "hubspot:contact_lead_status"],
    ["hubspot:update_contact", "hs_lead_status", "hubspot:contact_lead_status"],
    ["hubspot:create_company", "lifecyclestage", "hubspot:company_lifecyclestage"],
    ["hubspot:update_company", "lifecyclestage", "hubspot:company_lifecyclestage"],
    ["hubspot:create_ticket", "hs_ticket_category", "hubspot:ticket_category"],
    ["hubspot:update_ticket", "hs_ticket_category", "hubspot:ticket_category"],
    ["hubspot:create_ticket", "source_type", "hubspot:ticket_source_type"],
    ["hubspot:update_ticket", "source_type", "hubspot:ticket_source_type"],
  ] as const)("%s %s is a %s combobox with manual entry (stores internal value)", (key, name, source) => {
    const m = meta("hubspot", key);
    const f = field(m, name);
    expect(f.type).toBe("combobox");
    expect(f.optionsSource).toBe(source);
    expect(f.allowManualEntry).toBe(true); // portal-custom values still settable
    expect(f.name).toBe(name);
    expect(ActionMetaSchema.safeParse(m).success).toBe(true);
  });
});

describe("sweep-4 — Slack group-DM trigger uses the slack:group_dms picker", () => {
  it("new_group_direct_message channelId is a slack:group_dms combobox with manual entry", () => {
    const t = listTriggerMetasForProvider("slack").find((x) => x.key === "slack:message.mpim");
    if (!t) throw new Error("slack:message.mpim trigger not found");
    const f = t.fields.find((x) => x.name === "channelId")!;
    expect(f.type).toBe("combobox");
    expect(f.optionsSource).toBe("slack:group_dms");
    expect(f.allowManualEntry).toBe(true);
    expect(f.sensitivity).toBe("recipient"); // preserved
    expect(TriggerMetaSchema.safeParse(t).success).toBe(true);
  });
});

// ─── BUILDER-QA-1 — GitHub repository picker (launch-QA sweep) ────────────────
// The `github:repos` resolver was registered but the action/trigger `repository`
// fields were still raw `owner/repo` text. Wired to the picker (stores the same
// `owner/repo` string; manual entry preserves the paste-it path).

describe("builder-qa-1 — GitHub repository fields use the github:repos picker", () => {
  it.each([
    "github:add_comment",
    "github:create_branch",
    "github:create_issue",
    "github:create_pull_request",
  ])("%s repository is a github:repos combobox with manual entry (stores owner/repo)", (key) => {
    const m = meta("github", key);
    const f = field(m, "repository");
    expect(f.type).toBe("combobox");
    expect(f.optionsSource).toBe("github:repos");
    expect(f.allowManualEntry).toBe(true);
    expect(f.required).toBe(true); // unchanged
    expect(f.name).toBe("repository"); // stored config key unchanged → handler intact
    expect(ActionMetaSchema.safeParse(m).success).toBe(true);
  });

  it("the new_commit trigger repository field is the same picker", () => {
    const t = listTriggerMetasForProvider("github").find((x) => x.key === "github:new_commit");
    if (!t) throw new Error("github:new_commit trigger not found");
    const f = t.fields.find((x) => x.name === "repository")!;
    expect(f.type).toBe("combobox");
    expect(f.optionsSource).toBe("github:repos");
    expect(f.allowManualEntry).toBe(true);
    expect(f.required).toBe(true);
    expect(TriggerMetaSchema.safeParse(t).success).toBe(true);
  });
});

// ─── SWEEP-5 — Group A (slack + eden) config-UX audit adoptions ───────────────
// Pagination/window plumbing → Advanced tab; visible defaults for invisible
// handler defaults; eden platform text→select (sibling-verified option set);
// eden since text→date. Metadata-only — stored config keys/value formats
// unchanged.

describe("sweep-5 — Slack history/window timestamp filters live in Advanced", () => {
  it.each([
    ["slack:get_messages", "oldest"],
    ["slack:get_messages", "latest"],
    ["slack:get_thread_messages", "oldest"],
    ["slack:get_thread_messages", "latest"],
    ["slack:list_scheduled_messages", "oldest"],
    ["slack:list_scheduled_messages", "latest"],
  ] as const)("%s.%s is advanced (still optional text, key unchanged)", (key, name) => {
    const m = meta("slack", key);
    const f = field(m, name);
    expect(f.advanced).toBe(true);
    expect(f.type).toBe("text"); // raw Slack ts format preserved
    expect(f.required).toBe(false);
    expect(ActionMetaSchema.safeParse(m).success).toBe(true);
  });
});

describe("sweep-5 — Slack list_channels surfaces its handler defaults visibly", () => {
  it("kind defaults to 'public' (mirrors handler default; value set unchanged)", () => {
    const m = meta("slack", "slack:list_channels");
    const kind = field(m, "kind");
    expect(kind.type).toBe("select");
    expect(kind.defaultValue).toBe("public");
    expect((kind.options ?? []).map((o) => o.value)).toEqual(["public", "private", "both"]);
    expect(ActionMetaSchema.safeParse(m).success).toBe(true);
  });
  it("excludeArchived defaults to true (mirrors handler default)", () => {
    const m = meta("slack", "slack:list_channels");
    const f = field(m, "excludeArchived");
    expect(f.type).toBe("boolean");
    expect(f.defaultValue).toBe(true);
  });
});

describe("sweep-5 — Eden pagination plumbing lives in Advanced", () => {
  it.each([
    ["eden:list_boards", "cursor"],
    ["eden:list_board_items", "cursor"],
    ["eden:list_notes", "cursor"],
    ["eden:search_items", "cursor"],
    ["eden:list_captures", "offset"],
    ["eden:list_highlights", "offset"],
    ["eden:list_highlights", "orderBy"],
  ] as const)("%s.%s is advanced (type/required/key unchanged)", (key, name) => {
    const m = meta("eden", key);
    const f = field(m, name);
    expect(f.advanced).toBe(true);
    expect(f.required).toBe(false);
    expect(f.name).toBe(name); // stored config key unchanged → handler intact
    expect(ActionMetaSchema.safeParse(m).success).toBe(true);
  });

  it("publish_post_now timezone is advanced (near-meaningless for publish-now); schedule_post keeps it in Setup (deferred metas)", () => {
    const publish = field(edenPublishPostNowMeta, "timezone");
    expect(publish.type).toBe("timezone");
    expect(publish.advanced).toBe(true);
    const schedule = field(edenSchedulePostMeta, "timezone");
    expect(schedule.advanced).toBeUndefined();
  });
});

describe("sweep-5 — Eden following_overview platform is a select matching the sibling creator actions", () => {
  it("platform options equal resolve_creator's option set exactly (same lowercase string values)", () => {
    const overview = field(meta("eden", "eden:following_overview"), "platform");
    const sibling = field(meta("eden", "eden:resolve_creator"), "platform");
    expect(overview.type).toBe("select");
    expect(overview.required).toBe(false); // empty = all platforms
    expect(overview.defaultValue).toBeUndefined();
    expect(overview.options).toEqual(sibling.options);
    expect((overview.options ?? []).map((o) => o.value)).toEqual([
      "youtube",
      "twitter",
      "tiktok",
      "instagram",
      "linkedin",
      "threads",
      "substack",
    ]);
    expect(ActionMetaSchema.safeParse(meta("eden", "eden:following_overview")).success).toBe(true);
  });
});

describe("sweep-5 — Eden research_creator since is a date control", () => {
  it("since is type date (commits a plain YYYY-MM-DD string; schema is z.string(), key unchanged)", () => {
    const m = meta("eden", "eden:research_creator");
    const f = field(m, "since");
    expect(f.type).toBe("date");
    expect(f.required).toBe(false);
    expect(f.name).toBe("since");
    expect(ActionMetaSchema.safeParse(m).success).toBe(true);
  });
});

describe("sweep-5 — required-advanced stays put where the audit accepted it", () => {
  it("slack post_interactive_blocks blocks stays a required advanced json field (Block Kit is genuinely raw)", () => {
    const m = meta("slack", "slack:post_interactive_blocks");
    const f = field(m, "blocks");
    expect(f.type).toBe("json");
    expect(f.advanced).toBe(true);
    expect(f.required).toBe(true);
  });
  it("eden scheduling idempotencyKey stays advanced with leave-empty copy", () => {
    const f = field(meta("eden", "eden:create_scheduling_draft"), "idempotencyKey");
    expect(f.advanced).toBe(true);
    expect(f.required).toBe(false);
    expect(f.description).toMatch(/leave empty/i);
  });
});
