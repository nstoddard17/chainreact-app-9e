import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Monday `get_user` ActionMeta — Slice 3.MONDAY-6. Pure read.
 * `userId` picker via monday:users. Output email is sensitive.
 */
export const mondayGetUserMeta: ActionMeta = {
  key: "monday:get_user",
  provider: "monday",
  type: "get_user",
  displayName: "Get User",
  description: "Fetch a single Monday user by id, including their account.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "userId",
      label: "User",
      type: "combobox",
      optionsSource: "monday:users",
      required: true,
      placeholder: "Search users…",
    },
  ],
  outputs: [
    { name: "userId", type: "string", description: "User id." },
    { name: "name", type: "string", description: "User name.", sensitive: true },
    { name: "email", type: "string", description: "User email.", sensitive: true },
    { name: "title", type: "string", description: "Job title.", sensitive: true },
    { name: "photoUrl", type: "string", description: "Profile photo URL.", sensitive: true },
    { name: "enabled", type: "boolean", description: "Whether the user is enabled." },
    { name: "createdAt", type: "string", description: "Account creation timestamp." },
    { name: "accountId", type: "string", description: "Monday account id." },
    { name: "accountName", type: "string", description: "Account name.", sensitive: true },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 220,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
