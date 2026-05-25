import { z } from "zod";
import { BlockSpecSchema } from "./appendBlockChildren.schema";

/**
 * Resolved-config schema for the Notion create_page action.
 *
 * Q11 — explicit fields, no hidden defaults:
 *   - `parent` is a discriminated union: `{ databaseId }` or `{ pageId }`.
 *     V1 silently dispatched on a `parentType` string; V2 makes the
 *     choice type-explicit. Workflow MUST pick one; no fallback.
 *   - `properties` is a typed property-input map (each entry has its
 *     own `type` discriminator + `value`). The handler runs each
 *     entry through `formatPropertyValue`, which throws
 *     `UnsupportedPropertyTypeError` for any of the 7 deferred types
 *     (relation, people, files, rollup, formula, multi_select, status).
 *   - `children` is optional — when present, must use Slice 9 Batch 1's
 *     9 supported block types (validated by `BlockSpecSchema`).
 *   - `icon` and `cover` are optional, typed unions.
 */

const PropertyInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("title"), value: z.string() }),
  z.object({ type: z.literal("rich_text"), value: z.string() }),
  z.object({ type: z.literal("number"), value: z.number().nullable() }),
  z.object({ type: z.literal("select"), value: z.string().nullable() }),
  z.object({ type: z.literal("checkbox"), value: z.boolean() }),
  z.object({
    type: z.literal("date"),
    value: z.union([
      z.string(),
      z.object({ start: z.string(), end: z.string().optional() }),
      z.null(),
    ]),
  }),
  z.object({ type: z.literal("url"), value: z.string().nullable() }),
  z.object({ type: z.literal("email"), value: z.string().nullable() }),
  z.object({
    type: z.literal("phone_number"),
    value: z.string().nullable(),
  }),
]);

const ParentSchema = z.union([
  z.object({ databaseId: z.string().min(1) }).strict(),
  z.object({ pageId: z.string().min(1) }).strict(),
]);

const IconSchema = z.union([
  z.object({ type: z.literal("emoji"), emoji: z.string().min(1) }),
  z.object({
    type: z.literal("external"),
    external: z.object({ url: z.string().url() }),
  }),
]);

const CoverSchema = z.object({
  type: z.literal("external"),
  external: z.object({ url: z.string().url() }),
});

export const CreatePageConfigSchema = z
  .object({
    parent: ParentSchema,
    properties: z.record(PropertyInputSchema),
    children: z.array(BlockSpecSchema).max(100).optional(),
    icon: IconSchema.optional(),
    cover: CoverSchema.optional(),
  })
  .strict();

export type CreatePageConfig = z.infer<typeof CreatePageConfigSchema>;

// Re-export for callers that need to share the property-input shape
// (e.g., createDatabaseEntry has the same shape minus `parent`).
export { PropertyInputSchema, IconSchema, CoverSchema };
