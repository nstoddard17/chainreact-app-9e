/**
 * @jest-environment node
 *
 * Tests for the Gmail buildSearchQuery helper. Pure function — no
 * mocks. Asserts the filter-mode → Gmail q syntax transformation.
 */
import { buildSearchQuery } from "@/integrations/gmail/utils/buildSearchQuery";
import type { FiltersModeConfig } from "@/integrations/gmail/actions/searchEmails.schema";

function f(overrides: Partial<Omit<FiltersModeConfig, "searchMode">> = {}): FiltersModeConfig {
  return {
    searchMode: "filters",
    ...overrides,
  };
}

describe("buildSearchQuery", () => {
  it("returns empty string when no filters supplied", () => {
    expect(buildSearchQuery(f())).toBe("");
  });

  it("emits from:<value> when from is set", () => {
    expect(buildSearchQuery(f({ from: "alice@example.com" }))).toBe(
      "from:alice@example.com",
    );
  });

  it("quotes from values containing whitespace", () => {
    expect(buildSearchQuery(f({ from: "Alice Smith" }))).toBe(
      'from:"Alice Smith"',
    );
  });

  it("emits to:<value> when to is set", () => {
    expect(buildSearchQuery(f({ to: "bob@example.com" }))).toBe(
      "to:bob@example.com",
    );
  });

  it("emits subject:<value> when subject is set (quotes if whitespace)", () => {
    expect(buildSearchQuery(f({ subject: "invoice" }))).toBe(
      "subject:invoice",
    );
    expect(buildSearchQuery(f({ subject: "quarterly report" }))).toBe(
      'subject:"quarterly report"',
    );
  });

  it("emits has:attachment for hasAttachment='yes'", () => {
    expect(buildSearchQuery(f({ hasAttachment: "yes" }))).toBe(
      "has:attachment",
    );
  });

  it("emits -has:attachment for hasAttachment='no'", () => {
    expect(buildSearchQuery(f({ hasAttachment: "no" }))).toBe(
      "-has:attachment",
    );
  });

  it("emits after:<date> for dateAfter", () => {
    expect(buildSearchQuery(f({ dateAfter: "2026/01/01" }))).toBe(
      "after:2026/01/01",
    );
  });

  it("emits before:<date> for dateBefore", () => {
    expect(buildSearchQuery(f({ dateBefore: "2026/06/30" }))).toBe(
      "before:2026/06/30",
    );
  });

  it("emits larger:<bytes> for largerThan (integer bytes)", () => {
    expect(buildSearchQuery(f({ largerThan: 1_000_000 }))).toBe(
      "larger:1000000",
    );
  });

  it("emits smaller:<bytes> for smallerThan", () => {
    expect(buildSearchQuery(f({ smallerThan: 500_000 }))).toBe(
      "smaller:500000",
    );
  });

  it("emits label:<id> for each labelId, AND-joined", () => {
    expect(
      buildSearchQuery(f({ labelIds: ["INBOX", "Label_5"] })),
    ).toBe("label:INBOX label:Label_5");
  });

  it("forwards hasWords verbatim (Gmail's implicit-AND inclusion)", () => {
    expect(buildSearchQuery(f({ hasWords: "urgent priority" }))).toBe(
      "urgent priority",
    );
  });

  it("emits -(<value>) for doesntHaveWords (Gmail negation group)", () => {
    expect(buildSearchQuery(f({ doesntHaveWords: "newsletter" }))).toBe(
      "-(newsletter)",
    );
  });

  it("composes multiple filters with single-space implicit AND", () => {
    const q = buildSearchQuery(
      f({
        from: "alice@example.com",
        subject: "Q4 report",
        hasAttachment: "yes",
        dateAfter: "2026/01/01",
        dateBefore: "2026/03/31",
        largerThan: 5_000,
        labelIds: ["INBOX"],
        hasWords: "urgent",
        doesntHaveWords: "draft",
      }),
    );

    expect(q).toBe(
      'from:alice@example.com subject:"Q4 report" has:attachment after:2026/01/01 before:2026/03/31 larger:5000 label:INBOX urgent -(draft)',
    );
  });

  it("omits filters whose value is undefined", () => {
    const q = buildSearchQuery(
      f({
        from: "alice@example.com",
        subject: undefined,
        hasAttachment: undefined,
        labelIds: undefined,
      }),
    );
    expect(q).toBe("from:alice@example.com");
  });

  it("omits empty-string text filters defensively (schema also rejects but helper stays safe)", () => {
    // The schema enforces min(1) on these, but the helper guards too
    // since `FiltersModeConfig` types them as `string | undefined`.
    const q = buildSearchQuery(
      f({
        from: "",
        to: "bob@example.com",
        subject: "",
      } as Partial<Omit<FiltersModeConfig, "searchMode">>),
    );
    expect(q).toBe("to:bob@example.com");
  });

  it("omits an empty labelIds array", () => {
    const q = buildSearchQuery(
      f({
        from: "alice@example.com",
        labelIds: [] as never,
      }),
    );
    expect(q).toBe("from:alice@example.com");
  });
});
