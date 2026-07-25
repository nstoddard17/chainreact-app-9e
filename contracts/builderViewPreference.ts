import { z } from "zod";

/**
 * Per-user default builder view (BUILDER-VIEW-DEFAULT-1).
 *
 * Which workspace view the workflow builder opens with for this user:
 * `"visual"` (canvas) or `"document"` (plain-language document). `null` means
 * "no default chosen — ask on a newly created workflow". Stored on
 * `user_profiles.default_builder_view`; shared by repo / service / route /
 * client / UI so the enum can never drift between layers.
 */
export const BuilderViewModeSchema = z.enum(["visual", "document"]);
export type BuilderViewModePref = z.infer<typeof BuilderViewModeSchema>;

export const DefaultBuilderViewSchema = BuilderViewModeSchema.nullable();
export type DefaultBuilderView = z.infer<typeof DefaultBuilderViewSchema>;
