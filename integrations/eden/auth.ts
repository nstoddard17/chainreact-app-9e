import {
  type ProviderTokenIngestAuth,
  TokenIngestVerificationError,
} from "@/contracts/integration";
import { encryptToken } from "@/core/encryption/tokens";
import { createMcpClient, McpAuthError, McpPermissionError, type McpClient } from "@/integrations/_shared/mcp";

/**
 * Eden token-paste auth (EDEN-3). Implements `ProviderTokenIngestAuth` — the SAME
 * server contract Trello uses — but for the `token_paste` flow (docs/providers/eden/).
 *
 * Flow:
 *   1. `buildAuthUrl(state)` returns a V2-HOSTED paste page URL (NOT a provider
 *      authorize page — Eden has none). The paste page's form POSTs { state, token }
 *      to the shared ingest endpoint → `dispatcher.handleTokenIngest`.
 *   2. `verifyAndIngestToken({ token })` proves the pasted `eden_pat_` by opening the
 *      Eden MCP server and running the `initialize` handshake + a READ-ONLY tool call
 *      (safe for a read-only token). An auth failure → typed `TokenIngestVerificationError`
 *      (route → 400, token NOT persisted); a transient failure → generic Error
 *      (route → 502). On success the plaintext token is encrypted via `encryptToken`
 *      before it is returned; it never appears in any error/log.
 *   3. `revoke(token)` — Eden exposes no documented MCP revoke tool; revocation is done
 *      by the user in Eden Settings. Best-effort no-op (never throws).
 *
 * Env:
 *   - `EDEN_MCP_URL` (non-secret; default `https://mcp.eden.so/mcp`).
 *   - `NEXT_PUBLIC_APP_URL` — base for the V2 paste page URL.
 *
 * LIVE-TODO (blocked on an `eden_pat_` credential, plan blocker B3):
 *   - Confirm the exact read tool + response field that yields a stable Eden
 *     workspace/user id for `providerAccountId` (currently a per-user stable constant,
 *     valid for `tokenScope:"user"` — one Eden integration per user).
 *   - Confirm Eden's structured auth/permission error shape so the mapping below is exact.
 */

const EDEN_MCP_URL_DEFAULT = "https://mcp.eden.so/mcp";
/** A read-only tool used only to PROVE the token during connect (result is not consumed). */
const EDEN_VERIFY_READ_TOOL = "eden_list_schedules";

function edenMcpUrl(): string {
  return process.env.EDEN_MCP_URL ?? EDEN_MCP_URL_DEFAULT;
}

function getPastePageUrl(state: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/integrations/token-paste/eden?state=${encodeURIComponent(state)}`;
}

export const edenAuth: ProviderTokenIngestAuth = {
  buildAuthUrl(state, _scopes) {
    // No provider authorize page — send the browser to the V2 paste form.
    return getPastePageUrl(state);
  },

  async verifyAndIngestToken({ token }) {
    const client: McpClient = createMcpClient({
      endpoint: edenMcpUrl(),
      accessToken: token,
      serverLabel: "Eden",
    });

    let initProtocol = "";
    let serverName: string | null = null;
    let serverVersion: string | null = null;
    try {
      const init = await client.initialize();
      initProtocol = init.protocolVersion ?? "";
      serverName = init.serverInfo?.name ?? null;
      serverVersion = init.serverInfo?.version ?? null;
      // Prove the token against an authenticated READ tool (safe for a read-only PAT).
      await client.callTool(EDEN_VERIFY_READ_TOOL, {}, { idempotent: true });
    } catch (err) {
      // An auth/permission failure means the token is invalid/unauthorized → typed
      // verification error (NOT persisted, no token in the message).
      if (err instanceof McpAuthError || err instanceof McpPermissionError) {
        throw new TokenIngestVerificationError("eden", "invalid or unauthorized token");
      }
      // Transient / transport / protocol failure → generic error. The ingest route
      // classifies "verify failed"/network as a 502 so the user can retry.
      throw new Error("Eden verify failed: could not reach the Eden MCP server");
    }

    return {
      tokens: {
        accessTokenEncrypted: encryptToken(token),
        refreshTokenEncrypted: null,
        accessTokenExpiresAt: null,
        // Permission mode (read-only vs read-write) is enforced by Eden at call time;
        // a write against a read-only token surfaces McpPermissionError → reconnect.
        scopes: [],
      },
      account: {
        // LIVE-TODO: replace with the certified Eden workspace/user id. Stable per
        // connecting user for tokenScope:"user" (one Eden integration per user).
        providerAccountId: "eden",
        displayName: serverName ?? "Eden",
        metadata: {
          serverName,
          serverVersion,
          protocolVersion: initProtocol,
          // Never store the token or any private content here.
        },
      },
    };
  },

  async revoke(_token) {
    // Eden has no documented MCP revoke tool — the user revokes the PAT in
    // Eden → Settings → Integrations. Best-effort no-op (never throws).
  },
};
