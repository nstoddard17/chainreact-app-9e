import {
  type ProviderTokenIngestAuth,
  TokenIngestVerificationError,
} from "@/contracts/integration";
import { encryptToken } from "@/core/encryption/tokens";

/**
 * Trello token-ingest auth (Slice 17 Commit 3).
 *
 * Implements `ProviderTokenIngestAuth` per `contracts/integration.ts`.
 * Wire shape:
 *   1. `buildAuthUrl(state, _scopes)` returns the Trello authorize URL.
 *      Trello echoes the user token as `#token=...` on the fragment of
 *      `return_url`; the V2 ingest page reads it and POSTs to the
 *      ingest endpoint. `state` is preserved in `return_url`'s query
 *      string because Trello does NOT carry params other than the
 *      fragment-mode token.
 *   2. `verifyAndIngestToken({ token })` calls
 *      `GET https://api.trello.com/1/members/me` to verify and fetch
 *      account info. Plaintext token is encrypted via `encryptToken()`
 *      before returning. Token NEVER appears in any error message.
 *   3. `revoke(token)` calls `DELETE /1/tokens/{token}` — best-effort.
 *
 * Env vars:
 *   - `TRELLO_CLIENT_ID`: Trello "API key" (global app key).
 *   - `NEXT_PUBLIC_APP_URL`: base for the V2 ingest page URL.
 *
 * Test overrides (e2e only):
 *   - `TRELLO_AUTHORIZE_BASE` / `TRELLO_API_BASE`.
 */

const TRELLO_AUTHORIZE_BASE_DEFAULT = "https://trello.com";
const TRELLO_API_BASE_DEFAULT = "https://api.trello.com";
const TRELLO_INTEGRATION_NAME = "ChainReact";

function trelloAuthorizeBase(): string {
  return process.env.TRELLO_AUTHORIZE_BASE ?? TRELLO_AUTHORIZE_BASE_DEFAULT;
}

function trelloApiBase(): string {
  return process.env.TRELLO_API_BASE ?? TRELLO_API_BASE_DEFAULT;
}

function getTrelloAppKey(): string {
  const key = process.env.TRELLO_CLIENT_ID;
  if (!key) throw new Error("TRELLO_CLIENT_ID env var is not set.");
  return key;
}

function getReturnUrl(state: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/integrations/token-ingest/trello?state=${encodeURIComponent(state)}`;
}

interface TrelloMember {
  id?: string;
  username?: string;
  fullName?: string | null;
  initials?: string | null;
  avatarUrl?: string | null;
  url?: string | null;
  email?: string | null;
}

export const trelloAuth: ProviderTokenIngestAuth = {
  buildAuthUrl(state, _scopes) {
    const params = new URLSearchParams({
      key: getTrelloAppKey(),
      name: TRELLO_INTEGRATION_NAME,
      scope: "read,write,account",
      expiration: "never",
      response_type: "token",
      callback_method: "fragment",
      return_url: getReturnUrl(state),
    });
    return `${trelloAuthorizeBase()}/1/authorize?${params.toString()}`;
  },

  async verifyAndIngestToken({ token }) {
    const key = getTrelloAppKey();
    const verifyUrl = `${trelloApiBase()}/1/members/me?${new URLSearchParams({
      key,
      token,
      fields: "id,username,fullName,initials,avatarUrl,url",
    }).toString()}`;

    let res: Response;
    try {
      res = await fetch(verifyUrl, { method: "GET" });
    } catch {
      throw new Error("fetch failed: Trello verify request failed");
    }

    if (res.status === 401 || res.status === 403) {
      throw new TokenIngestVerificationError("trello", "invalid token");
    }
    if (!res.ok) {
      throw new Error(`Trello verify failed: HTTP ${res.status}`);
    }
    const member = (await res.json()) as TrelloMember;
    if (!member || typeof member.id !== "string" || member.id.length === 0) {
      throw new TokenIngestVerificationError("trello", "invalid member response");
    }

    const displayName = member.fullName ?? member.username ?? member.id;

    return {
      tokens: {
        accessTokenEncrypted: encryptToken(token),
        refreshTokenEncrypted: null,
        accessTokenExpiresAt: null,
        scopes: [],
      },
      account: {
        providerAccountId: member.id,
        displayName,
        metadata: {
          username: member.username ?? null,
          fullName: member.fullName ?? null,
          initials: member.initials ?? null,
          avatarUrl: member.avatarUrl ?? null,
          url: member.url ?? null,
          appKey: key,
        },
      },
    };
  },

  async revoke(token) {
    const key = getTrelloAppKey();
    const url = `${trelloApiBase()}/1/tokens/${encodeURIComponent(
      token,
    )}?${new URLSearchParams({ key }).toString()}`;
    try {
      await fetch(url, { method: "DELETE" });
    } catch {
      // Best-effort: revocation failures are non-fatal.
    }
  },
};
