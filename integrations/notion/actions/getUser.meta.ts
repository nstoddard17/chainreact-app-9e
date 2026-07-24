import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `notion:get_user`.
 *
 * Mirrors `getUser.schema.ts`: a single required `userId`. Id-only
 * contract — no name / email lookup variant. Workflow authors that
 * have only a name compose `list_users` upstream and select an id.
 *
 * Outputs match `getUser.ts:return` (via `mapNotionUser`) — `{userId,
 * object, type, name, avatarUrl, personEmail, botOwnerType,
 * botOwnerUserId, botWorkspaceName}`.
 *
 * Note on `personEmail`: Notion only returns the email when the
 * integration's developer-portal capability "user information
 * including email addresses" is enabled. Otherwise it's null. V2 does
 * NOT auto-request that capability — workspaces opt in via Notion's
 * UI.
 */
export const notionGetUserMeta: ActionMeta = {
  key: "notion:get_user",
  provider: "notion",
  type: "get_user",
  displayName: "Get User",
  description:
    "Fetch a Notion user by id. Returns the polymorphic Notion user shape (person vs. bot) as stable flat fields. `personEmail` is populated only when the integration's developer-portal email capability is enabled.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "userId",
      label: "User",
      description:
        "Notion user. Pick from the workspace users list, or wire from upstream `{{notion:list_users.users[0].userId}}` / a trigger payload.",
      type: "combobox",
      optionsSource: "notion:users",
      allowManualEntry: true,
      required: true,
      placeholder: "Select a user",
    },
  ],
  outputs: [
    {
      name: "userId",
      type: "string",
      description: "Notion user id (echoed from the response).",
    },
    {
      name: "object",
      type: "string",
      description: "Always 'user'.",
    },
    {
      name: "type",
      type: "string",
      description: "User kind — 'person' or 'bot'. Null when Notion's response omits it.",
    },
    {
      name: "name",
      type: "string",
      description: "Display name.",
    },
    {
      name: "avatarUrl",
      type: "string",
      description: "Avatar image URL. Null when absent.",
    },
    {
      name: "personEmail",
      type: "string",
      description:
        "Email address for person users — populated when Notion grants the integration the 'user information including email addresses' capability. Null otherwise.",
      sensitive: true,
    },
    {
      name: "botOwnerType",
      type: "string",
      description: "For bot users — 'user' (owned by a single user) or 'workspace' (workspace-installed). Null for person users.",
    },
    {
      name: "botOwnerUserId",
      type: "string",
      description: "For bot users with `botOwnerType === 'user'`, the owning user's id. Null otherwise.",
    },
    {
      name: "botWorkspaceName",
      type: "string",
      description: "For bot users, the workspace name. Null for person users.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 150,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
