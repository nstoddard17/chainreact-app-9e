import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import { surfaceGraphError } from "@/integrations/_shared/microsoft/api/errors";

/**
 * Wrapper for Microsoft Graph `GET /me?$select=...` — the connected
 * mailbox's own profile (Slice 4.OUTLOOK-READ-1).
 *
 * Distinct from `_shared/microsoft/api/me.ts:getMe`: that helper is the
 * OAuth-callback accountId resolver and throws a generic `Error` on any
 * non-OK status, so a 401 would NOT trigger refreshAndRetry's refresh.
 * This action-facing wrapper follows the sibling-wrapper contract
 * (`listMailFolders`): throws `Unauthorized401Error` on 401 so a stale
 * token refreshes + retries once, and surfaces a token-free Graph message
 * otherwise.
 *
 * PRIVACY / scope: `$select=mail,userPrincipalName,id,displayName` only —
 * profile identity, no mailbox contents. Uses the already-granted
 * `Mail.Read` scope; no new scope.
 */
export interface GraphMailboxProfile {
  id?: string;
  mail?: string | null;
  userPrincipalName?: string | null;
  displayName?: string | null;
}

export interface GetMailboxProfileInput {
  accessToken: string;
}

export async function getMailboxProfile(
  input: GetMailboxProfileInput,
): Promise<GraphMailboxProfile> {
  const url = `${graphApiBase()}/v1.0/me?$select=mail,userPrincipalName,id,displayName`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error("Microsoft Graph GET me returned HTTP 401");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph GET me failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  return (await res.json()) as GraphMailboxProfile;
}
