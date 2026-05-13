/**
 * @jest-environment node
 *
 * Tests for the Gmail search_emails config schema. Validates the
 * discriminated `searchMode` union — both branches accept/reject
 * the right field sets, and strict mode rejects cross-branch
 * contamination.
 */
import { SearchEmailsConfigSchema } from "@/integrations/gmail/actions/searchEmails.schema";

describe("SearchEmailsConfigSchema — discriminator + missing/invalid mode", () => {
  it("rejects when searchMode is missing", () => {
    expect(
      SearchEmailsConfigSchema.safeParse({ query: "is:unread" }).success,
    ).toBe(false);
  });

  it("rejects an invalid searchMode value", () => {
    expect(
      SearchEmailsConfigSchema.safeParse({
        searchMode: "advanced",
        query: "is:unread",
      }).success,
    ).toBe(false);
  });
});

describe("SearchEmailsConfigSchema — query mode", () => {
  it("accepts a minimal valid query config", () => {
    expect(
      SearchEmailsConfigSchema.safeParse({
        searchMode: "query",
        query: "from:alice@example.com",
      }).success,
    ).toBe(true);
  });

  it("accepts maxResults and pageToken in query mode", () => {
    expect(
      SearchEmailsConfigSchema.safeParse({
        searchMode: "query",
        query: "is:unread",
        maxResults: 50,
        pageToken: "abc",
      }).success,
    ).toBe(true);
  });

  it("rejects empty query string", () => {
    expect(
      SearchEmailsConfigSchema.safeParse({
        searchMode: "query",
        query: "",
      }).success,
    ).toBe(false);
  });

  it("rejects missing query", () => {
    expect(
      SearchEmailsConfigSchema.safeParse({ searchMode: "query" }).success,
    ).toBe(false);
  });

  it("rejects filter-mode fields in query mode (strict)", () => {
    expect(
      SearchEmailsConfigSchema.safeParse({
        searchMode: "query",
        query: "is:unread",
        from: "alice@example.com",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown fields in query mode", () => {
    expect(
      SearchEmailsConfigSchema.safeParse({
        searchMode: "query",
        query: "is:unread",
        customQuery: "alias",
      }).success,
    ).toBe(false);
  });
});

describe("SearchEmailsConfigSchema — filters mode", () => {
  it("accepts a minimal filters config (no filters set)", () => {
    expect(
      SearchEmailsConfigSchema.safeParse({ searchMode: "filters" }).success,
    ).toBe(true);
  });

  it("accepts each filter field individually", () => {
    const fields: Record<string, unknown> = {
      from: "alice@example.com",
      to: "bob@example.com",
      subject: "Hello",
      hasAttachment: "yes",
      dateAfter: "2026/01/01",
      dateBefore: "2026/12/31",
      largerThan: 1024,
      smallerThan: 1024,
      labelIds: ["INBOX"],
      hasWords: "urgent",
      doesntHaveWords: "newsletter",
      maxResults: 25,
      pageToken: "abc",
    };
    for (const [k, v] of Object.entries(fields)) {
      const r = SearchEmailsConfigSchema.safeParse({
        searchMode: "filters",
        [k]: v,
      });
      expect(r.success).toBe(true);
    }
  });

  it("accepts the hasAttachment 'no' variant", () => {
    expect(
      SearchEmailsConfigSchema.safeParse({
        searchMode: "filters",
        hasAttachment: "no",
      }).success,
    ).toBe(true);
  });

  it("rejects invalid hasAttachment values (V1 'any' dropped — omit field instead)", () => {
    for (const v of ["any", "true", "false", true, false]) {
      expect(
        SearchEmailsConfigSchema.safeParse({
          searchMode: "filters",
          hasAttachment: v,
        }).success,
      ).toBe(false);
    }
  });

  it("rejects invalid dateAfter format (must be YYYY/MM/DD)", () => {
    for (const bad of ["2026-01-01", "01/01/2026", "2026/1/1", "today"]) {
      expect(
        SearchEmailsConfigSchema.safeParse({
          searchMode: "filters",
          dateAfter: bad,
        }).success,
      ).toBe(false);
    }
  });

  it("rejects invalid dateBefore format (must be YYYY/MM/DD)", () => {
    expect(
      SearchEmailsConfigSchema.safeParse({
        searchMode: "filters",
        dateBefore: "06/30/2026",
      }).success,
    ).toBe(false);
  });

  it("rejects non-integer or zero / negative size filters", () => {
    expect(
      SearchEmailsConfigSchema.safeParse({
        searchMode: "filters",
        largerThan: 0,
      }).success,
    ).toBe(false);
    expect(
      SearchEmailsConfigSchema.safeParse({
        searchMode: "filters",
        largerThan: -100,
      }).success,
    ).toBe(false);
    expect(
      SearchEmailsConfigSchema.safeParse({
        searchMode: "filters",
        smallerThan: 1.5,
      }).success,
    ).toBe(false);
  });

  it("rejects maxResults outside 1..500", () => {
    expect(
      SearchEmailsConfigSchema.safeParse({
        searchMode: "filters",
        maxResults: 0,
      }).success,
    ).toBe(false);
    expect(
      SearchEmailsConfigSchema.safeParse({
        searchMode: "filters",
        maxResults: 501,
      }).success,
    ).toBe(false);
    expect(
      SearchEmailsConfigSchema.safeParse({
        searchMode: "filters",
        maxResults: 100,
      }).success,
    ).toBe(true);
  });

  it("rejects empty labelIds array", () => {
    expect(
      SearchEmailsConfigSchema.safeParse({
        searchMode: "filters",
        labelIds: [],
      }).success,
    ).toBe(false);
  });

  it("rejects filter values containing literal quote characters (use query mode for raw q)", () => {
    expect(
      SearchEmailsConfigSchema.safeParse({
        searchMode: "filters",
        from: 'Alice "Smith"',
      }).success,
    ).toBe(false);
  });

  it("rejects query-mode fields in filters mode (strict)", () => {
    expect(
      SearchEmailsConfigSchema.safeParse({
        searchMode: "filters",
        query: "is:unread",
      }).success,
    ).toBe(false);
  });

  // V1 fields not ported in this commit

  it("rejects V1 isRead / isStarred / attachmentName / dateRange / threadId", () => {
    for (const dropped of [
      "isRead",
      "isStarred",
      "attachmentName",
      "dateRange",
      "threadId",
      "searchQuery",
      "customQuery",
    ]) {
      expect(
        SearchEmailsConfigSchema.safeParse({
          searchMode: "filters",
          [dropped]: "x",
        }).success,
      ).toBe(false);
    }
  });

  it("rejects unknown fields generally", () => {
    expect(
      SearchEmailsConfigSchema.safeParse({
        searchMode: "filters",
        xCustomField: "v",
      }).success,
    ).toBe(false);
  });
});
