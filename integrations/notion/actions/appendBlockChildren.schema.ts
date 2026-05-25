import { z } from "zod";

/**
 * Resolved-config schema for the Notion append_block_children action.
 *
 * `blockId` is required — accepts either a block id or a page id
 * (Notion treats pages as block parents).
 *
 * `children` is a non-empty array of typed block specs. Each spec
 * matches Slice 9 Batch 1's 9 supported block types — the schema
 * discriminates on `type` and validates the per-type payload (text /
 * checked). Unsupported block types fail the schema before reaching
 * the wrapper. Notion enforces a hard 100-children-per-request cap.
 */

const TextBlockSchema = z.object({
  type: z.enum([
    "paragraph",
    "heading_1",
    "heading_2",
    "heading_3",
    "bulleted_list_item",
    "numbered_list_item",
    "quote",
  ]),
  text: z.string(),
});

const ToDoBlockSchema = z.object({
  type: z.literal("to_do"),
  text: z.string(),
  checked: z.boolean().optional(),
});

const DividerBlockSchema = z.object({
  type: z.literal("divider"),
});

export const BlockSpecSchema = z.discriminatedUnion("type", [
  // discriminatedUnion requires literal types — split TextBlockSchema
  // into per-type variants so the discriminator is always literal.
  z.object({ type: z.literal("paragraph"), text: z.string() }),
  z.object({ type: z.literal("heading_1"), text: z.string() }),
  z.object({ type: z.literal("heading_2"), text: z.string() }),
  z.object({ type: z.literal("heading_3"), text: z.string() }),
  z.object({ type: z.literal("bulleted_list_item"), text: z.string() }),
  z.object({ type: z.literal("numbered_list_item"), text: z.string() }),
  z.object({ type: z.literal("quote"), text: z.string() }),
  ToDoBlockSchema,
  DividerBlockSchema,
]);

export const AppendBlockChildrenConfigSchema = z
  .object({
    blockId: z.string().min(1, "blockId is required."),
    children: z
      .array(BlockSpecSchema)
      .min(1, "children must have at least one block.")
      .max(100, "Notion's append-children API caps children at 100 per request."),
  })
  .strict();

export type AppendBlockChildrenConfig = z.infer<
  typeof AppendBlockChildrenConfigSchema
>;

// TextBlockSchema is no longer used — the discriminated union inlines
// each text-bearing variant. Re-exported for tests that want to assert
// "the seven text-bearing block types share a shape" if needed.
export { TextBlockSchema };
