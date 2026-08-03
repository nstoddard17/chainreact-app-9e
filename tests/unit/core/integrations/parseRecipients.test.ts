/** @jest-environment node */
import { parseRecipients } from "@/core/integrations/parseRecipients";

describe("parseRecipients (Q7)", () => {
  it("returns empty array for nullish input", () => {
    expect(parseRecipients(null)).toEqual([]);
    expect(parseRecipients(undefined)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseRecipients("")).toEqual([]);
    expect(parseRecipients("   ")).toEqual([]);
  });

  it("returns single email passthrough", () => {
    expect(parseRecipients("a@example.com")).toEqual(["a@example.com"]);
  });

  it("splits CSV string", () => {
    expect(parseRecipients("a@x.com,b@x.com,c@x.com")).toEqual([
      "a@x.com",
      "b@x.com",
      "c@x.com",
    ]);
  });

  it("trims whitespace around each entry", () => {
    expect(parseRecipients("  a@x.com , b@x.com  ")).toEqual([
      "a@x.com",
      "b@x.com",
    ]);
  });

  it("drops empty entries from trailing commas", () => {
    expect(parseRecipients("a@x.com,,b@x.com,")).toEqual([
      "a@x.com",
      "b@x.com",
    ]);
  });

  it("accepts a string array as-is when entries are single emails", () => {
    expect(parseRecipients(["a@x.com", "b@x.com"])).toEqual([
      "a@x.com",
      "b@x.com",
    ]);
  });

  it("flattens mixed array of single emails and CSV strings", () => {
    expect(
      parseRecipients(["a@x.com", "b@x.com,c@x.com", "  d@x.com  "]),
    ).toEqual(["a@x.com", "b@x.com", "c@x.com", "d@x.com"]);
  });

  it("preserves duplicates (no dedup)", () => {
    expect(parseRecipients("a@x.com,a@x.com")).toEqual([
      "a@x.com",
      "a@x.com",
    ]);
  });

  it("ignores non-string entries inside an array", () => {
    expect(
      parseRecipients(["a@x.com", null as unknown as string, "b@x.com"]),
    ).toEqual(["a@x.com", "b@x.com"]);
  });
});
