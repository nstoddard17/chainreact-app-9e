import { z } from "zod";

/**
 * Resolved-config schema for
 * `microsoft-powerbi:update_dataflow_refresh_schedule`.
 *
 * Q11: `enabled` and `notifyOption` are REQUIRED with no silent
 * default — enabling/disabling a schedule and owner-notification
 * behavior are behavior-switching. `days` / `times` /
 * `localTimeZoneId` are optional PATCH fields: only provided fields
 * are sent, absent ones keep their provider-side values.
 *
 * `times` entries are "HH:MM" 24-hour local times (max 48 — one per
 * half hour). `localTimeZoneId` is a Windows time-zone id (e.g. `UTC`,
 * `Pacific Standard Time`).
 */
export const UpdateDataflowRefreshScheduleConfigSchema = z
  .object({
    workspaceId: z.string().min(1),
    dataflowId: z.string().min(1),
    enabled: z.boolean(),
    notifyOption: z.enum(["MailOnFailure", "NoNotification"]),
    days: z
      .array(
        z.enum([
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ]),
      )
      .min(1)
      .max(7)
      .optional(),
    times: z
      .array(
        z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Times must be "HH:MM" (24-hour).'),
      )
      .min(1)
      .max(48)
      .optional(),
    localTimeZoneId: z.string().min(1).max(128).optional(),
  })
  .strict();

export type UpdateDataflowRefreshScheduleConfig = z.infer<
  typeof UpdateDataflowRefreshScheduleConfigSchema
>;
