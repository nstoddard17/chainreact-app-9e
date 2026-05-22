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
