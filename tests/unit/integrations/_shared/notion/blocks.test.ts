/** @jest-environment node */
import {
  buildBlock,
  buildBlocks,
  SUPPORTED_BLOCK_TYPES,
  UnsupportedBlockTypeError,
} from "@/integrations/_shared/notion/blocks";

describe("Notion blocks — SUPPORTED_BLOCK_TYPES", () => {
  it("includes the 9 Slice 9 Batch 1 types in expected order", () => {
    expect(SUPPORTED_BLOCK_TYPES).toEqual([
      "paragraph",
      "heading_1",
      "heading_2",
      "heading_3",
      "bulleted_list_item",
      "numbered_list_item",
      "to_do",
      "quote",
      "divider",
    ]);
  });
});

describe("buildBlock — outbound", () => {
  it.each([
    ["paragraph"],
    ["heading_1"],
    ["heading_2"],
    ["heading_3"],
    ["bulleted_list_item"],
    ["numbered_list_item"],
    ["quote"],
  ] as const)(
    "%s wraps text in Notion's per-type rich-text payload",
    (type) => {
      const result = buildBlock({ type, text: "hello" }) as Record<
        string,
        unknown
      > & { [k: string]: { rich_text: unknown } };
      expect(result.object).toBe("block");
      expect(result.type).toBe(type);
      expect(result[type]).toEqual({
        rich_text: [{ type: "text", text: { content: "hello" } }],
      });
    },
  );

  it("to_do includes checked: boolean (defaults false when omitted)", () => {
    const checked = buildBlock({ type: "to_do", text: "x", checked: true }) as unknown as {
      to_do: { rich_text: unknown; checked: boolean };
    };
    const unchecked = buildBlock({ type: "to_do", text: "y" }) as unknown as {
      to_do: { rich_text: unknown; checked: boolean };
    };
    expect(checked.to_do.checked).toBe(true);
    expect(unchecked.to_do.checked).toBe(false);
  });

  it("divider has empty payload object", () => {
    expect(buildBlock({ type: "divider" })).toEqual({
      object: "block",
      type: "divider",
      divider: {},
    });
  });

  it("falls back to empty string when text is missing on a text-bearing block", () => {
    const result = buildBlock({ type: "paragraph" }) as unknown as {
      paragraph: { rich_text: Array<{ text: { content: string } }> };
    };
    expect(result.paragraph.rich_text[0]!.text.content).toBe("");
  });

  it.each([
    "code",
    "image",
    "embed",
    "callout",
    "toggle",
    "column_list",
    "table",
    "child_database",
    "child_page",
    "synced_block",
  ])("throws UnsupportedBlockTypeError on deferred type %s", (type) => {
    expect(() => buildBlock({ type, text: "x" })).toThrow(
      UnsupportedBlockTypeError,
    );
  });

  it("throws on missing type", () => {
    expect(() => buildBlock({})).toThrow(UnsupportedBlockTypeError);
  });

  it("throws on non-object input", () => {
    expect(() => buildBlock(null)).toThrow(UnsupportedBlockTypeError);
    expect(() => buildBlock("paragraph")).toThrow(UnsupportedBlockTypeError);
  });

  it("error message lists the supported set + deferred set", () => {
    expect.assertions(3);
    try {
      buildBlock({ type: "code", text: "x" });
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain("code");
      expect(msg).toContain("paragraph");
      expect(msg).toContain("Deferred");
    }
  });
});

describe("buildBlocks", () => {
  it("maps each spec through buildBlock", () => {
    const result = buildBlocks([
      { type: "heading_1", text: "Title" },
      { type: "paragraph", text: "Body" },
      { type: "divider" },
    ]);
    expect(result).toHaveLength(3);
    expect(result[0]!.type).toBe("heading_1");
    expect(result[1]!.type).toBe("paragraph");
    expect(result[2]!.type).toBe("divider");
  });

  it("throws on the first unsupported block (no partial array)", () => {
    expect(() =>
      buildBlocks([
        { type: "paragraph", text: "ok" },
        { type: "image", external: { url: "x" } },
      ]),
    ).toThrow(UnsupportedBlockTypeError);
  });

  it("returns empty array for empty input", () => {
    expect(buildBlocks([])).toEqual([]);
  });
});
