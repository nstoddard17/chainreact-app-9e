/**
 * Typed Notion block specs — Slice 9 Commit 3.
 *
 * Notion's block system is type-discriminated. Each block has its own
 * payload shape; rich-text blocks (paragraphs, headings, list items,
 * to-dos, quotes) wrap their text in an array of rich-text segments;
 * structural blocks (divider) carry an empty payload object.
 *
 * Slice 9 Batch 1 — 9 supported block types (per
 * docs/slices/slice-9-notion.md §"In-scope action list" and the
 * Commit 1 plan):
 *   - paragraph
 *   - heading_1
 *   - heading_2
 *   - heading_3
 *   - bulleted_list_item
 *   - numbered_list_item
 *   - to_do
 *   - quote
 *   - divider
 *
 * Deferred — explicitly throw `UnsupportedBlockTypeError`:
 *   - code, image, embed, callout, toggle, column_list, table,
 *     child_database, child_page, synced_block (all useful but each
 *     has a meaningful UX surface beyond Batch 1's "let me append text
 *     content" pattern)
 *
 * Used by:
 *   - `integrations/notion/actions/appendBlockChildren.ts` to coerce
 *     typed block specs into Notion's wire-format children array.
 *   - `integrations/notion/actions/{createPage,createDatabaseEntry}.ts`
 *     when the user supplies an optional `children` array of typed
 *     block specs.
 */

/**
 * The 9 block types Slice 9 Batch 1 supports. Future slices extend by
 * adding to this union AND adding cases to `buildBlock`.
 */
export type SupportedBlockType =
  | "paragraph"
  | "heading_1"
  | "heading_2"
  | "heading_3"
  | "bulleted_list_item"
  | "numbered_list_item"
  | "to_do"
  | "quote"
  | "divider";

export const SUPPORTED_BLOCK_TYPES: ReadonlyArray<SupportedBlockType> = [
  "paragraph",
  "heading_1",
  "heading_2",
  "heading_3",
  "bulleted_list_item",
  "numbered_list_item",
  "to_do",
  "quote",
  "divider",
];

function isSupported(type: string): type is SupportedBlockType {
  return (SUPPORTED_BLOCK_TYPES as ReadonlyArray<string>).includes(type);
}

/**
 * Thrown by `buildBlock` when called with a block type outside Slice 9
 * Batch 1's supported set.
 */
export class UnsupportedBlockTypeError extends Error {
  readonly blockType: string;
  readonly supportedTypes: readonly string[];
  constructor(blockType: string) {
    super(
      `Notion block type '${blockType}' is not supported in Slice 9 Batch 1. Supported: ${SUPPORTED_BLOCK_TYPES.join(", ")}. Deferred: code, image, embed, callout, toggle, column_list, table, child_database, child_page, synced_block.`,
    );
    this.name = "UnsupportedBlockTypeError";
    this.blockType = blockType;
    this.supportedTypes = SUPPORTED_BLOCK_TYPES;
  }
}

/**
 * Typed input for each supported block type. All rich-text-bearing
 * blocks take a single `text` string; the helper wraps it in Notion's
 * `rich_text` array. `to_do` carries an optional `checked` boolean
 * (defaults to `false` when omitted — matches Notion's wire default
 * but documented explicitly here).
 *
 * The `divider` variant has no payload.
 */
export type BlockSpec =
  | { type: "paragraph"; text: string }
  | { type: "heading_1"; text: string }
  | { type: "heading_2"; text: string }
  | { type: "heading_3"; text: string }
  | { type: "bulleted_list_item"; text: string }
  | { type: "numbered_list_item"; text: string }
  | { type: "to_do"; text: string; checked?: boolean }
  | { type: "quote"; text: string }
  | { type: "divider" };

/**
 * The wire-format Notion expects for each block in the children array.
 * Discriminator: `type`; payload at `[type]`.
 */
export interface NotionBlockBody {
  object: "block";
  type: SupportedBlockType;
  [discriminator: string]: unknown;
}

function richTextOf(s: string): Array<{ type: "text"; text: { content: string } }> {
  return [{ type: "text", text: { content: s } }];
}

/**
 * Coerce a typed block spec into Notion's wire-format block body.
 * Throws `UnsupportedBlockTypeError` when the type is outside Slice 9
 * Batch 1's supported set.
 *
 * Inputs are unknown-typed at the call boundary so this function can
 * be called from a Zod-parsed `children: unknown[]` array without an
 * extra cast. The `BlockSpec` type drives the typed call sites
 * (appendBlockChildren handler).
 */
export function buildBlock(spec: unknown): NotionBlockBody {
  if (!spec || typeof spec !== "object") {
    throw new UnsupportedBlockTypeError("<not-an-object>");
  }
  const obj = spec as { type?: string; text?: string; checked?: boolean };
  const type = obj.type;
  if (!type || !isSupported(type)) {
    throw new UnsupportedBlockTypeError(type ?? "<missing>");
  }
  switch (type) {
    case "paragraph":
      return {
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: richTextOf(obj.text ?? "") },
      };
    case "heading_1":
      return {
        object: "block",
        type: "heading_1",
        heading_1: { rich_text: richTextOf(obj.text ?? "") },
      };
    case "heading_2":
      return {
        object: "block",
        type: "heading_2",
        heading_2: { rich_text: richTextOf(obj.text ?? "") },
      };
    case "heading_3":
      return {
        object: "block",
        type: "heading_3",
        heading_3: { rich_text: richTextOf(obj.text ?? "") },
      };
    case "bulleted_list_item":
      return {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: richTextOf(obj.text ?? "") },
      };
    case "numbered_list_item":
      return {
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: { rich_text: richTextOf(obj.text ?? "") },
      };
    case "to_do":
      return {
        object: "block",
        type: "to_do",
        to_do: {
          rich_text: richTextOf(obj.text ?? ""),
          checked: Boolean(obj.checked),
        },
      };
    case "quote":
      return {
        object: "block",
        type: "quote",
        quote: { rich_text: richTextOf(obj.text ?? "") },
      };
    case "divider":
      return {
        object: "block",
        type: "divider",
        divider: {},
      };
    default: {
      const _exhaustive: never = type;
      void _exhaustive;
      throw new UnsupportedBlockTypeError(type);
    }
  }
}

/**
 * Convenience for building the full children array. Maps each spec
 * through `buildBlock`. Throws on the first unsupported block — better
 * to fail loud than partial-write.
 */
export function buildBlocks(specs: ReadonlyArray<unknown>): NotionBlockBody[] {
  return specs.map(buildBlock);
}
