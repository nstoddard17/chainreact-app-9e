/**
 * Tests for `services/options/_registry.ts` — Slice 3.30 foundation.
 *
 * Pin:
 *   - Lookup by source key works for the registered fixture.
 *   - Unknown source returns `undefined`.
 *   - The exported `listOptionsResolvers()` is deterministic
 *     (sorted by source).
 *   - Every registered resolver matches the `<provider>:<resource>`
 *     regex (the registry validates this at module load — this test
 *     codifies the contract from outside).
 *
 * Duplicate-key + bad-key-format guards live inside the IIFE at
 * module load (`new Map.has(...)` + regex check), so they fire BEFORE
 * any test gets to run. Direct tests of those guard branches would
 * require module-load swaps; the structural cost outweighs the value
 * of an explicit "throws on duplicate" test. The behavior is
 * regression-asserted indirectly: if someone registers a malformed
 * source, the build fails everywhere this module is imported.
 */
import {
  getOptionsResolver,
  listOptionsResolvers,
} from "@/services/options/_registry";
import { OPTIONS_SOURCE_KEY_REGEX } from "@/services/options/types";

describe("options resolver registry", () => {
  it("getOptionsResolver resolves the native:examples fixture", () => {
    const r = getOptionsResolver("native:examples");
    expect(r).toBeDefined();
    expect(r?.source).toBe("native:examples");
    expect(r?.provider).toBe("native");
    expect(r?.requiresIntegration).toBe(false);
    expect(r?.requiredDeps).toEqual(["category"]);
  });

  it("getOptionsResolver resolves the slack:channels resolver (Slice 3.32)", () => {
    const r = getOptionsResolver("slack:channels");
    expect(r).toBeDefined();
    expect(r?.source).toBe("slack:channels");
    expect(r?.provider).toBe("slack");
    expect(r?.requiresIntegration).toBe(true);
    expect(r?.requiredDeps).toBeUndefined();
  });

  it("getOptionsResolver resolves the google-sheets:spreadsheets resolver (Slice 3.GSHEETS-2)", () => {
    const r = getOptionsResolver("google-sheets:spreadsheets");
    expect(r).toBeDefined();
    expect(r?.source).toBe("google-sheets:spreadsheets");
    expect(r?.provider).toBe("google-sheets");
    expect(r?.requiresIntegration).toBe(true);
    // Top-level picker — no deps.
    expect(r?.requiredDeps).toBeUndefined();
  });

  it("getOptionsResolver resolves the google-sheets:sheets resolver (Slice 3.GSHEETS-2)", () => {
    const r = getOptionsResolver("google-sheets:sheets");
    expect(r).toBeDefined();
    expect(r?.source).toBe("google-sheets:sheets");
    expect(r?.provider).toBe("google-sheets");
    expect(r?.requiresIntegration).toBe(true);
    // Two-hop cascade — sheets are scoped to a parent spreadsheet.
    expect(r?.requiredDeps).toEqual(["spreadsheetId"]);
  });

  describe("HubSpot resolvers (Slice 3.HUBSPOT-2)", () => {
    it("getOptionsResolver resolves hubspot:owners", () => {
      const r = getOptionsResolver("hubspot:owners");
      expect(r).toBeDefined();
      expect(r?.source).toBe("hubspot:owners");
      expect(r?.provider).toBe("hubspot");
      expect(r?.requiresIntegration).toBe(true);
      expect(r?.requiredDeps).toBeUndefined();
    });

    it("getOptionsResolver resolves hubspot:deal_pipelines (no deps)", () => {
      const r = getOptionsResolver("hubspot:deal_pipelines");
      expect(r).toBeDefined();
      expect(r?.provider).toBe("hubspot");
      expect(r?.requiresIntegration).toBe(true);
      expect(r?.requiredDeps).toBeUndefined();
    });

    it("getOptionsResolver resolves hubspot:deal_stages (dependsOn pipeline)", () => {
      const r = getOptionsResolver("hubspot:deal_stages");
      expect(r).toBeDefined();
      expect(r?.provider).toBe("hubspot");
      expect(r?.requiresIntegration).toBe(true);
      expect(r?.requiredDeps).toEqual(["pipeline"]);
    });

    it("getOptionsResolver resolves hubspot:ticket_pipelines (no deps)", () => {
      const r = getOptionsResolver("hubspot:ticket_pipelines");
      expect(r).toBeDefined();
      expect(r?.provider).toBe("hubspot");
      expect(r?.requiresIntegration).toBe(true);
      expect(r?.requiredDeps).toBeUndefined();
    });

    it("getOptionsResolver resolves hubspot:ticket_stages (dependsOn hs_pipeline — schema-anchored field name)", () => {
      const r = getOptionsResolver("hubspot:ticket_stages");
      expect(r).toBeDefined();
      expect(r?.provider).toBe("hubspot");
      expect(r?.requiresIntegration).toBe(true);
      // hs_pipeline matches the createTicket / updateTicket schema field
      // name. Deal-stages uses `pipeline` (no `hs_` prefix) because the
      // deal schema uses a different field name. Pinned here so the
      // cascade wiring stays correctly parented across providers.
      expect(r?.requiredDeps).toEqual(["hs_pipeline"]);
    });

    it("getOptionsResolver resolves hubspot:lists (stretch)", () => {
      const r = getOptionsResolver("hubspot:lists");
      expect(r).toBeDefined();
      expect(r?.provider).toBe("hubspot");
      expect(r?.requiresIntegration).toBe(true);
      expect(r?.requiredDeps).toBeUndefined();
    });

    it("getOptionsResolver resolves hubspot:deal_dealtype (portal property-options, deals only)", () => {
      const r = getOptionsResolver("hubspot:deal_dealtype");
      expect(r).toBeDefined();
      expect(r?.provider).toBe("hubspot");
      expect(r?.requiresIntegration).toBe(true);
      expect(r?.requiredDeps).toBeUndefined();
    });
  });

  describe("Mailchimp resolvers (Slice 3.MAILCHIMP-2)", () => {
    it("getOptionsResolver resolves mailchimp:audiences (no deps)", () => {
      const r = getOptionsResolver("mailchimp:audiences");
      expect(r).toBeDefined();
      expect(r?.source).toBe("mailchimp:audiences");
      expect(r?.provider).toBe("mailchimp");
      expect(r?.requiresIntegration).toBe(true);
      expect(r?.requiredDeps).toBeUndefined();
    });

    it("getOptionsResolver resolves mailchimp:campaigns (no deps)", () => {
      const r = getOptionsResolver("mailchimp:campaigns");
      expect(r).toBeDefined();
      expect(r?.source).toBe("mailchimp:campaigns");
      expect(r?.provider).toBe("mailchimp");
      expect(r?.requiresIntegration).toBe(true);
      expect(r?.requiredDeps).toBeUndefined();
    });

    it("getOptionsResolver resolves mailchimp:segments (dependsOn listId — matches segmentUpdated + subscriberAddedToSegment trigger schemas)", () => {
      const r = getOptionsResolver("mailchimp:segments");
      expect(r).toBeDefined();
      expect(r?.source).toBe("mailchimp:segments");
      expect(r?.provider).toBe("mailchimp");
      expect(r?.requiresIntegration).toBe(true);
      // `listId` matches the two existing consumer trigger schemas
      // (segment_updated, subscriber_added_to_segment). Future
      // segment-selecting actions that use `audience_id` as the parent
      // field name would need a sibling resolver — deferred to
      // MAILCHIMP-3+ when meta wiring lands.
      expect(r?.requiredDeps).toEqual(["listId"]);
    });
  });

  describe("Google Docs + Drive resolvers (Slice 3.GDOCS-3)", () => {
    it("getOptionsResolver resolves google-docs:documents (no deps)", () => {
      const r = getOptionsResolver("google-docs:documents");
      expect(r).toBeDefined();
      expect(r?.source).toBe("google-docs:documents");
      expect(r?.provider).toBe("google-docs");
      expect(r?.requiresIntegration).toBe(true);
      // Account-scoped picker; no parent field.
      expect(r?.requiredDeps).toBeUndefined();
    });

    it("getOptionsResolver resolves google-drive:folders (no deps, cross-product)", () => {
      const r = getOptionsResolver("google-drive:folders");
      expect(r).toBeDefined();
      expect(r?.source).toBe("google-drive:folders");
      // Intentionally lives under google-drive (not google-docs) so
      // future Google Workspace metadata surfaces (Drive's own
      // actions, Sheets / Docs / Slides create-into-folder pickers)
      // can reuse the same resolver key.
      expect(r?.provider).toBe("google-drive");
      expect(r?.requiresIntegration).toBe(true);
      expect(r?.requiredDeps).toBeUndefined();
    });

    it("getOptionsResolver resolves google-drive:files (CONFIG-FIELD-UX-SWEEP-2, no deps)", () => {
      const r = getOptionsResolver("google-drive:files");
      expect(r).toBeDefined();
      expect(r?.source).toBe("google-drive:files");
      expect(r?.provider).toBe("google-drive");
      expect(r?.requiresIntegration).toBe(true);
      expect(r?.requiredDeps).toBeUndefined();
    });
  });

  describe("Microsoft OneNote resolvers (Slice 3.ONENOTE-3)", () => {
    it("getOptionsResolver resolves microsoft-onenote:notebooks (no deps)", () => {
      const r = getOptionsResolver("microsoft-onenote:notebooks");
      expect(r).toBeDefined();
      expect(r?.source).toBe("microsoft-onenote:notebooks");
      expect(r?.provider).toBe("microsoft-onenote");
      expect(r?.requiresIntegration).toBe(true);
      // Account-scoped picker; no parent field.
      expect(r?.requiredDeps).toBeUndefined();
    });

    it("getOptionsResolver resolves microsoft-onenote:sections (dependsOn notebookId — camelCase, V1-preserved)", () => {
      const r = getOptionsResolver("microsoft-onenote:sections");
      expect(r).toBeDefined();
      expect(r?.source).toBe("microsoft-onenote:sections");
      expect(r?.provider).toBe("microsoft-onenote");
      expect(r?.requiresIntegration).toBe(true);
      // `notebookId` matches the ONENOTE-2 schema field names verbatim
      // (camelCase, NOT snake_case). Pinned here so the cascade wiring
      // stays correctly parented when ONENOTE-4 action metas land.
      expect(r?.requiredDeps).toEqual(["notebookId"]);
    });

    it("getOptionsResolver resolves microsoft-onenote:pages (dependsOn sectionId — camelCase, V1-preserved)", () => {
      const r = getOptionsResolver("microsoft-onenote:pages");
      expect(r).toBeDefined();
      expect(r?.source).toBe("microsoft-onenote:pages");
      expect(r?.provider).toBe("microsoft-onenote");
      expect(r?.requiresIntegration).toBe(true);
      // `sectionId` matches the ONENOTE-2 schema field names verbatim.
      expect(r?.requiredDeps).toEqual(["sectionId"]);
    });
  });

  describe("Monday.com resolvers (Slice 3.MONDAY-3)", () => {
    it("getOptionsResolver resolves monday:boards (account-scoped, no deps)", () => {
      const r = getOptionsResolver("monday:boards");
      expect(r).toBeDefined();
      expect(r?.source).toBe("monday:boards");
      expect(r?.provider).toBe("monday");
      expect(r?.requiresIntegration).toBe(true);
      expect(r?.requiredDeps).toBeUndefined();
    });

    it("getOptionsResolver resolves monday:groups (dependsOn boardId — camelCase, V1-preserved)", () => {
      const r = getOptionsResolver("monday:groups");
      expect(r).toBeDefined();
      expect(r?.source).toBe("monday:groups");
      expect(r?.provider).toBe("monday");
      expect(r?.requiresIntegration).toBe(true);
      // `boardId` matches the MONDAY-2 schema field names verbatim
      // (camelCase, NOT snake_case `board_id`).
      expect(r?.requiredDeps).toEqual(["boardId"]);
    });

    it("getOptionsResolver resolves monday:columns (dependsOn boardId)", () => {
      const r = getOptionsResolver("monday:columns");
      expect(r).toBeDefined();
      expect(r?.source).toBe("monday:columns");
      expect(r?.provider).toBe("monday");
      expect(r?.requiresIntegration).toBe(true);
      expect(r?.requiredDeps).toEqual(["boardId"]);
    });

    it("getOptionsResolver resolves monday:items (dependsOn boardId)", () => {
      const r = getOptionsResolver("monday:items");
      expect(r).toBeDefined();
      expect(r?.source).toBe("monday:items");
      expect(r?.provider).toBe("monday");
      expect(r?.requiresIntegration).toBe(true);
      expect(r?.requiredDeps).toEqual(["boardId"]);
    });

    it("getOptionsResolver resolves monday:file_columns (dependsOn boardId)", () => {
      const r = getOptionsResolver("monday:file_columns");
      expect(r).toBeDefined();
      expect(r?.source).toBe("monday:file_columns");
      expect(r?.provider).toBe("monday");
      expect(r?.requiresIntegration).toBe(true);
      expect(r?.requiredDeps).toEqual(["boardId"]);
    });

    it("getOptionsResolver resolves monday:users (account-scoped, no deps)", () => {
      const r = getOptionsResolver("monday:users");
      expect(r).toBeDefined();
      expect(r?.source).toBe("monday:users");
      expect(r?.provider).toBe("monday");
      expect(r?.requiresIntegration).toBe(true);
      expect(r?.requiredDeps).toBeUndefined();
    });

    it("getOptionsResolver resolves monday:item_files (MONDAY-5; dependsOn itemId + columnId)", () => {
      const r = getOptionsResolver("monday:item_files");
      expect(r).toBeDefined();
      expect(r?.source).toBe("monday:item_files");
      expect(r?.provider).toBe("monday");
      expect(r?.requiresIntegration).toBe(true);
      // Two-dep cascade matching download_file's asset resolution.
      expect(r?.requiredDeps).toEqual(["itemId", "columnId"]);
    });

    it("registers all 7 Monday resolver keys (6 from MONDAY-3 + item_files from MONDAY-5)", () => {
      const mondaySources = listOptionsResolvers()
        .filter((r) => r.provider === "monday")
        .map((r) => r.source)
        .sort();
      expect(mondaySources).toEqual([
        "monday:boards",
        "monday:columns",
        "monday:file_columns",
        "monday:groups",
        "monday:item_files",
        "monday:items",
        "monday:users",
      ]);
    });
  });

  describe("Dropbox resolvers (Slice 3.DROPBOX-3)", () => {
    it("getOptionsResolver resolves dropbox:folders (account-scoped, no deps)", () => {
      const r = getOptionsResolver("dropbox:folders");
      expect(r).toBeDefined();
      expect(r?.source).toBe("dropbox:folders");
      expect(r?.provider).toBe("dropbox");
      expect(r?.requiresIntegration).toBe(true);
      expect(r?.requiredDeps).toBeUndefined();
    });

    it("getOptionsResolver resolves dropbox:files (dependsOn folderPath — Dropbox is path-based, no synthetic folderId)", () => {
      const r = getOptionsResolver("dropbox:files");
      expect(r).toBeDefined();
      expect(r?.source).toBe("dropbox:files");
      expect(r?.provider).toBe("dropbox");
      expect(r?.requiresIntegration).toBe(true);
      // Dep VALUE is the parent FOLDER path (D-DB6 path-as-value); NOT a
      // synthetic folderId. Dep NAME is `folderPath` (not `path`) so it
      // doesn't collide with the leaf file field `path`/`fromPath` on the
      // DROPBOX-4 action metas — the builder keys deps by parent field
      // name, so the folder picker must have a distinct name to cascade.
      expect(r?.requiredDeps).toEqual(["folderPath"]);
    });

    it("registers exactly the 2 Dropbox resolver keys", () => {
      const dropboxSources = listOptionsResolvers()
        .filter((r) => r.provider === "dropbox")
        .map((r) => r.source)
        .sort();
      expect(dropboxSources).toEqual(["dropbox:files", "dropbox:folders"]);
    });
  });

  describe("Facebook resolvers (Slice 3.FACEBOOK-3)", () => {
    it("getOptionsResolver resolves facebook:pages (account-scoped, no deps)", () => {
      const r = getOptionsResolver("facebook:pages");
      expect(r).toBeDefined();
      expect(r?.source).toBe("facebook:pages");
      expect(r?.provider).toBe("facebook");
      expect(r?.requiresIntegration).toBe(true);
      // The cascade root every Facebook action's pageId hangs off.
      expect(r?.requiredDeps).toBeUndefined();
    });

    it("getOptionsResolver resolves facebook:posts (dependsOn pageId — verbatim)", () => {
      const r = getOptionsResolver("facebook:posts");
      expect(r).toBeDefined();
      expect(r?.source).toBe("facebook:posts");
      expect(r?.provider).toBe("facebook");
      expect(r?.requiresIntegration).toBe(true);
      // `pageId` matches the FACEBOOK-2 Zod schemas verbatim (NOT snake_case).
      expect(r?.requiredDeps).toEqual(["pageId"]);
    });

    it("getOptionsResolver resolves facebook:albums (dependsOn pageId)", () => {
      const r = getOptionsResolver("facebook:albums");
      expect(r).toBeDefined();
      expect(r?.source).toBe("facebook:albums");
      expect(r?.provider).toBe("facebook");
      expect(r?.requiresIntegration).toBe(true);
      expect(r?.requiredDeps).toEqual(["pageId"]);
    });

    it("getOptionsResolver resolves facebook:conversations (dependsOn pageId)", () => {
      const r = getOptionsResolver("facebook:conversations");
      expect(r).toBeDefined();
      expect(r?.source).toBe("facebook:conversations");
      expect(r?.provider).toBe("facebook");
      expect(r?.requiresIntegration).toBe(true);
      expect(r?.requiredDeps).toEqual(["pageId"]);
    });

    it("registers exactly the 4 accepted Facebook resolver keys", () => {
      const facebookSources = listOptionsResolvers()
        .filter((r) => r.provider === "facebook")
        .map((r) => r.source)
        .sort();
      expect(facebookSources).toEqual([
        "facebook:albums",
        "facebook:conversations",
        "facebook:pages",
        "facebook:posts",
      ]);
    });

    it("does NOT register the rejected V1 Facebook resolver keys", () => {
      // facebook_groups (no in-scope action; group publishing is
      // Graph-deprecated) + facebook_monetization_eligibility (niche) were
      // dropped per the FACEBOOK-1 plan §4. Asserted both as registered
      // sources and as the V1 underscore key shape.
      expect(getOptionsResolver("facebook:groups")).toBeUndefined();
      expect(getOptionsResolver("facebook:monetization_eligibility")).toBeUndefined();
      const facebookSources = listOptionsResolvers()
        .filter((r) => r.provider === "facebook")
        .map((r) => r.source);
      expect(facebookSources).not.toContain("facebook:groups");
      expect(facebookSources).not.toContain("facebook:monetization_eligibility");
    });
  });

  describe("Google Analytics resolvers (Slice 3.GOOGLE-ANALYTICS-3)", () => {
    it("getOptionsResolver resolves google-analytics:accounts (account-scoped, no deps)", () => {
      const r = getOptionsResolver("google-analytics:accounts");
      expect(r).toBeDefined();
      expect(r?.provider).toBe("google-analytics");
      expect(r?.requiresIntegration).toBe(true);
      expect(r?.requiredDeps).toBeUndefined();
    });

    it("getOptionsResolver resolves google-analytics:properties (dependsOn accountId — verbatim)", () => {
      const r = getOptionsResolver("google-analytics:properties");
      expect(r).toBeDefined();
      expect(r?.provider).toBe("google-analytics");
      expect(r?.requiresIntegration).toBe(true);
      expect(r?.requiredDeps).toEqual(["accountId"]);
    });

    it("getOptionsResolver resolves google-analytics:data_streams (dependsOn propertyId)", () => {
      const r = getOptionsResolver("google-analytics:data_streams");
      expect(r).toBeDefined();
      expect(r?.provider).toBe("google-analytics");
      expect(r?.requiresIntegration).toBe(true);
      expect(r?.requiredDeps).toEqual(["propertyId"]);
    });

    it("getOptionsResolver resolves google-analytics:conversion_events (dependsOn propertyId)", () => {
      const r = getOptionsResolver("google-analytics:conversion_events");
      expect(r).toBeDefined();
      expect(r?.provider).toBe("google-analytics");
      expect(r?.requiresIntegration).toBe(true);
      expect(r?.requiredDeps).toEqual(["propertyId"]);
    });

    it("registers the accepted GA resolver keys (4 action pickers + the flat analytics-widget picker)", () => {
      const gaSources = listOptionsResolvers()
        .filter((r) => r.provider === "google-analytics")
        .map((r) => r.source)
        .sort();
      expect(gaSources).toEqual([
        "google-analytics:accounts",
        "google-analytics:conversion_events",
        "google-analytics:data_streams",
        "google-analytics:properties",
        // ANALYTICS-SOURCES-GA-1 — flat property picker for the analytics dashboard widget.
        "google-analytics:properties_flat",
      ]);
    });

    it("does NOT register a measurement-secret or Universal-Analytics resolver", () => {
      expect(getOptionsResolver("google-analytics:measurement_secrets")).toBeUndefined();
      expect(getOptionsResolver("google-analytics:measurement_ids")).toBeUndefined();
      expect(getOptionsResolver("google-analytics:views")).toBeUndefined();
      const gaSources = listOptionsResolvers()
        .filter((r) => r.provider === "google-analytics")
        .map((r) => r.source);
      expect(gaSources).not.toContain("google-analytics:measurement_secrets");
      expect(gaSources).not.toContain("google-analytics:views");
    });
  });

  it("returns undefined for an unknown source", () => {
    expect(getOptionsResolver("ghost:nothing")).toBeUndefined();
  });

  it("listOptionsResolvers returns a deterministic, sorted list", () => {
    const list = listOptionsResolvers();
    expect(list.length).toBeGreaterThan(0);
    const sources = list.map((r) => r.source);
    const sorted = [...sources].sort();
    expect(sources).toEqual(sorted);
  });

  it("every registered resolver's source matches the <provider>:<resource> regex", () => {
    for (const r of listOptionsResolvers()) {
      expect(r.source).toMatch(OPTIONS_SOURCE_KEY_REGEX);
    }
  });

  it("every registered resolver's source starts with its declared provider", () => {
    for (const r of listOptionsResolvers()) {
      expect(r.source.startsWith(`${r.provider}:`)).toBe(true);
    }
  });

  describe("Microsoft Excel resolvers (Slice 4.EXCEL-META-2)", () => {
    it("getOptionsResolver resolves microsoft-excel:workbooks (account-scoped, no deps)", () => {
      const r = getOptionsResolver("microsoft-excel:workbooks");
      expect(r).toBeDefined();
      expect(r?.source).toBe("microsoft-excel:workbooks");
      expect(r?.provider).toBe("microsoft-excel");
      expect(r?.requiresIntegration).toBe(true);
      expect(r?.requiredDeps).toBeUndefined();
    });

    it("getOptionsResolver resolves microsoft-excel:worksheets (dependsOn workbookId — camelCase verbatim)", () => {
      const r = getOptionsResolver("microsoft-excel:worksheets");
      expect(r).toBeDefined();
      expect(r?.provider).toBe("microsoft-excel");
      expect(r?.requiresIntegration).toBe(true);
      expect(r?.requiredDeps).toEqual(["workbookId"]);
    });

    it("getOptionsResolver resolves microsoft-excel:tables (dependsOn workbookId)", () => {
      const r = getOptionsResolver("microsoft-excel:tables");
      expect(r).toBeDefined();
      expect(r?.provider).toBe("microsoft-excel");
      expect(r?.requiresIntegration).toBe(true);
      expect(r?.requiredDeps).toEqual(["workbookId"]);
    });

    it("registers exactly the 3 EXCEL-META-2 resolver keys (columns deferred)", () => {
      const sources = listOptionsResolvers()
        .filter((r) => r.provider === "microsoft-excel")
        .map((r) => r.source)
        .sort();
      expect(sources).toEqual([
        "microsoft-excel:tables",
        "microsoft-excel:workbooks",
        "microsoft-excel:worksheets",
      ]);
      // `columns` resolver intentionally deferred (hand-typed headers OK).
      expect(getOptionsResolver("microsoft-excel:columns")).toBeUndefined();
    });
  });

  describe("Airtable resolvers (Slice 4.AIRTABLE-META-2)", () => {
    it("getOptionsResolver resolves airtable:bases (account-scoped, no deps)", () => {
      const r = getOptionsResolver("airtable:bases");
      expect(r).toBeDefined();
      expect(r?.source).toBe("airtable:bases");
      expect(r?.provider).toBe("airtable");
      expect(r?.requiresIntegration).toBe(true);
      expect(r?.requiredDeps).toBeUndefined();
    });

    it("getOptionsResolver resolves airtable:tables (dependsOn baseId — schema-verbatim)", () => {
      const r = getOptionsResolver("airtable:tables");
      expect(r).toBeDefined();
      expect(r?.provider).toBe("airtable");
      expect(r?.requiresIntegration).toBe(true);
      expect(r?.requiredDeps).toEqual(["baseId"]);
    });

    it("getOptionsResolver resolves airtable:fields (multi-parent: baseId + tableIdOrName)", () => {
      const r = getOptionsResolver("airtable:fields");
      expect(r).toBeDefined();
      expect(r?.provider).toBe("airtable");
      expect(r?.requiresIntegration).toBe(true);
      // Multi-parent cascade unblocked by BUILDER-OPTIONS-1. Names pinned
      // verbatim to the Airtable runtime Zod schemas.
      expect(r?.requiredDeps).toEqual(["baseId", "tableIdOrName"]);
    });

    it("getOptionsResolver resolves airtable:views (multi-parent: baseId + tableIdOrName)", () => {
      const r = getOptionsResolver("airtable:views");
      expect(r).toBeDefined();
      expect(r?.provider).toBe("airtable");
      expect(r?.requiresIntegration).toBe(true);
      expect(r?.requiredDeps).toEqual(["baseId", "tableIdOrName"]);
    });

    it("getOptionsResolver resolves airtable:attachment_fields (multi-parent: baseId + tableIdOrName)", () => {
      const r = getOptionsResolver("airtable:attachment_fields");
      expect(r).toBeDefined();
      expect(r?.provider).toBe("airtable");
      expect(r?.requiresIntegration).toBe(true);
      expect(r?.requiredDeps).toEqual(["baseId", "tableIdOrName"]);
    });

    it("registers exactly the 5 AIRTABLE-META-2 resolver keys", () => {
      const sources = listOptionsResolvers()
        .filter((r) => r.provider === "airtable")
        .map((r) => r.source)
        .sort();
      expect(sources).toEqual([
        "airtable:attachment_fields",
        "airtable:bases",
        "airtable:fields",
        "airtable:tables",
        "airtable:views",
      ]);
    });

    it("does NOT register airtable:records (record pickers rejected for v1)", () => {
      expect(getOptionsResolver("airtable:records")).toBeUndefined();
      const sources = listOptionsResolvers()
        .filter((r) => r.provider === "airtable")
        .map((r) => r.source);
      expect(sources).not.toContain("airtable:records");
    });
  });

  describe("Trello resolvers (Slice 4.TRELLO-META-2)", () => {
    it("getOptionsResolver resolves trello:boards (account-scoped, no deps)", () => {
      const r = getOptionsResolver("trello:boards");
      expect(r).toBeDefined();
      expect(r?.source).toBe("trello:boards");
      expect(r?.provider).toBe("trello");
      expect(r?.requiresIntegration).toBe(true);
      // Cascade ROOT: a board id is an opaque 24-hex id, not hand-typeable.
      expect(r?.requiredDeps).toBeUndefined();
    });

    it("getOptionsResolver resolves trello:lists (dependsOn boardId — UI-scope field name verbatim)", () => {
      const r = getOptionsResolver("trello:lists");
      expect(r).toBeDefined();
      expect(r?.provider).toBe("trello");
      expect(r?.requiresIntegration).toBe(true);
      // `boardId` matches the UI-scope field added to the card-targeted
      // schemas in TRELLO-META-3 + `create_list.idBoard` cascades off the
      // same `trello:boards` resolver. Single-parent — no multi-parent.
      expect(r?.requiredDeps).toEqual(["boardId"]);
    });

    it("getOptionsResolver resolves trello:cards (dependsOn boardId)", () => {
      const r = getOptionsResolver("trello:cards");
      expect(r).toBeDefined();
      expect(r?.provider).toBe("trello");
      expect(r?.requiresIntegration).toBe(true);
      expect(r?.requiredDeps).toEqual(["boardId"]);
    });

    it("getOptionsResolver resolves trello:members (dependsOn boardId)", () => {
      const r = getOptionsResolver("trello:members");
      expect(r).toBeDefined();
      expect(r?.provider).toBe("trello");
      expect(r?.requiresIntegration).toBe(true);
      expect(r?.requiredDeps).toEqual(["boardId"]);
    });

    it("getOptionsResolver resolves trello:labels (dependsOn boardId)", () => {
      const r = getOptionsResolver("trello:labels");
      expect(r).toBeDefined();
      expect(r?.provider).toBe("trello");
      expect(r?.requiresIntegration).toBe(true);
      expect(r?.requiredDeps).toEqual(["boardId"]);
    });

    it("registers exactly the 5 TRELLO-META-2 resolver keys", () => {
      const sources = listOptionsResolvers()
        .filter((r) => r.provider === "trello")
        .map((r) => r.source)
        .sort();
      expect(sources).toEqual([
        "trello:boards",
        "trello:cards",
        "trello:labels",
        "trello:lists",
        "trello:members",
      ]);
    });

    it("does NOT register trello:checklists / trello:check_items (no runtime consumer)", () => {
      expect(getOptionsResolver("trello:checklists")).toBeUndefined();
      expect(getOptionsResolver("trello:check_items")).toBeUndefined();
      const sources = listOptionsResolvers()
        .filter((r) => r.provider === "trello")
        .map((r) => r.source);
      expect(sources).not.toContain("trello:checklists");
      expect(sources).not.toContain("trello:check_items");
    });
  });

  describe("Microsoft OneDrive resolvers (Slice 4.ONEDRIVE-META-2)", () => {
    it("getOptionsResolver resolves microsoft-onedrive:folders (account-scoped, no deps)", () => {
      const r = getOptionsResolver("microsoft-onedrive:folders");
      expect(r).toBeDefined();
      expect(r?.source).toBe("microsoft-onedrive:folders");
      expect(r?.provider).toBe("microsoft-onedrive");
      expect(r?.requiresIntegration).toBe(true);
      // Root folder picker — no parent field.
      expect(r?.requiredDeps).toBeUndefined();
    });

    it("getOptionsResolver resolves microsoft-onedrive:items (dependsOn parentItemId)", () => {
      const r = getOptionsResolver("microsoft-onedrive:items");
      expect(r).toBeDefined();
      expect(r?.provider).toBe("microsoft-onedrive");
      expect(r?.requiresIntegration).toBe(true);
      // `parentItemId` matches the UI-scope field ONEDRIVE-META-3 adds to
      // the item-targeted schemas. Single-parent — no multi-parent.
      expect(r?.requiredDeps).toEqual(["parentItemId"]);
    });

    it("registers the OneDrive resolver keys (META-2 folders/items + GETFILE-DISCOVERY files)", () => {
      const sources = listOptionsResolvers()
        .filter((r) => r.provider === "microsoft-onedrive")
        .map((r) => r.source)
        .sort();
      expect(sources).toEqual([
        "microsoft-onedrive:files",
        "microsoft-onedrive:folders",
        "microsoft-onedrive:items",
      ]);
    });

    it("does NOT register microsoft-onedrive:drives (single personal drive; rejected for v1)", () => {
      expect(getOptionsResolver("microsoft-onedrive:drives")).toBeUndefined();
      const sources = listOptionsResolvers()
        .filter((r) => r.provider === "microsoft-onedrive")
        .map((r) => r.source);
      expect(sources).not.toContain("microsoft-onedrive:drives");
    });
  });

  describe("Microsoft Teams resolvers (Slice 4.TEAMS-META-2)", () => {
    it("getOptionsResolver resolves microsoft-teams:teams (account-scoped, no deps)", () => {
      const r = getOptionsResolver("microsoft-teams:teams");
      expect(r).toBeDefined();
      expect(r?.source).toBe("microsoft-teams:teams");
      expect(r?.provider).toBe("microsoft-teams");
      expect(r?.requiresIntegration).toBe(true);
      // Cascade root — no parent field.
      expect(r?.requiredDeps).toBeUndefined();
    });

    it("getOptionsResolver resolves microsoft-teams:channels (dependsOn teamId)", () => {
      const r = getOptionsResolver("microsoft-teams:channels");
      expect(r).toBeDefined();
      expect(r?.provider).toBe("microsoft-teams");
      expect(r?.requiresIntegration).toBe(true);
      // `teamId` matches the real runtime field on every consumer; NO
      // UI-scope field needed. Single-parent — no multi-parent.
      expect(r?.requiredDeps).toEqual(["teamId"]);
    });

    it("registers exactly the 2 TEAMS-META-2 resolver keys", () => {
      const sources = listOptionsResolvers()
        .filter((r) => r.provider === "microsoft-teams")
        .map((r) => r.source)
        .sort();
      expect(sources).toEqual([
        "microsoft-teams:channels",
        "microsoft-teams:teams",
      ]);
    });

    it("does NOT register members / chats / messages (rejected or deferred for v1)", () => {
      expect(getOptionsResolver("microsoft-teams:members")).toBeUndefined();
      expect(getOptionsResolver("microsoft-teams:chats")).toBeUndefined();
      expect(getOptionsResolver("microsoft-teams:messages")).toBeUndefined();
      const sources = listOptionsResolvers()
        .filter((r) => r.provider === "microsoft-teams")
        .map((r) => r.source);
      expect(sources).not.toContain("microsoft-teams:members");
      expect(sources).not.toContain("microsoft-teams:chats");
      expect(sources).not.toContain("microsoft-teams:messages");
    });
  });

  it("OPTIONS_SOURCE_KEY_REGEX rejects malformed keys it should reject", () => {
    // Sanity on the regex used at module load.
    expect("slack:channels").toMatch(OPTIONS_SOURCE_KEY_REGEX);
    expect("microsoft-outlook:folders").toMatch(OPTIONS_SOURCE_KEY_REGEX);
    expect("google-sheets:sheets").toMatch(OPTIONS_SOURCE_KEY_REGEX);

    // Disallow: empty, no colon, leading non-lowercase, dot separator,
    // resource starting with non-lowercase, leading dash, trailing colon.
    expect("").not.toMatch(OPTIONS_SOURCE_KEY_REGEX);
    expect("slack").not.toMatch(OPTIONS_SOURCE_KEY_REGEX);
    expect("Slack:channels").not.toMatch(OPTIONS_SOURCE_KEY_REGEX);
    expect("slack.channels").not.toMatch(OPTIONS_SOURCE_KEY_REGEX);
    expect("slack:Channels").not.toMatch(OPTIONS_SOURCE_KEY_REGEX);
    expect("-slack:channels").not.toMatch(OPTIONS_SOURCE_KEY_REGEX);
    expect("slack:").not.toMatch(OPTIONS_SOURCE_KEY_REGEX);
  });

  describe("GitHub resolver (Slice ANALYTICS-SOURCES-GITHUB-UI-3)", () => {
    it("getOptionsResolver resolves github:repos (account-less personal, no deps)", () => {
      const r = getOptionsResolver("github:repos");
      expect(r).toBeDefined();
      expect(r?.source).toBe("github:repos");
      expect(r?.provider).toBe("github");
      expect(r?.requiresIntegration).toBe(true);
      expect(r?.requiredDeps).toBeUndefined();
    });
  });

  describe("Gmail resolver (Slice ANALYTICS-SOURCES-GMAIL-1)", () => {
    it("getOptionsResolver resolves gmail:labels (personal, no deps)", () => {
      const r = getOptionsResolver("gmail:labels");
      expect(r).toBeDefined();
      expect(r?.source).toBe("gmail:labels");
      expect(r?.provider).toBe("gmail");
      expect(r?.requiresIntegration).toBe(true);
      expect(r?.requiredDeps).toBeUndefined();
    });
  });
});
