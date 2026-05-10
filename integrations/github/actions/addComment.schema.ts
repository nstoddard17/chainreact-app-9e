import { z } from "zod";

/**
 * `add_comment` action schema.
 *
 * Slice 14b Batch 1. V1 reference:
 * [`github.ts:565-650`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/github.ts#L565).
 *
 * Required: `repository`, `issueNumber`, `body`.
 *
 * GitHub uses the same endpoint
 * (`/repos/{owner}/{repo}/issues/{number}/comments`) for both issue
 * comments and PR comments — PRs are issues from the comment API's
 * perspective. Workflow authors can use this single action for either.
 *
 * `issueNumber` accepts numbers OR numeric strings. The schema
 * coerces strings → numbers (workflow variables often arrive as
 * strings since they're rendered through the resolver).
 */
export const AddCommentConfigSchema = z
  .object({
    repository: z
      .string()
      .regex(
        /^[^/\s]+\/[^/\s]+$/,
        "repository must be in 'owner/repo' format (e.g. 'octocat/hello-world')",
      ),
    issueNumber: z.coerce
      .number()
      .int()
      .positive(),
    body: z.string().min(1),
  })
  .strict();

export type AddCommentConfig = z.infer<typeof AddCommentConfigSchema>;
