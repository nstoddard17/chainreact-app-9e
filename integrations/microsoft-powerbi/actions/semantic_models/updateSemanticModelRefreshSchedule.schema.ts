import { z } from "zod";

/**
 * Resolved-config schema for
 * `microsoft-powerbi:update_semantic_model_refresh_schedule`.
 *
 * Q11: `enabled` and `notifyOption` are REQUIRED with no silent default —
 * both are behavior-switching (enable/disable the schedule; owner email
 * on failure). `notifyOption` here is Power BI's ScheduleNotifyOption:
 * MailOnFailure | NoNotification only (MailOnCompletion is NOT valid for
 * schedules). `days`/`times`/`localTimeZoneId` are optional and sent only
 * when provided; `localTimeZoneId` is a WINDOWS time-zone id.
 */
export const UpdateSemanticModelRefreshScheduleConfigSchema = z
  .object({
    workspaceId: z.string().min(1),
    semanticModelId: z.string().min(1),
    enabled: z.boolean(),
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
      .optional(),
    times: z
      .array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/))
      .min(1)
      .max(48)
      .optional(),
    localTimeZoneId: z.string().min(1).optional(),
    notifyOption: z.enum(["MailOnFailure", "NoNotification"]),
  })
  .strict();

export type UpdateSemanticModelRefreshScheduleConfig = z.infer<
  typeof UpdateSemanticModelRefreshScheduleConfigSchema
>;
