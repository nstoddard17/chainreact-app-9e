import { z } from "zod";

/**
 * `create_repository` action schema.
 *
 * Slice 14b Batch 1. V1 reference:
 * [`github.ts:114-219`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/github.ts#L114).
 *
 * Required: `name`. Optional: `description`, `private`, `auto_init`,
 * `gitignore_template`, `license_template`, `homepage`.
 *
 * **No defaults at the schema layer.** V1 silently defaulted
 * `private = true` and `auto_init = true` — both are surface choices
 * a workflow author should make explicitly. V2 marks them optional
 * (no default) so the GitHub API receives them only when supplied,
 * and GitHub's own defaults (private=false, auto_init=false) take
 * effect when omitted. Workflow authors who want the V1 behavior set
 * the fields to `true` explicitly.
 *
 * `name` regex matches GitHub's repository-name rules: letters,
 * numbers, hyphens, underscores, periods. Length 1-100 (GitHub's
 * documented max).
 */
export const CreateRepositoryConfigSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(100)
      .regex(
        /^[A-Za-z0-9._-]+$/,
        "name may only contain letters, digits, '.', '_', '-'",
      ),
    description: z.string().min(1).optional(),
    private: z.boolean().optional(),
    auto_init: z.boolean().optional(),
    /** GitHub `.gitignore` template name (e.g. `"Node"`, `"Python"`). */
    gitignore_template: z.string().min(1).optional(),
    /** SPDX license keyword (e.g. `"mit"`, `"apache-2.0"`). */
    license_template: z.string().min(1).optional(),
    homepage: z.string().url().optional(),
  })
  .strict();

export type CreateRepositoryConfig = z.infer<typeof CreateRepositoryConfigSchema>;
