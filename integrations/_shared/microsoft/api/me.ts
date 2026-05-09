/**
 * Wrapper for Microsoft Graph `GET /v1.0/me?$select=mail,userPrincipalName,id`.
 *
 * Used by:  every Microsoft provider's OAuth callback for accountId
 *           resolution. Per-provider `oauth.ts` modules call `getMe()`
 *           and apply the `mail ?? userPrincipalName` fallback to
 *           produce the integration row's `providerAccountId`.
 *
 * Account ID resolution policy:
 *   - Use `mail` from Graph /me when non-null (work / school accounts
 *     and properly-provisioned consumer accounts).
 *   - Fall back to `userPrincipalName` for consumer accounts where the
 *     mailbox isn't provisioned at consent time. UPN is the sign-in
 *     identifier and is always present on a successful /me call.
 *   - The Graph object id (`id` field) is the immutable Azure object
 *     GUID; capture it for downstream API calls that need a stable
 *     handle independent of email changes.
 *
 * This wrapper does the network call + JSON parse but does NOT apply
 * the fallback — the caller decides which field to use as the
 * accountId. Keeps the wrapper pure-fetch and the policy centralized
 * in per-provider OAuth modules where it belongs (so per-provider
 * tests can assert the exact same shape we'd see in production).
 *
 * Throws on HTTP non-OK so OAuth callbacks fail loud.
 *
 * Slice 7: extracted from inline calls in
 * `integrations/microsoft-outlook/oauth.ts` so Outlook Calendar can
 * call the same wrapper.
 */
import { graphApiBase } from "./_base";

export interface GraphMeResponse {
  id?: string;
  /**
   * Email address. Null for consumer accounts where the mailbox isn't
   * provisioned at consent time. Falls back to `userPrincipalName` at
   * the caller.
   */
  mail?: string | null;
  /** UPN — sign-in identifier; always present on a successful /me call. */
  userPrincipalName?: string;
  displayName?: string;
}

export async function getMe(accessToken: string): Promise<GraphMeResponse> {
  const url = `${graphApiBase()}/v1.0/me?$select=mail,userPrincipalName,id`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Microsoft Graph /me failed: HTTP ${res.status}`);
  }
  return (await res.json()) as GraphMeResponse;
}
