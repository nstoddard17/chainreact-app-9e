/**
 * Config-UX sweep — Group G (google-calendar, google-drive,
 * google-analytics, facebook, discord, dropbox, github).
 *
 * Metadata-only adoptions proven here:
 *   - github create_issue labels/assignees: text → string-array (the old
 *     text fields committed a comma string the runtime z.array(z.string())
 *     schema rejected — runtime-broken; chips commit a real string[]).
 *   - github create_repository `private` REQUIRED with no default (Q11 —
 *     world-visibility switch); gitignore/license comboboxes keep manual
 *     entry so any GitHub catalog name still works.
 *   - facebook scheduledPublishTime / since / until → datetime-utc (the
 *     trailing-Z instant the `z.string().datetime({offset:true})` schemas
 *     accept); get_page_insights metric → combobox + manual entry.
 *   - facebook upload photo/video `published` surfaces the schema's
 *     silent `.default(true)` as meta defaultValue.
 *   - GA run_pivot_report startDate/endDate text → date (parity with
 *     run_report); both reports gate the custom-range dates on
 *     dateRange === "custom" via visibleWhen.
 *   - gcal create_event date-vs-datetime pairs gated on allDay via
 *     valueTruthy (runtime superRefine is an allDay-keyed XOR).
 *   - discord delete_message messageIds/userIds wire the EXISTING
 *     discord:messages / discord:members resolvers (string-array
 *     optionsSource is contract-valid since SWEEP-2).
 *   - discord fetch_messages filter trio gated on filterType.
 *   - pagination cursors (gcal/gdrive pageToken, dropbox cursor) and
 *     tuning knobs moved to Advanced.
 *   - dropbox mode/autorename defaults surfaced from the schemas.
 *
 * Every touched meta must still parse against its contract schema, and
 * stored config KEYS and value shapes are unchanged (except the github
 * string-array fix, which repairs an already-broken shape).
 */
import {
  ActionMetaSchema,
  isVisibleWhenMet,
  type ActionMeta,
  type FieldMeta,
} from "@/contracts/actionMeta";
import { TriggerMetaSchema } from "@/contracts/triggerMeta";
import {
  getActionMeta,
  getTriggerMeta,
} from "@/services/discovery/_registry";

import { CreateIssueConfigSchema } from "@/integrations/github/actions/createIssue.schema";
import { CreateRepositoryConfigSchema } from "@/integrations/github/actions/createRepository.schema";
import { CreatePostConfigSchema } from "@/integrations/facebook/actions/createPost.schema";
import { GetPageInsightsConfigSchema } from "@/integrations/facebook/actions/getPageInsights.schema";
import { UploadPhotoConfigSchema } from "@/integrations/facebook/actions/uploadPhoto.schema";
import { UploadVideoConfigSchema } from "@/integrations/facebook/actions/uploadVideo.schema";
import { RunReportConfigSchema } from "@/integrations/google-analytics/actions/runReport.schema";
import { RunPivotReportConfigSchema } from "@/integrations/google-analytics/actions/runPivotReport.schema";
import { CreateEventConfigSchema } from "@/integrations/google-calendar/actions/createEvent.schema";
import { UploadFileConfigSchema as DropboxUploadFileConfigSchema } from "@/integrations/dropbox/actions/uploadFile.schema";

function meta(key: string): ActionMeta {
  const m = getActionMeta(key);
  if (!m) throw new Error(`meta not found: ${key}`);
  return m;
}
function field(m: { fields: readonly FieldMeta[] }, name: string): FieldMeta {
  const f = m.fields.find((x) => x.name === name);
  if (!f) throw new Error(`field not found: ${name}`);
  return f;
}

describe("sweep G — github create_issue labels/assignees are string-array (runtime-broken text fixed)", () => {
  const m = meta("github:create_issue");

  it.each(["labels", "assignees"])("%s is a string-array chip field", (name) => {
    const f = field(m, name);
    expect(f.type).toBe("string-array");
    expect(f.required).toBe(false);
  });

  it("a chips-committed string[] parses against the runtime schema (the old comma string did not)", () => {
    const good = CreateIssueConfigSchema.safeParse({
      repository: "octocat/hello-world",
      title: "t",
      labels: ["bug", "priority-high"],
      assignees: ["octocat", "hubot"],
    });
    expect(good.success).toBe(true);
    // The shape the old text field committed — proves the break was real.
    const broken = CreateIssueConfigSchema.safeParse({
      repository: "octocat/hello-world",
      title: "t",
      labels: "bug, priority-high",
    });
    expect(broken.success).toBe(false);
  });

  it("meta still parses", () => {
    expect(ActionMetaSchema.safeParse(m).success).toBe(true);
  });
});

describe("sweep G — github create_repository", () => {
  const m = meta("github:create_repository");

  it("`private` is required with NO defaultValue (explicit world-visibility choice, Q11)", () => {
    const f = field(m, "private");
    expect(f.type).toBe("boolean");
    expect(f.required).toBe(true);
    expect(f.defaultValue).toBeUndefined();
    // Runtime schema keeps it optional — existing runs unaffected.
    expect(
      CreateRepositoryConfigSchema.safeParse({ name: "repo" }).success,
    ).toBe(true);
  });

  it.each([
    ["gitignore_template", ["Node", "Python", "Go"]],
    ["license_template", ["mit", "apache-2.0"]],
  ] as const)("%s is a combobox with manual entry; each option value passes the runtime schema", (name, values) => {
    const f = field(m, name);
    expect(f.type).toBe("combobox");
    expect(f.allowManualEntry).toBe(true);
    expect(f.options?.map((o) => o.value)).toEqual(values);
    for (const v of values) {
      expect(
        CreateRepositoryConfigSchema.safeParse({
          name: "repo",
          private: true,
          [name]: v,
        }).success,
      ).toBe(true);
    }
  });

  it("meta still parses", () => {
    expect(ActionMetaSchema.safeParse(m).success).toBe(true);
  });
});

describe("sweep G — facebook temporal + metric + published", () => {
  it("create_post scheduledPublishTime is datetime-utc; the committed Z-instant parses", () => {
    const f = field(meta("facebook:create_post"), "scheduledPublishTime");
    expect(f.type).toBe("datetime-utc");
    expect(
      CreatePostConfigSchema.safeParse({
        pageId: "p",
        message: "m",
        scheduledPublishTime: "2026-06-01T09:00:00Z",
      }).success,
    ).toBe(true);
  });

  it("get_page_insights since/until are datetime-utc; Z-instants parse", () => {
    const m = meta("facebook:get_page_insights");
    expect(field(m, "since").type).toBe("datetime-utc");
    expect(field(m, "until").type).toBe("datetime-utc");
    expect(
      GetPageInsightsConfigSchema.safeParse({
        pageId: "p",
        metric: "page_post_engagements",
        since: "2026-05-01T00:00:00Z",
        until: "2026-05-31T00:00:00Z",
      }).success,
    ).toBe(true);
  });

  it("get_page_insights metric is a required combobox (in-repo-verified options) with manual entry; typed CSV still parses", () => {
    const f = field(meta("facebook:get_page_insights"), "metric");
    expect(f.type).toBe("combobox");
    expect(f.required).toBe(true);
    expect(f.allowManualEntry).toBe(true);
    expect(f.options?.map((o) => o.value)).toEqual([
      "page_post_engagements",
      "page_views_total",
    ]);
    // Manual comma-separated entry keeps multi-metric capability.
    expect(
      GetPageInsightsConfigSchema.safeParse({
        pageId: "p",
        metric: "page_post_engagements,page_views_total",
      }).success,
    ).toBe(true);
  });

  it("upload_photo / upload_video `published` surface the schema's default(true)", () => {
    expect(field(meta("facebook:upload_photo"), "published").defaultValue).toBe(true);
    expect(field(meta("facebook:upload_video"), "published").defaultValue).toBe(true);
    // Honest mirror of the runtime default — omitting still publishes.
    const fileRef = {
      kind: "v2_storage",
      name: "a.png",
      mimeType: "image/png",
      storagePath: "u/wf/run/node/a.png",
    };
    expect(UploadPhotoConfigSchema.parse({ pageId: "p", photo: fileRef }).published).toBe(true);
    expect(UploadVideoConfigSchema.parse({ pageId: "p", video: fileRef }).published).toBe(true);
  });

  it.each(["facebook:create_post", "facebook:get_page_insights", "facebook:upload_photo", "facebook:upload_video"])(
    "%s meta still parses",
    (key) => {
      expect(ActionMetaSchema.safeParse(meta(key)).success).toBe(true);
    },
  );
});

describe("sweep G — GA custom-range dates (run_report + run_pivot_report)", () => {
  it.each(["google-analytics:run_report", "google-analytics:run_pivot_report"])(
    "%s startDate/endDate are date controls gated on dateRange=custom",
    (key) => {
      const m = meta(key);
      for (const name of ["startDate", "endDate"]) {
        const f = field(m, name);
        expect(f.type).toBe("date");
        expect(f.required).toBe(false);
        expect(f.visibleWhen).toEqual({ field: "dateRange", valueIn: ["custom"] });
      }
      // The controller value is a real option on the sibling select.
      const dr = field(m, "dateRange");
      expect(dr.options?.map((o) => o.value)).toContain("custom");
      // Controller has no visibleWhen itself (no chains).
      expect(dr.visibleWhen).toBeUndefined();
      expect(ActionMetaSchema.safeParse(m).success).toBe(true);
    },
  );

  it("visibility semantics: dates hidden on presets, shown on custom", () => {
    const f = field(meta("google-analytics:run_pivot_report"), "startDate");
    expect(isVisibleWhenMet(f.visibleWhen, { dateRange: "last_7_days" })).toBe(false);
    expect(isVisibleWhenMet(f.visibleWhen, { dateRange: "custom" })).toBe(true);
  });

  it("pivot report: a date-control YYYY-MM-DD custom range parses (same string the text field carried)", () => {
    expect(
      RunPivotReportConfigSchema.safeParse({
        propertyId: "1",
        dateRange: "custom",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        metrics: ["sessions"],
      }).success,
    ).toBe(true);
    expect(
      RunReportConfigSchema.safeParse({
        propertyId: "1",
        dateRange: "custom",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        metrics: ["sessions"],
      }).success,
    ).toBe(true);
  });
});

describe("sweep G — gcal create_event allDay-gated date/datetime pairs", () => {
  const m = meta("google-calendar:create_event");

  it("timed pair visible while allDay is NOT true (incl. unset — meta default false)", () => {
    for (const name of ["startDateTime", "endDateTime"]) {
      const f = field(m, name);
      expect(f.visibleWhen).toEqual({ field: "allDay", valueTruthy: false });
      expect(isVisibleWhenMet(f.visibleWhen, {})).toBe(true);
      expect(isVisibleWhenMet(f.visibleWhen, { allDay: false })).toBe(true);
      expect(isVisibleWhenMet(f.visibleWhen, { allDay: true })).toBe(false);
    }
  });

  it("all-day pair visible only while allDay is true", () => {
    for (const name of ["startDate", "endDate"]) {
      const f = field(m, name);
      expect(f.visibleWhen).toEqual({ field: "allDay", valueTruthy: true });
      expect(isVisibleWhenMet(f.visibleWhen, { allDay: true })).toBe(true);
      expect(isVisibleWhenMet(f.visibleWhen, {})).toBe(false);
    }
  });

  it("both runtime shapes still parse (the superRefine XOR is keyed on allDay)", () => {
    const base = {
      summary: "s",
      sendNotifications: "none",
      guestsCanInviteOthers: false,
      guestsCanSeeOtherGuests: true,
    };
    expect(
      CreateEventConfigSchema.safeParse({
        ...base,
        allDay: false,
        startDateTime: "2026-06-01T09:00:00",
        endDateTime: "2026-06-01T10:00:00",
      }).success,
    ).toBe(true);
    expect(
      CreateEventConfigSchema.safeParse({
        ...base,
        allDay: true,
        startDate: "2026-06-01",
        endDate: "2026-06-02",
      }).success,
    ).toBe(true);
  });

  it("meta still parses (controller allDay has no visibleWhen)", () => {
    expect(field(m, "allDay").visibleWhen).toBeUndefined();
    expect(ActionMetaSchema.safeParse(m).success).toBe(true);
  });
});

describe("sweep G — discord delete_message pickers + fetch_messages filter trio", () => {
  it("delete_message messageIds/userIds wire the existing resolvers on string-array with manual entry", () => {
    const m = meta("discord:delete_message");
    const messageIds = field(m, "messageIds");
    expect(messageIds.type).toBe("string-array");
    expect(messageIds.optionsSource).toBe("discord:messages");
    expect(messageIds.dependsOn).toBe("channelId");
    expect(messageIds.allowManualEntry).toBe(true);
    const userIds = field(m, "userIds");
    expect(userIds.type).toBe("string-array");
    expect(userIds.optionsSource).toBe("discord:members");
    expect(userIds.dependsOn).toBe("guildId");
    expect(userIds.allowManualEntry).toBe(true);
    expect(ActionMetaSchema.safeParse(m).success).toBe(true);
  });

  it("fetch_messages: filterAuthor gated on filterType=author; filterContent + caseSensitive on filterType=content", () => {
    const m = meta("discord:fetch_messages");
    expect(field(m, "filterAuthor").visibleWhen).toEqual({
      field: "filterType",
      valueIn: ["author"],
    });
    for (const name of ["filterContent", "caseSensitive"]) {
      expect(field(m, name).visibleWhen).toEqual({
        field: "filterType",
        valueIn: ["content"],
      });
    }
    // Gate values are REAL option values of the controller select.
    const filterType = field(m, "filterType");
    const values = filterType.options?.map((o) => o.value) ?? [];
    expect(values).toEqual(expect.arrayContaining(["author", "content"]));
    expect(filterType.visibleWhen).toBeUndefined();
    expect(ActionMetaSchema.safeParse(m).success).toBe(true);
  });
});

describe("sweep G — pagination cursors + tuning knobs moved to Advanced", () => {
  it.each([
    ["google-calendar:list_events", "pageToken"],
    ["google-drive:list_files", "pageToken"],
    ["google-drive:search_files", "pageToken"],
    ["dropbox:list_folder", "cursor"],
    ["google-drive:upload_file", "contentEncoding"],
    ["google-analytics:send_event", "userId"],
    ["google-analytics:create_conversion_event", "customEvent"],
  ])("%s.%s is advanced (and never required-without-default)", (key, name) => {
    const f = field(meta(key), name);
    expect(f.advanced).toBe(true);
    expect(f.required === true && f.defaultValue === undefined).toBe(false);
    expect(ActionMetaSchema.safeParse(meta(key)).success).toBe(true);
  });

  it("google-drive:file_changed trigger folderId post-fetch filter is advanced", () => {
    const t = getTriggerMeta("google-drive:file_changed")!;
    const f = field(t, "folderId");
    expect(f.advanced).toBe(true);
    expect(f.required).toBe(false);
    expect(TriggerMetaSchema.safeParse(t).success).toBe(true);
  });
});

describe("sweep G — google-drive upload_file mimeType combobox", () => {
  it("mimeType is a required combobox with common types + manual entry; option values are real MIME strings", () => {
    const f = field(meta("google-drive:upload_file"), "mimeType");
    expect(f.type).toBe("combobox");
    expect(f.required).toBe(true);
    expect(f.allowManualEntry).toBe(true);
    const values = f.options?.map((o) => o.value) ?? [];
    expect(values).toEqual(expect.arrayContaining(["application/pdf", "text/plain"]));
    // Every option is a syntactically valid type/subtype MIME string.
    for (const v of values) {
      expect(typeof v === "string" && /^[\w.+-]+\/[\w.+-]+$/.test(v)).toBe(true);
    }
    expect(ActionMetaSchema.safeParse(meta("google-drive:upload_file")).success).toBe(true);
  });
});

describe("sweep G — dropbox schema defaults surfaced in meta", () => {
  it("upload_file mode/autorename mirror the runtime defaults", () => {
    const m = meta("dropbox:upload_file");
    expect(field(m, "mode").defaultValue).toBe("add");
    expect(field(m, "autorename").defaultValue).toBe(false);
    const parsed = DropboxUploadFileConfigSchema.parse({
      file: {
        kind: "v2_storage",
        name: "a.txt",
        mimeType: "text/plain",
        storagePath: "u/wf/run/node/a.txt",
      },
    });
    expect(parsed.mode).toBe("add");
    expect(parsed.autorename).toBe(false);
  });

  it.each(["dropbox:create_folder", "dropbox:move_file", "dropbox:copy_file"])(
    "%s autorename surfaces default(false)",
    (key) => {
      expect(field(meta(key), "autorename").defaultValue).toBe(false);
      expect(ActionMetaSchema.safeParse(meta(key)).success).toBe(true);
    },
  );
});

describe("sweep G — every remaining touched meta still parses", () => {
  it.each([
    "github:create_issue",
    "github:create_repository",
    "discord:send_message",
    "discord:edit_message",
    "discord:assign_role",
    "google-analytics:run_report",
    "google-analytics:run_pivot_report",
    "google-analytics:get_realtime_data",
    "google-analytics:send_event",
    "google-calendar:list_events",
    "dropbox:upload_file",
    "dropbox:list_folder",
    "dropbox:download_file",
    "dropbox:get_file_metadata",
    "dropbox:create_shared_link",
    "dropbox:get_temporary_link",
    "dropbox:delete_file",
  ])("%s parses against ActionMetaSchema", (key) => {
    expect(ActionMetaSchema.safeParse(meta(key)).success).toBe(true);
  });

  it("discord:new_message trigger meta parses", () => {
    expect(TriggerMetaSchema.safeParse(getTriggerMeta("discord:new_message")!).success).toBe(true);
  });
});
