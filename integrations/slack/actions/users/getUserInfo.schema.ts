import { z } from "zod";

/**
 * Resolved-config schema for the Slack get_user_info action
 * (Slack 2.3 Commit 4).
 *
 * Reads a single user object by id via `users.info`.
 *
 * `user` is a Slack user id of shape `^U[A-Z0-9]+$`. Slack 2.3
 * contract is id-only (parity with the channel-id discipline in
 * Slack 2.3 plan §5.1) — workflow authors that have only a name
 * compose `list_users` upstream and select the id.
 *
 * V1's union of (string, object, JSON-encoded-string) for `user` is
 * intentionally NOT ported — the resolved-config path through the
 * engine pre-resolver supplies a concrete string.
 *
 * `.strict()` rejects unknown keys.
 */
export const GetUserInfoConfigSchema = z
  .object({
    user: z.string().regex(/^U[A-Z0-9]+$/, "user must be a Slack user id (U…)."),
  })
  .strict();
export type GetUserInfoConfig = z.infer<typeof GetUserInfoConfigSchema>;
