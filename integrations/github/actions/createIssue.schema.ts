import { z } from "zod";

/**
 * `create_issue` action schema.
 *
 * Slice 14b Batch 1. V1 reference:
 * [`github.ts:11-112`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/github.ts#L11).
 *
 * Required: `repository` (`owner/repo`), `title`. Optional: `body`,
 * `labels[]`, `assignees[]`, `milestone`. V1's defaults (`labels = []`,
 * `assignees = []`) become "omit when undefined" at the wrapper layer
 * — explicit empty arrays from the workflow author are accepted and
 * skipped at the wrapper level so the GitHub API never sees a
 * spurious empty `labels: []` (some integrations care).
 */
export const CreateIssueConfigSchema = z
  .object({
    /**
     * `owner/repo` — must contain exactly one slash, with non-empty
     * segments on each side. The handler narrows further via
     * `parseRepository` for defense-in-depth.
     */
    repository: z
      .string()
      .regex(
        /^[^/\s]+\/[^/\s]+$/,
        "repository must be in 'owner/repo' format (e.g. 'octocat/hello-world')",
      ),
    title: z.string().min(1),
    body: z.string().min(1).optional(),
    labels: z.array(z.string().min(1)).optional(),
    assignees: z.array(z.string().min(1)).optional(),
    /** Numeric milestone id (NOT the milestone title — GitHub uses the id). */
    milestone: z.number().int().positive().optional(),
  })
  .strict();

export type CreateIssueConfig = z.infer<typeof CreateIssueConfigSchema>;
