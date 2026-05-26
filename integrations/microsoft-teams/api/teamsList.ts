import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

/**
 * Wrapper for Microsoft Graph `GET /v1.0/me/joinedTeams` — Slice
 * 4.TEAMS-META-2.
 *
 * Lists the teams the authenticated user is a member of. Backs the
 * `microsoft-teams:teams` options resolver — the cascade ROOT every Teams
 * action's `teamId` (and the `new_channel_message` trigger's `teamId`)
 * hangs off.
 *
 * New read helper: the existing `api/` wrappers are per-resource get/send
 * (`channelGet`, `channelMessageSend`, `teamMembersList`); none lists the
 * user's teams. Mirrors the `teamMembersList` transport (direct Graph
 * `fetch` + 401/404 mapping); handlers/resolvers wrap it in
 * `refreshAndRetry`. Read-only against the existing `Team.ReadBasic.All`
 * scope — no scope change / reconnect.
 *
 * `$select=id,displayName,description` keeps the payload minimal (just the
 * opaque team id, display name, and an optional description). Graph
 * paginates via `@odata.nextLink`; this helper returns one page + the
 * nextLink (the resolver surfaces `hasMore`). The token NEVER appears in a
 * thrown error (only method + resource).
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404.
 *   - generic `Error` on other failures (Graph message surfaced, no token).
 */

export interface TeamSummary {
  id: string;
  displayName?: string;
  description?: string | null;
}

export interface TeamsListResult {
  teams: TeamSummary[];
  nextLink: string | null;
}

export interface TeamsListInput {
  accessToken: string;
}

export async function teamsList(
  input: TeamsListInput,
): Promise<TeamsListResult> {
  const url = new URL(`${graphApiBase()}/v1.0/me/joinedTeams`);
  url.searchParams.set("$select", "id,displayName,description");

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph me/joinedTeams GET returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError("joined teams", surfaceGraphError(text, 404));
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph me/joinedTeams GET failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  const body = (await res.json()) as {
    value?: TeamSummary[];
    "@odata.nextLink"?: string;
  };
  return {
    teams: body.value ?? [],
    nextLink: body["@odata.nextLink"] ?? null,
  };
}
