/**
 * @jest-environment node
 *
 * Tests for integrations/slack/actions/normalizeReactionName.
 *
 * Pins the contract:
 *   - Strip ONE leading + ONE trailing colon together.
 *   - Trim ASCII whitespace.
 *   - Preserve case, aliases, skin-tone double-colons.
 */
import { normalizeReactionName } from "@/integrations/slack/actions/normalizeReactionName";

describe("normalizeReactionName — strips outer colons safely", () => {
  it("strips `:thumbsup:` → `thumbsup`", () => {
    expect(normalizeReactionName(":thumbsup:")).toBe("thumbsup");
  });

  it("passes through `thumbsup` unchanged", () => {
    expect(normalizeReactionName("thumbsup")).toBe("thumbsup");
  });

  it("strips outer colons but keeps the inner doubled-colon for skin-tone modifiers", () => {
    expect(normalizeReactionName(":thumbsup::skin-tone-2:")).toBe("thumbsup::skin-tone-2");
  });

  it("does NOT strip a single leading colon (malformed)", () => {
    expect(normalizeReactionName(":thumbsup")).toBe(":thumbsup");
  });

  it("does NOT strip a single trailing colon (malformed)", () => {
    expect(normalizeReactionName("thumbsup:")).toBe("thumbsup:");
  });

  it("returns empty string for `::` (would be a malformed bare-colons input)", () => {
    // ":" + ":" — outer colons match, slice(1, -1) is empty. Caller is
    // expected to treat this as invalid and surface the empty-string
    // condition (the handler does this).
    expect(normalizeReactionName("::")).toBe("");
  });

  it("preserves Slack's canonical `+1` and `-1` reaction names", () => {
    expect(normalizeReactionName(":+1:")).toBe("+1");
    expect(normalizeReactionName(":-1:")).toBe("-1");
  });

  it("trims ASCII whitespace before colon stripping", () => {
    expect(normalizeReactionName("  :thumbsup:  ")).toBe("thumbsup");
    expect(normalizeReactionName("  thumbsup  ")).toBe("thumbsup");
  });

  it("preserves case (Slack reaction names are case-sensitive)", () => {
    expect(normalizeReactionName(":ThumbsUp:")).toBe("ThumbsUp");
  });

  it("returns empty string for empty / whitespace-only input", () => {
    expect(normalizeReactionName("")).toBe("");
    expect(normalizeReactionName("   ")).toBe("");
  });

  it("does NOT translate emoji aliases (e.g. `thumbsup` stays as-is, not mapped to `+1`)", () => {
    expect(normalizeReactionName("thumbsup")).toBe("thumbsup");
    expect(normalizeReactionName("+1")).toBe("+1");
  });
});
