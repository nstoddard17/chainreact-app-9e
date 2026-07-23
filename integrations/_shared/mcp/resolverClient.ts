/**
 * Shared MCP tool-call seam for OPTION RESOLVERS (CS-6B).
 *
 * Option resolvers for MCP-catalog providers (Linear teams/assignees/labels)
 * need to call a read-only list tool through the same shared client + token
 * lifecycle the executor uses — but WITHOUT the executor's drift gate or bounded
 * ACTION-output projection (a resolver just needs the raw list to map to
 * `{value,label}`). This is that lean seam: `refreshAndRetry` (token decrypt +
 * one 401 refresh/retry) → `McpClient.callTool` (idempotent read, bounded
 * transport) → the raw `McpCallToolResult`. Auth/permission failures map into
 * the refreshAndRetry contract so a stale token refreshes and a scope failure
 * surfaces reconnect — exactly like the executor and the Eden bridge.
 *
 * The token is never logged or returned; results are mapped to id/label by the
 * caller (never spread), and secret scrubbing on the client's error paths is
 * unchanged.
 */

import {
  Unauthorized401Error,
  InsufficientScopeError,
  refreshAndRetry,
} from "@/services/oauth/refreshAndRetry";
import {
  createMcpClient,
  McpAuthError,
  McpPermissionError,
  type McpCallToolResult,
  type McpClientOptions,
  type McpClient,
} from "@/integrations/_shared/mcp";

const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_MAX_RESPONSE_BYTES = 1_000_000;

export interface McpResolverCallInput {
  readonly accountId: string;
  readonly provider: string;
  readonly providerAccountId: string | null;
  readonly serverUrl: string;
  readonly serverLabel: string;
  readonly tool: string;
  readonly args: Readonly<Record<string, unknown>>;
}

/** Test seam — real callers omit these. */
export interface McpResolverDeps {
  readonly createClient?: (opts: McpClientOptions) => McpClient;
  readonly refreshAndRetry?: typeof refreshAndRetry;
}

/**
 * Call a read-only MCP tool for an option resolver. Returns the raw tool result;
 * the resolver extracts + maps the fields it needs (never spreads the result).
 */
export async function mcpResolverCall(
  input: McpResolverCallInput,
  deps: McpResolverDeps = {},
): Promise<McpCallToolResult> {
  const runRefresh = deps.refreshAndRetry ?? refreshAndRetry;
  const makeClient = deps.createClient ?? createMcpClient;

  return runRefresh<McpCallToolResult>({
    accountId: input.accountId,
    provider: input.provider,
    providerAccountId: input.providerAccountId,
    apiCall: async (accessToken) => {
      const client = makeClient({
        endpoint: input.serverUrl,
        accessToken,
        serverLabel: input.serverLabel,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        maxResponseBytes: DEFAULT_MAX_RESPONSE_BYTES,
      });
      try {
        // List tools are reads → idempotent (safe to auto-retry a transient).
        return await client.callTool(input.tool, { ...input.args }, { idempotent: true });
      } catch (err) {
        if (err instanceof McpAuthError) {
          throw new Unauthorized401Error(`${input.serverLabel} returned HTTP 401 (Unauthorized).`);
        }
        if (err instanceof McpPermissionError) {
          throw new InsufficientScopeError(
            `Your ${input.serverLabel} connection lacks permission to list this resource.`,
            input.provider,
          );
        }
        throw err;
      }
    },
  });
}

/** The tool result's structured payload as a plain object, or null. */
export function mcpStructured(result: McpCallToolResult): Record<string, unknown> | null {
  if (result.structuredContent && typeof result.structuredContent === "object" && !Array.isArray(result.structuredContent)) {
    return result.structuredContent as Record<string, unknown>;
  }
  const firstText = (result.content ?? []).find((b) => b.type === "text" && typeof b.text === "string")?.text;
  if (typeof firstText === "string") {
    try {
      const parsed = JSON.parse(firstText) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      /* not JSON */
    }
  }
  return null;
}
