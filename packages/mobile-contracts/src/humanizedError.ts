import { z } from "zod";

/**
 * The humanized failure explanation — the ONLY error surface a run ever shows
 * a mobile user. Mirrors `HumanizedErrorSchema` in `contracts/workflow.ts`
 * (parity-tested in the web repo): title/description/hint are pre-sanitized
 * server copy; `action` is the primary next-step token; raw provider text,
 * engine codes, and stack traces never appear here by server construction.
 *
 * Web CTA hrefs are NOT carried — mobile maps `action` to its own navigation.
 */
export const MOBILE_HUMANIZED_ERROR_ACTIONS = [
  "reconnect",
  "open_node",
  "retry_later",
  "upgrade_plan",
  "review_pending",
  "link_vehicles",
  "contact_support",
] as const;

export const MobileHumanizedErrorSchema = z.object({
  title: z.string(),
  description: z.string(),
  hint: z.string().optional(),
  action: z.enum(MOBILE_HUMANIZED_ERROR_ACTIONS).optional(),
  severity: z.enum(["warning", "error"]),
});
export type MobileHumanizedError = z.infer<typeof MobileHumanizedErrorSchema>;
