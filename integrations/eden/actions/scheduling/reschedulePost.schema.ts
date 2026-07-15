import { z } from "zod";

/**
 * `eden:reschedule_post` — change ONLY the publish time of a draft/scheduled post (content kept).
 * The time must be in the FUTURE — a past time is rejected pre-flight so a stale timestamp can
 * never cause an accidental immediate/near-immediate publish.
 */
export const ReschedulePostConfigSchema = z
  .object({
    postId: z.string().min(1),
    scheduleId: z.string().optional(),
    scheduledAtIso: z
      .string()
      .datetime({ offset: true })
      .refine((iso) => {
        const t = Date.parse(iso);
        return Number.isFinite(t) && t > Date.now();
      }, "The scheduled time must be in the future."),
    timezone: z.string().max(64).optional(),
  })
  .strict();
export type ReschedulePostConfig = z.infer<typeof ReschedulePostConfigSchema>;
