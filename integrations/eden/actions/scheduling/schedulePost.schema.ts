import { z } from "zod";
import { edenPostContentShape, refinePlatformContent } from "./_content";

/**
 * `eden:schedule_post` — enqueue a post for publishing at an explicit FUTURE time. This is a real
 * scheduling write that WILL publish publicly at the given time. The time must be in the future —
 * a past time is rejected pre-flight so a stale timestamp can never trigger an immediate publish.
 */
export const SchedulePostConfigSchema = z
  .object({
    ...edenPostContentShape,
    scheduledAtIso: z
      .string()
      .datetime({ offset: true })
      .refine((iso) => {
        const t = Date.parse(iso);
        return Number.isFinite(t) && t > Date.now();
      }, "The scheduled time must be in the future."),
  })
  .strict()
  .superRefine(refinePlatformContent);
export type SchedulePostConfig = z.infer<typeof SchedulePostConfigSchema>;
