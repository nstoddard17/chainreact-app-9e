/**
 * Typed client for the MCP-token management APIs (Slice 4.PUBLIC-MCP-10).
 *
 * Per project-structure-and-module-boundaries.md §5: client code calls this module,
 * never `fetch()` directly. Thin wrappers over the owner/admin-only management
 * routes. The raw token is returned by `createMcpToken` EXACTLY ONCE (the create
 * response) and must be shown once and never refetched, persisted, or logged. No
 * route ever returns the `token_hash`; lists carry display metadata only.
 *
 * Failures surface as `McpApiError` so the UI can branch on `code`.
 */

/** The public MCP endpoint customers point their client at. */
export const MCP_ENDPOINT_URL = "https://mcp.chainreact.app/mcp";

/** All read scopes (the launch default for a new token). */
export const MCP_READ_SCOPES = [
  "accounts:read",
  "workflows:read",
  "runs:read",
  "integrations:read",
] as const;

export type McpTokenStatus = "active" | "revoked" | "expired";

/** Display metadata for one MCP token — NEVER the raw token or `token_hash`. */
export interface McpTokenView {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  status: McpTokenStatus;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** The result of creating a token — the raw secret is present ONLY here. */
export interface CreatedMcpToken {
  metadata: McpTokenView;
  /** Raw secret — shown to the user exactly once; never refetch or persist it. */
  token: string;
}

export interface CreateMcpTokenInput {
  name: string;
  /** Defaults to all read scopes server-side when omitted. */
  scopes?: string[];
  /** Optional ISO-8601 expiry. Null/omitted = no expiry. */
  expiresAt?: string | null;
}

export type McpApiErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "VALIDATION"
  | "CONFLICT"
  | "SERVER_ERROR"
  | "UNKNOWN";

export class McpApiError extends Error {
  readonly code: McpApiErrorCode;
  readonly status: number;
  constructor(message: string, code: McpApiErrorCode, status: number) {
    super(message);
    this.name = "McpApiError";
    this.code = code;
    this.status = status;
  }
}

/** GET /api/accounts/[id]/mcp-tokens — list this account's token metadata (owner/admin). */
export async function listMcpTokens(accountId: string): Promise<McpTokenView[]> {
  const res = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/mcp-tokens`);
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { tokens: McpTokenView[] };
  return body.tokens;
}

/**
 * POST /api/accounts/[id]/mcp-tokens — mint a token (owner/admin). The raw secret is
 * returned ONCE in `token`; reveal it to the user a single time and never store it.
 */
export async function createMcpToken(
  accountId: string,
  input: CreateMcpTokenInput,
): Promise<CreatedMcpToken> {
  const res = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/mcp-tokens`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      scopes: input.scopes ?? [...MCP_READ_SCOPES],
      expiresAt: input.expiresAt ?? null,
    }),
  });
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { token: McpTokenView; rawToken: string };
  return { metadata: body.token, token: body.rawToken };
}

/** DELETE /api/accounts/[id]/mcp-tokens/[tokenId] — soft-revoke a token (owner/admin). */
export async function revokeMcpToken(accountId: string, tokenId: string): Promise<void> {
  const res = await fetch(
    `/api/accounts/${encodeURIComponent(accountId)}/mcp-tokens/${encodeURIComponent(tokenId)}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw await parseError(res);
}

async function parseError(res: Response): Promise<McpApiError> {
  let message = `Request failed (${res.status})`;
  try {
    const body = (await res.json()) as { error?: string };
    if (typeof body.error === "string" && body.error.length > 0) message = body.error;
  } catch {
    // Non-JSON body — keep the default message.
  }
  return new McpApiError(message, codeForStatus(res.status), res.status);
}

function codeForStatus(status: number): McpApiErrorCode {
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "FORBIDDEN";
  if (status === 400) return "VALIDATION";
  if (status === 409) return "CONFLICT";
  if (status >= 500) return "SERVER_ERROR";
  return "UNKNOWN";
}
