import { z } from "zod";
import { edenPostContentShape, refinePlatformContent } from "./_content";

/** `eden:create_scheduling_draft` — save a post as a draft (no publish time, does NOT enqueue). */
export const CreateSchedulingDraftConfigSchema = z
  .object({ ...edenPostContentShape })
  .strict()
  .superRefine(refinePlatformContent);
export type CreateSchedulingDraftConfig = z.infer<typeof CreateSchedulingDraftConfigSchema>;
