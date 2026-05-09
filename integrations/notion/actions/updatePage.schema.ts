import { z } from "zod";
import {
  PropertyInputSchema,
  IconSchema,
  CoverSchema,
} from "./createPage.schema";

/**
 * Resolved-config schema for the Notion update_page action.
 *
 * `pageId` is required.
 *
 * `properties` / `archived` / `icon` / `cover` are all optional.
 * Per Q11 — undefined fields are omitted from the PATCH body, so the
 * action does NOT make assertions about properties the user didn't set.
 * Setting `archived: true` archives; `archived: false` un-archives;
 * omitting it leaves the archived state alone.
 */
export const UpdatePageConfigSchema = z
  .object({
    pageId: z.string().min(1, "pageId is required."),
    properties: z.record(PropertyInputSchema).optional(),
    archived: z.boolean().optional(),
    icon: IconSchema.nullable().optional(),
    cover: CoverSchema.nullable().optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.properties !== undefined ||
      v.archived !== undefined ||
      v.icon !== undefined ||
      v.cover !== undefined,
    {
      message:
        "update_page requires at least one of: properties, archived, icon, cover.",
    },
  );

export type UpdatePageConfig = z.infer<typeof UpdatePageConfigSchema>;
