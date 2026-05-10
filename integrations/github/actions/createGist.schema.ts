import { z } from "zod";

/**
 * `create_gist` action schema.
 *
 * Slice 14b Batch 1. V1 reference:
 * [`github.ts:362-449`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/github.ts#L362).
 *
 * Required: `filename`, `content`, `isPublic`. Optional: `description`.
 *
 * **`isPublic` is REQUIRED with NO default.** V1 silently defaulted
 * to `false` (secret gist). Public gists are world-readable and
 * fully indexed by search engines; the workflow author MUST
 * explicitly choose true / false. Mirrors Slice 12's `send_receipt`
 * Q11 consent gate pattern.
 *
 * `filename` accepts the most common GitHub gist patterns:
 * letters, digits, `.`, `_`, `-`, and a single optional path
 * component (e.g. `snippet.ts`, `My_Gist-1.md`). Multi-file gists
 * deferred to a future slice.
 */
export const CreateGistConfigSchema = z
  .object({
    filename: z
      .string()
      .min(1)
      .max(255)
      .regex(
        /^[A-Za-z0-9._-]+$/,
        "filename may only contain letters, digits, '.', '_', '-' (single-file gists only in Batch 1)",
      ),
    content: z.string().min(1),
    description: z.string().min(1).optional(),
    /**
     * **Required, no default.** Public gists are world-readable.
     * Mirrors Slice 12's `send_receipt` consent-gate pattern.
     */
    isPublic: z.boolean(),
  })
  .strict();

export type CreateGistConfig = z.infer<typeof CreateGistConfigSchema>;
