import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `microsoft-teams:get_team_members` — Slice
 * 4.TEAMS-META-3. Mirrors `getTeamMembers.schema.ts`. Read action
 * (low risk).
 *
 * `teamId` → microsoft-teams:teams (no dep). `top` is Graph's $top page
 * size (1–999). The nested `members[].email` (member email addresses) →
 * sensitive.
 */
export const microsoftTeamsGetTeamMembersMeta: ActionMeta = {
  key: "microsoft-teams:get_team_members",
  provider: "microsoft-teams",
  type: "get_team_members",
  displayName: "Get Team Members",
  description: "List the members of a Microsoft Teams team.",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    {
      name: "teamId",
      label: "Team",
      description: "The team whose members to list.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-teams:teams",
      placeholder: "Search teams…",
    },
    {
      name: "top",
      label: "Max results",
      description: "How many members to return at most (1–999).",
      type: "number",
      required: false,
      numeric: { min: 1, max: 999, integer: true },
    },
  ],
  outputs: [
    { name: "teamId", type: "string", description: "The team id." },
    {
      name: "members",
      type: "array",
      description: "The team's members (this page).",
      fields: [
        { name: "memberId", type: "string", description: "conversationMember id." },
        { name: "displayName", type: "string", description: "Member display name." },
        {
          name: "email",
          type: "string",
          description: "Member email address (or null).",
          sensitive: true,
        },
        { name: "userId", type: "string", description: "AAD object id (or null)." },
        { name: "roles", type: "array", description: "Member roles (e.g. owner)." },
        { name: "isOwner", type: "boolean", description: "True if the member is an owner." },
      ],
    },
    { name: "count", type: "number", description: "Members in this page." },
    { name: "hasMore", type: "boolean", description: "More pages exist." },
    { name: "nextLink", type: "string", description: "Graph nextLink (or null)." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 50,
  riskLevel: "low",
  riskDescription: "Reads the team roster — no provider-side mutation.",
};
