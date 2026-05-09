import {
  formatPropertyValue,
  formatProperties,
  parsePropertyValue,
  parseProperties,
  SUPPORTED_PROPERTY_TYPES,
  UnsupportedPropertyTypeError,
} from "@/integrations/_shared/notion/properties";

describe("Notion properties — SUPPORTED_PROPERTY_TYPES", () => {
  it("includes the 9 Slice 9 Batch 1 types in expected order", () => {
    expect(SUPPORTED_PROPERTY_TYPES).toEqual([
      "title",
      "rich_text",
      "number",
      "select",
      "checkbox",
      "date",
      "url",
      "email",
      "phone_number",
    ]);
  });
});

describe("formatPropertyValue — outbound", () => {
  it("title wraps a string into Notion's rich-text array", () => {
    expect(formatPropertyValue("title", "Hello")).toEqual({
      title: [{ type: "text", text: { content: "Hello" } }],
    });
  });

  it("rich_text wraps a string into Notion's rich-text array", () => {
    expect(formatPropertyValue("rich_text", "Body")).toEqual({
      rich_text: [{ type: "text", text: { content: "Body" } }],
    });
  });

  it("number passes the value through (preserves null + zero)", () => {
    expect(formatPropertyValue("number", 42)).toEqual({ number: 42 });
    expect(formatPropertyValue("number", 0)).toEqual({ number: 0 });
    expect(formatPropertyValue("number", null)).toEqual({ number: null });
  });

  it("select wraps a string in { name } and accepts null", () => {
    expect(formatPropertyValue("select", "High")).toEqual({
      select: { name: "High" },
    });
    expect(formatPropertyValue("select", null)).toEqual({ select: null });
  });

  it("checkbox passes a boolean through", () => {
    expect(formatPropertyValue("checkbox", true)).toEqual({ checkbox: true });
    expect(formatPropertyValue("checkbox", false)).toEqual({ checkbox: false });
  });

  it("date accepts string shorthand → { start } and full { start, end? }", () => {
    expect(formatPropertyValue("date", "2026-05-09")).toEqual({
      date: { start: "2026-05-09" },
    });
    expect(formatPropertyValue("date", { start: "2026-05-09", end: "2026-05-10" })).toEqual({
      date: { start: "2026-05-09", end: "2026-05-10" },
    });
    expect(formatPropertyValue("date", null)).toEqual({ date: null });
  });

  it("url / email / phone_number pass strings + null through", () => {
    expect(formatPropertyValue("url", "https://example.test")).toEqual({
      url: "https://example.test",
    });
    expect(formatPropertyValue("url", null)).toEqual({ url: null });
    expect(formatPropertyValue("email", "x@y.test")).toEqual({
      email: "x@y.test",
    });
    expect(formatPropertyValue("phone_number", "+1-555-0100")).toEqual({
      phone_number: "+1-555-0100",
    });
  });

  describe("UnsupportedPropertyTypeError on deferred types", () => {
    const deferred = [
      "relation",
      "people",
      "files",
      "rollup",
      "formula",
      "multi_select",
      "status",
    ];
    for (const type of deferred) {
      it(`throws on ${type}`, () => {
        expect(() => formatPropertyValue(type, "any")).toThrow(
          UnsupportedPropertyTypeError,
        );
      });
    }

    it("error message lists the supported set + deferred set", () => {
      expect.assertions(3);
      try {
        formatPropertyValue("relation", "x");
      } catch (err) {
        const msg = (err as Error).message;
        expect(msg).toContain("relation");
        expect(msg).toContain("title");
        expect(msg).toContain("Deferred");
      }
    });
  });
});

describe("formatProperties — convenience for typed maps", () => {
  it("formats every entry through formatPropertyValue", () => {
    const result = formatProperties({
      Name: { type: "title", value: "Q2" },
      Score: { type: "number", value: 99 },
      Done: { type: "checkbox", value: true },
    });
    expect(result).toEqual({
      Name: { title: [{ type: "text", text: { content: "Q2" } }] },
      Score: { number: 99 },
      Done: { checkbox: true },
    });
  });

  it("returns an empty object for an empty input", () => {
    expect(formatProperties({})).toEqual({});
  });
});

describe("parsePropertyValue — inbound", () => {
  it("title concatenates plain_text segments", () => {
    expect(
      parsePropertyValue({
        id: "p-1",
        type: "title",
        title: [
          { plain_text: "Hello" },
          { plain_text: " " },
          { plain_text: "world" },
        ],
      }),
    ).toEqual({ type: "title", value: "Hello world" });
  });

  it("title falls back to text.content when plain_text is missing", () => {
    expect(
      parsePropertyValue({
        type: "title",
        title: [{ text: { content: "fallback" } }],
      }),
    ).toEqual({ type: "title", value: "fallback" });
  });

  it("rich_text returns empty string for empty array", () => {
    expect(
      parsePropertyValue({ type: "rich_text", rich_text: [] }),
    ).toEqual({ type: "rich_text", value: "" });
  });

  it("number passes value through; null when missing", () => {
    expect(parsePropertyValue({ type: "number", number: 42 })).toEqual({
      type: "number",
      value: 42,
    });
    expect(parsePropertyValue({ type: "number", number: null })).toEqual({
      type: "number",
      value: null,
    });
    expect(parsePropertyValue({ type: "number" })).toEqual({
      type: "number",
      value: null,
    });
  });

  it("select extracts name; null on cleared", () => {
    expect(
      parsePropertyValue({ type: "select", select: { name: "High" } }),
    ).toEqual({ type: "select", value: "High" });
    expect(parsePropertyValue({ type: "select", select: null })).toEqual({
      type: "select",
      value: null,
    });
  });

  it("checkbox coerces falsy/truthy", () => {
    expect(parsePropertyValue({ type: "checkbox", checkbox: true })).toEqual({
      type: "checkbox",
      value: true,
    });
    expect(parsePropertyValue({ type: "checkbox", checkbox: false })).toEqual({
      type: "checkbox",
      value: false,
    });
  });

  it("date returns { start, end? } or null", () => {
    expect(
      parsePropertyValue({ type: "date", date: { start: "2026-05-09" } }),
    ).toEqual({ type: "date", value: { start: "2026-05-09" } });
    expect(
      parsePropertyValue({
        type: "date",
        date: { start: "2026-05-09", end: "2026-05-10" },
      }),
    ).toEqual({ type: "date", value: { start: "2026-05-09", end: "2026-05-10" } });
    expect(parsePropertyValue({ type: "date", date: null })).toEqual({
      type: "date",
      value: null,
    });
  });

  it("url / email / phone_number pass strings + null", () => {
    expect(parsePropertyValue({ type: "url", url: "https://x.test" })).toEqual({
      type: "url",
      value: "https://x.test",
    });
    expect(parsePropertyValue({ type: "email", email: null })).toEqual({
      type: "email",
      value: null,
    });
    expect(
      parsePropertyValue({ type: "phone_number", phone_number: "+1" }),
    ).toEqual({ type: "phone_number", value: "+1" });
  });

  it("throws UnsupportedPropertyTypeError on deferred + missing types", () => {
    expect(() =>
      parsePropertyValue({ type: "relation", relation: [] }),
    ).toThrow(UnsupportedPropertyTypeError);
    expect(() => parsePropertyValue({})).toThrow(
      UnsupportedPropertyTypeError,
    );
  });
});

describe("parseProperties — graceful skip on unsupported types", () => {
  it("parses supported entries and reports skipped ones", () => {
    const { parsed, skipped } = parseProperties({
      Name: {
        type: "title",
        title: [{ plain_text: "Q2" }],
      },
      Owner: {
        type: "people",
        people: [{ id: "u-1" }],
      },
      Score: { type: "number", number: 99 },
      Tags: {
        type: "multi_select",
        multi_select: [{ name: "alpha" }],
      },
    });
    expect(Object.keys(parsed)).toEqual(["Name", "Score"]);
    expect(parsed.Name).toEqual({ type: "title", value: "Q2" });
    expect(parsed.Score).toEqual({ type: "number", value: 99 });
    expect(skipped).toEqual([
      { name: "Owner", type: "people" },
      { name: "Tags", type: "multi_select" },
    ]);
  });

  it("returns empty maps for empty input", () => {
    expect(parseProperties({})).toEqual({ parsed: {}, skipped: [] });
  });
});
