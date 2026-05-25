import { z } from "zod";

/**
 * Resolved-config schema for the native `format_transformer` action.
 *
 * Per docs/rules/variable-resolver.md §"Engine pre-resolution (strict)":
 *   - The engine substitutes every `{{...}}` reference in config BEFORE
 *     dispatching the handler. The schema receives concrete strings only.
 *   - The handler also re-parses with this schema for defense-in-depth.
 *
 * Q11 (no hidden defaults): `targetFormat` is REQUIRED. `sourceFormat`
 * defaults to `"auto"` (the only safe default — detection is bounded and
 * deterministic).
 *
 * Caps locked at plan time
 * (docs/slices/parity/native-nodes-1-tier-a-plan.md §5.2):
 *   - Content ≤ 1 MiB UTF-8 string length.
 *   - Output ≤ 2 MiB (enforced at handler level; overflow throws).
 *
 * Per Slice 1 commit brief: V1's `preserveVariables` cosmetic flag and
 * test-mode branch are deliberately NOT ported — `.strict()` rejects
 * them at parse time, so stale workflow configs fail loudly instead of
 * silently producing wrong output.
 */

export const FormatTransformerTargetFormatSchema = z.enum([
  "html",
  "markdown",
  "plain",
  "slack_markdown",
]);
export type FormatTransformerTargetFormat = z.infer<
  typeof FormatTransformerTargetFormatSchema
>;

export const FormatTransformerSourceFormatSchema = z.enum([
  "html",
  "markdown",
  "plain",
  "auto",
]);
export type FormatTransformerSourceFormat = z.infer<
  typeof FormatTransformerSourceFormatSchema
>;

export const FormatTransformerConfigSchema = z
  .object({
    content: z.string().min(0).max(1_048_576),
    sourceFormat: FormatTransformerSourceFormatSchema.default("auto"),
    targetFormat: FormatTransformerTargetFormatSchema,
  })
  .strict();
export type FormatTransformerConfig = z.infer<
  typeof FormatTransformerConfigSchema
>;
