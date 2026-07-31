import { z } from "zod";
import { MobileAccountIdSchema } from "./accounts";

/**
 * Canonical in-app navigation targets.
 *
 * A deep link is a NAVIGATION HINT, never an authority: every target resolves
 * through the authed `/api/mobile/v1` endpoints, so a tampered or stale link
 * can only ever produce the standard not-available screen. Targets carry
 * opaque ids and nothing else — no tokens (the invitation-accept raw-token
 * link is exactly why invitations are not a v1 deep-link target).
 *
 * All variants `.strict()` so an unexpected extra field (e.g. a smuggled
 * token or URL) fails parsing instead of riding along.
 */
export const MobileDeepLinkTargetSchema = z.discriminatedUnion("screen", [
  z
    .object({
      screen: z.literal("run-detail"),
      accountId: MobileAccountIdSchema,
      workflowId: z.string().uuid(),
      runId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      screen: z.literal("workflow-detail"),
      accountId: MobileAccountIdSchema,
      workflowId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      screen: z.literal("notifications"),
    })
    .strict(),
  z
    .object({
      screen: z.literal("integration-health"),
      accountId: MobileAccountIdSchema,
    })
    .strict(),
]);
export type MobileDeepLinkTarget = z.infer<typeof MobileDeepLinkTargetSchema>;
