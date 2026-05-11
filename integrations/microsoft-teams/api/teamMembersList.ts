import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { TeamsConversationMember } from "./types";

/**
 * Wrapper for Microsoft Graph `GET /v1.0/teams/{teamId}/members`.
 *
 * Used by:  `microsoft_teams_action_get_team_members` action.
 *
 * Read-only — returns conversationMember resources for the team's
 * roster. Scope required: `TeamMember.Read.All` (NOT the admin-consent
 * `TeamMember.ReadWrite.All`).
 *
 * Graph paginates large teams via `@odata.nextLink`. Slice 16 returns
 * one page + the nextLink for forward-compat; workflow authors who
 * need page 2+ chain a follow-up call (matches the V2 OneDrive
 * list_items / Outlook Calendar list_events precedent).
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (team missing or user lacks access).
 *   - generic `Error` on other failures.
 */

export interface TeamMembersListInput {
  accessToken: string;
  teamId: string;
  /** Graph $top page size (1..999). */
  top?: number;
}

export interface TeamMembersListResult {
  members: TeamsConversationMember[];
  nextLink: string | null;
}

export async function teamMembersList(
  input: TeamMembersListInput,
): Promise<TeamMembersListResult> {
  const url = new URL(
    `${graphApiBase()}/v1.0/teams/${encodeURIComponent(input.teamId)}/members`,
  );
  if (input.top !== undefined) {
    url.searchParams.set("$top", String(input.top));
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph teams/members GET returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      `team ${input.teamId}`,
      surfaceGraphError(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph teams/members GET failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  const body = (await res.json()) as {
    value?: TeamsConversationMember[];
    "@odata.nextLink"?: string;
  };
  return {
    members: body.value ?? [],
    nextLink: body["@odata.nextLink"] ?? null,
  };
}
