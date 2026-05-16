/**
 * @jest-environment node
 *
 * Tests for the fetch_emails config schema (Outlook Mail 2.2 Commit 3).
 * V1-shape: all fields optional, maxResults defaults to 10 bounded 1..50,
 * strict mode rejects unknowns.
 */
import { FetchEmailsConfigSchema } from "@/integrations/microsoft-outlook/actions/fetchEmails.schema";

describe("FetchEmailsConfigSchema", () => {
  it("accepts a fully-empty config (all fields optional)", () => {
    const parsed = FetchEmailsConfigSchema.parse({});
    expect(parsed.maxResults).toBe(10);
    expect(parsed.folderId).toBeUndefined();
    expect(parsed.query).toBeUndefined();
    expect(parsed.startDate).toBeUndefined();
    expect(parsed.endDate).toBeUndefined();
  });

  it("defaults maxResults to 10 when omitted", () => {
    const parsed = FetchEmailsConfigSchema.parse({});
    expect(parsed.maxResults).toBe(10);
  });

  it("accepts a custom folderId", () => {
    const parsed = FetchEmailsConfigSchema.parse({ folderId: "inbox" });
    expect(parsed.folderId).toBe("inbox");
  });

  it("rejects empty-string folderId", () => {
    expect(() =>
      FetchEmailsConfigSchema.parse({ folderId: "" }),
    ).toThrow();
  });

  it("accepts a query string", () => {
    const parsed = FetchEmailsConfigSchema.parse({ query: "invoice" });
    expect(parsed.query).toBe("invoice");
  });

  it("accepts an empty query string (handler treats as no-query)", () => {
    // Per V1-parity, empty string ≠ undefined at the schema; the
    // handler decides whether to invoke $search or fall to $filter
    // based on `query.trim().length > 0`.
    const parsed = FetchEmailsConfigSchema.parse({ query: "" });
    expect(parsed.query).toBe("");
  });

  it("accepts a startDate string", () => {
    const parsed = FetchEmailsConfigSchema.parse({
      startDate: "2026-05-01T00:00:00Z",
    });
    expect(parsed.startDate).toBe("2026-05-01T00:00:00Z");
  });

  it("accepts an endDate string", () => {
    const parsed = FetchEmailsConfigSchema.parse({
      endDate: "2026-05-31T23:59:59Z",
    });
    expect(parsed.endDate).toBe("2026-05-31T23:59:59Z");
  });

  it("rejects empty-string startDate", () => {
    expect(() =>
      FetchEmailsConfigSchema.parse({ startDate: "" }),
    ).toThrow();
  });

  it("rejects empty-string endDate", () => {
    expect(() =>
      FetchEmailsConfigSchema.parse({ endDate: "" }),
    ).toThrow();
  });

  it("accepts maxResults at the lower bound (1)", () => {
    const parsed = FetchEmailsConfigSchema.parse({ maxResults: 1 });
    expect(parsed.maxResults).toBe(1);
  });

  it("accepts maxResults at the upper bound (50)", () => {
    const parsed = FetchEmailsConfigSchema.parse({ maxResults: 50 });
    expect(parsed.maxResults).toBe(50);
  });

  it("rejects maxResults = 0", () => {
    expect(() =>
      FetchEmailsConfigSchema.parse({ maxResults: 0 }),
    ).toThrow();
  });

  it("rejects maxResults > 50", () => {
    expect(() =>
      FetchEmailsConfigSchema.parse({ maxResults: 51 }),
    ).toThrow();
  });

  it("rejects negative maxResults", () => {
    expect(() =>
      FetchEmailsConfigSchema.parse({ maxResults: -1 }),
    ).toThrow();
  });

  it("rejects non-integer maxResults", () => {
    expect(() =>
      FetchEmailsConfigSchema.parse({ maxResults: 10.5 }),
    ).toThrow();
  });

  it("rejects string maxResults (no coercion)", () => {
    expect(() =>
      FetchEmailsConfigSchema.parse({ maxResults: "10" }),
    ).toThrow();
  });

  it("accepts a fully-populated config", () => {
    const parsed = FetchEmailsConfigSchema.parse({
      folderId: "inbox",
      query: "invoice",
      startDate: "2026-05-01T00:00:00Z",
      endDate: "2026-05-31T23:59:59Z",
      maxResults: 25,
    });
    expect(parsed).toEqual({
      folderId: "inbox",
      query: "invoice",
      startDate: "2026-05-01T00:00:00Z",
      endDate: "2026-05-31T23:59:59Z",
      maxResults: 25,
    });
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() =>
      FetchEmailsConfigSchema.parse({ unknownExtra: "leak" }),
    ).toThrow();
  });
});
