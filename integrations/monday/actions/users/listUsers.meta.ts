import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Monday `list_users` ActionMeta — Slice 3.MONDAY-6. Pure read.
 * Output `users` is sensitive (names + emails).
 */
export const mondayListUsersMeta: ActionMeta = {
  key: "monday:list_users",
  provider: "monday",
  type: "list_users",
  displayName: "List Users",
  description: "List users in the connected Monday account, optionally filtered by kind.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "limit",
      label: "Limit",
      type: "number",
      required: false,
      defaultValue: 25,
      numeric: { min: 1, max: 100, integer: true },
    },
    {
      name: "kind",
      label: "Kind",
      type: "select",
      required: false,
      defaultValue: "all",
      options: [
        { value: "all", label: "All users" },
        { value: "non_guests", label: "Non-guests" },
        { value: "guests", label: "Guests" },
        { value: "non_pending", label: "Non-pending" },
      ],
    },
  ],
  outputs: [
    {
      name: "users",
      type: "array",
      description: "Users ({userId,name,email,title,photoUrl,enabled,createdAt}).",
      sensitive: true,
    },
    { name: "count", type: "number", description: "Number of users returned." },
    { name: "kind", type: "string", description: "Kind filter applied." },
    { name: "hasMore", type: "boolean", description: "Always false (limit-bounded)." },
    { name: "nextCursor", type: "string", description: "Always null (no cursor pagination)." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 210,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
