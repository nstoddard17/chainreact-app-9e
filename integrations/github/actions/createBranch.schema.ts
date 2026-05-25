import { z } from "zod";

/**
 * `create_branch` action schema.
 *
 * Slice 14b Batch 1. V1 reference:
 * [`github.ts:454-560`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/github.ts#L454).
 *
 * Required: `repository`, `branchName`. Optional: `sourceBranch`.
 *
 * **PR-G6 extension to `create_branch` (V2 fix).** V1 hard-defaults
 * `sourceBranch = "main"` ([github.ts:465](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/github.ts#L465))
 * — same `'main'`-guess rot PR-G6 fixed for `create_pull_request`.
 * V2 extends the auto-detect: when the workflow author leaves
 * `sourceBranch` blank, the handler resolves the repo's
 * `default_branch` via `resolveDefaultBranch`. Fail-closed; never
 * a silent `'main'` fallback.
 *
 * `branchName` validated against GitHub's allowable ref-name rules:
 * no spaces, no `..`, no leading `-`, no leading/trailing `/`, no
 * trailing `.lock`. The schema's regex enforces the most common
 * subset (anything stricter belongs in a follow-up surface
 * validation).
 */
export const CreateBranchConfigSchema = z
  .object({
    repository: z
      .string()
      .regex(
        /^[^/\s]+\/[^/\s]+$/,
        "repository must be in 'owner/repo' format (e.g. 'octocat/hello-world')",
      ),
    branchName: z
      .string()
      .min(1)
      .max(255)
      .regex(
        /^[A-Za-z0-9._/-]+$/,
        "branchName may only contain letters, digits, '.', '_', '/', '-'",
      )
      .refine((s) => !s.startsWith("-"), "branchName must not start with '-'")
      .refine((s) => !s.startsWith("/"), "branchName must not start with '/'")
      .refine((s) => !s.endsWith("/"), "branchName must not end with '/'")
      .refine((s) => !s.endsWith(".lock"), "branchName must not end with '.lock'")
      .refine((s) => !s.includes(".."), "branchName must not contain '..'"),
    /**
     * When omitted/empty, the handler auto-detects the repo's
     * default branch via `reposGet` (V2 PR-G6 extension). V1's
     * `'main'` default is replaced by fail-closed default-branch
     * resolution.
     */
    sourceBranch: z.string().min(1).optional(),
  })
  .strict();

export type CreateBranchConfig = z.infer<typeof CreateBranchConfigSchema>;
