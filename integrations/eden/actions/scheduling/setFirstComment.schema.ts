import { z } from "zod";

/**
 * `eden:set_first_comment` — attach/clear the auto first-comment on a draft/scheduled post.
 * Pass an empty `comment` to remove it. `afterLikes` (like threshold) and `delayMinutes` are
 * mutually exclusive (Eden lets `afterLikes` win, but we reject the ambiguous both-set case).
 */
export const SetFirstCommentConfigSchema = z
  .object({
    postId: z.string().min(1),
    comment: z.string().max(5000),
    afterLikes: z.number().int().min(1).optional(),
    delayMinutes: z.number().int().min(0).optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.afterLikes !== undefined && val.delayMinutes !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["delayMinutes"],
        message: "Use only one of 'after likes' or 'delay minutes', not both.",
      });
    }
  });
export type SetFirstCommentConfig = z.infer<typeof SetFirstCommentConfigSchema>;
