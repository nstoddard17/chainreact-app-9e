import { z } from "zod";
import { SUPPORTED_PROPERTY_TYPES } from "@/integrations/_shared/notion/properties";

/**
 * Resolved-config schema for the Notion `create_database` action.
 *
 * Notion 2.1 Commit 4 — database/block read actions.
 *
 * Inputs (strict):
 *   - `parentPageId` — required. Page id under which the database is
 *     created. Workspace-level databases are NOT supported in this
 *     batch (rare; defer to on-demand follow-up).
 *   - `title` — required plain-text database title. Wrapper synthesizes
 *     the Notion rich_text array; raw rich_text passthrough is NOT
 *     supported.
 *   - `description` — optional plain-text. Same synthesis pattern.
 *   - `isInline` — optional boolean. Q11 — undefined is omitted from
 *     the request body (Notion's default is false).
 *   - `properties` — required map keyed by property name. Each value
 *     is `{ type: <SupportedPropertyType> }`. Notion requires EXACTLY
 *     one property of type "title" — schema refinement enforces it.
 *
 * Notion 2.1 Commit 4 supports the 9 V2 SupportedPropertyType members
 * for database column schemas. Option-set configuration (select /
 * status options) is NOT supported in this batch — workflow authors
 * configure options manually in Notion's UI after creation, or wait
 * for a future expanded action.
 */
const PropertyTypeSchema = z.enum(
  SUPPORTED_PROPERTY_TYPES as readonly [string, ...string[]],
);

const PropertyDescriptorSchema = z
  .object({
    type: PropertyTypeSchema,
  })
  .strict();

export const CreateDatabaseConfigSchema = z
  .object({
    parentPageId: z.string().min(1, "parentPageId is required."),
    title: z.string().min(1, "title is required."),
    description: z.string().min(1).optional(),
    isInline: z.boolean().optional(),
    properties: z
      .record(PropertyDescriptorSchema)
      .refine((p) => Object.keys(p).length >= 1, {
        message: "properties must declare at least one property.",
      }),
  })
  .strict()
  .refine(
    (v) => {
      const titleCount = Object.values(v.properties).filter(
        (d) => d.type === "title",
      ).length;
      return titleCount === 1;
    },
    {
      message:
        "Notion databases require EXACTLY ONE property of type 'title'.",
      path: ["properties"],
    },
  );

export type CreateDatabaseConfig = z.infer<typeof CreateDatabaseConfigSchema>;
