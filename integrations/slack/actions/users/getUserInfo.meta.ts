import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `slack:get_user_info`.
 *
 * Mirrors `getUserInfo.schema.ts`:
 *   - `user` (required) — Slack user id (`^U[A-Z0-9]+$`). Stays `text`
 *                         for v1; a future `slack:users` resolver slice
 *                         (3.39+) will flip to combobox.
 *
 * Required scope: `users:read` (granted).
 *
 * Outputs mirror `getUserInfo.ts:return` — full Slack user object plus
 * salient bounded scalars (id, name, real_name, display_name, is_admin,
 * is_owner, is_bot, tz, image_192).
 */
export const slackGetUserInfoMeta: ActionMeta = {
  key: "slack:get_user_info",
  provider: "slack",
  type: "get_user_info",
  displayName: "Get User Info",
  description:
    "Read a Slack user's profile by id via users.info. Returns the full Slack user record plus bounded scalars for direct variable wiring.",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    {
      name: "user",
      label: "User",
      description:
        "Pick a workspace user, or paste / wire a Slack user id (U-prefixed) such as `{{trigger.user}}`.",
      type: "combobox",
      optionsSource: "slack:users",
      allowManualEntry: true,
      required: true,
      placeholder: "Search users or paste a user ID",
    },
  ],
  outputs: [
    {
      name: "user",
      type: "object",
      description:
        "Full Slack user record as returned by users.info. Drill into specific profile fields via the variable picker. Marked sensitive — the full record may include `profile.email` and other PII fields depending on bot scopes; the object redacts from the run-detail API and variable picker preview (bounded scalars below stay visible).",
      sensitive: true,
    },
    {
      name: "id",
      type: "string",
      description: "Slack user id (U…).",
    },
    {
      name: "name",
      type: "string",
      description: "Slack handle (workspace-unique).",
    },
    {
      name: "real_name",
      type: "string",
      description: "User's real name as registered with Slack.",
    },
    {
      name: "display_name",
      type: "string",
      description:
        "User's preferred display name (from profile.display_name; may be empty).",
    },
    {
      name: "is_admin",
      type: "boolean",
      description: "True when the user is a workspace admin.",
    },
    {
      name: "is_owner",
      type: "boolean",
      description: "True when the user is the workspace owner.",
    },
    {
      name: "is_bot",
      type: "boolean",
      description: "True when the user is a bot account.",
    },
    {
      name: "tz",
      type: "string",
      description: "IANA timezone identifier as Slack stores it (e.g. America/Los_Angeles).",
    },
    {
      name: "image_192",
      type: "string",
      description: "192px avatar URL from the user's profile.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 280,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
