import { z } from "zod";

/**
 * Resolved-config schema for the Notion get_page action.
 *
 * `pageId` is required. No optional fields — strict mode rejects any
 * extras (Q11). The handler returns the page object plus parsed
 * properties for the 9 in-scope property types; unsupported properties
 * surface in the `skippedProperties` output field rather than throwing.
 */
export const GetPageConfigSchema = z
  .object({
    pageId: z.string().min(1, "pageId is required."),
  })
  .strict();

export type GetPageConfig = z.infer<typeof GetPageConfigSchema>;
