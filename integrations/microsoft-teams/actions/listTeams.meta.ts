import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `microsoft-teams:list_teams` — Slice 4.TEAMS-READ-2.
 * Mirrors `listTeams.schema.ts` (no input fields). Read action (low risk).
 *
 * Returns the joined-teams list as bounded metadata (id/displayName/
 * description). No channel or message content. `teams` is structural
 * metadata (not member PII) so it is NOT marked sensitive. Uses the
 * already-granted `Team.ReadBasic.All` scope.
 */
export const microsoftTeamsListTeamsMeta: ActionMeta = {
  key: "microsoft-teams:list_teams",
  provider: "microsoft-teams",
  type: "list_teams",
  displayName: "List Teams",
  description:
    "List the Microsoft Teams the connected account is a member of (id, display name, description). Read-only — one page; no channel or message content.",
  category: "messaging",
  requiresIntegration: true,
  fields: [],
  outputs: [
    {
      name: "teams",
      type: "array",
      description: "Joined teams — each `{ id, displayName, description }` (description may be null).",
    },
    { name: "count", type: "number", description: "Number of teams on this page." },
    { name: "hasMore", type: "boolean", description: "True when Graph has a further page of teams." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 60,
  riskLevel: "low",
  riskDescription: "Reads the joined-teams list — no provider-side mutation, no message content.",
};
