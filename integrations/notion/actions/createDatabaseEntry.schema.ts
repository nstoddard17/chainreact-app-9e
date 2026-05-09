import { z } from "zod";
import { BlockSpecSchema } from "./appendBlockChildren.schema";
import {
  PropertyInputSchema,
  IconSchema,
  CoverSchema,
} from "./createPage.schema";

/**
 * Resolved-config schema for the Notion create_database_entry action.
 *
 * `databaseId` is required (database-only — no page-parent fallback;
 * that's what create_page is for).
 *
 * `properties` is required and must include the database's title
 * property to satisfy Notion's API. The schema doesn't know the
 * database's schema (no introspection in Slice 9), so it just enforces
 * that the map is non-empty.
 *
 * `children` / `icon` / `cover` follow the same shape as create_page.
 */
export const CreateDatabaseEntryConfigSchema = z
  .object({
    databaseId: z.string().min(1, "databaseId is required."),
    properties: z
      .record(PropertyInputSchema)
      .refine((p) => Object.keys(p).length > 0, {
        message: "properties must include at least one entry.",
      }),
    children: z.array(BlockSpecSchema).max(100).optional(),
    icon: IconSchema.optional(),
    cover: CoverSchema.optional(),
  })
  .strict();

export type CreateDatabaseEntryConfig = z.infer<
  typeof CreateDatabaseEntryConfigSchema
>;
