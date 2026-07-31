import { z } from "zod";
import { MobileAccountIdSchema } from "./accounts";

/**
 * The `data` payload of a native push notification.
 *
 * Identifiers and a type tag ONLY. Presentation text (title/body) travels in
 * the platform notification fields, produced by the server's no-leak payload
 * builders. `.strict()` — a payload smuggling a token, provider data, or any
 * extra field fails to parse and the tap falls back to opening the
 * notifications screen. `v` pins the payload's schema generation so an old
 * app can detect a payload it does not understand.
 */
export const MOBILE_PUSH_EVENT_TYPES = [
  "workflow_failed",
  "integration_reconnect_needed",
] as const;
export const MobilePushEventTypeSchema = z.enum(MOBILE_PUSH_EVENT_TYPES);
export type MobilePushEventType = z.infer<typeof MobilePushEventTypeSchema>;

export const MobilePushDataSchema = z
  .object({
    v: z.literal(1),
    type: MobilePushEventTypeSchema,
    accountId: MobileAccountIdSchema,
    notificationId: z.string().uuid(),
    workflowId: z.string().uuid().optional(),
    runId: z.string().uuid().optional(),
  })
  .strict();
export type MobilePushData = z.infer<typeof MobilePushDataSchema>;
