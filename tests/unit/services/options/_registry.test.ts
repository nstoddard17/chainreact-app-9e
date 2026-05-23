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
});
