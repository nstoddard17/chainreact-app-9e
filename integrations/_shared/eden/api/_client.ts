import { Unauthorized401Error, InsufficientScopeError } from "@/services/oauth/refreshAndRetry";
import {
  createMcpClient,
  McpAuthError,
  McpPermissionError,
  McpProtocolError,
  type McpCallToolResult,
} from "@/integrations/_shared/mcp";

/**
 * Shared Eden MCP API seam (EDEN-4). Every Eden action wrapper calls a tool through here;
 * no action hand-writes JSON-RPC. Designed to slot INTO `refreshAndRetry` — the handler
 * passes `apiCall: (accessToken) => edenCallTool({ accessToken, tool, args })`, so a bad
 * token surfaces the canonical reconnect UX:
 *   - HTTP 401 (bad/expired token)   → McpAuthError    → Unauthorized401Error → (non-refreshable)
 *       IntegrationActionRequiredError("refresh_not_supported") — "reconnect your Eden account".
 *   - read-only token on a write tool → McpPermissionError → InsufficientScopeError — "reconnect
 *       with Read & write permission" (a refresh can't add scope; re-consent required).
 * Other errors (not-found / rate-limit / transport) propagate as the transport's typed errors,
 * which the engine classifies as HANDLER_FAILED. The token is never logged or embedded in errors.
 */

const EDEN_MCP_URL_DEFAULT = "https://mcp.eden.so/mcp";

function edenMcpUrl(): string {
  return process.env.EDEN_MCP_URL ?? EDEN_MCP_URL_DEFAULT;
}

/** Eden read/write tools return a JSON envelope `{ ok, ... }` in a text content block. */
export interface EdenEnvelope {
  ok: boolean;
  [k: string]: unknown;
}

/** Extract Eden's JSON envelope from a tool result (structuredContent, else first text block). */
export function parseEdenEnvelope(result: McpCallToolResult): EdenEnvelope {
  if (result.structuredContent && typeof result.structuredContent === "object") {
    return result.structuredContent as EdenEnvelope;
  }
  const text = result.content?.find((b) => b.type === "text" && typeof b.text === "string")?.text;
  if (text) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === "object") return parsed as EdenEnvelope;
    } catch {
      // fall through to protocol error
    }
  }
  throw new McpProtocolError("Eden", "tool result was not a JSON envelope");
}

export interface EdenCallInput {
  /** Decrypted `eden_pat_` token from the integration row (supplied by refreshAndRetry). */
  accessToken: string;
  tool: string;
  args: Record<string, unknown>;
  /**
   * Retry-safety. Reads pass `true`; writes MUST pass `false` (default) so a transient failure
   * is surfaced, never a silently duplicated write — unless a preserved idempotencyKey makes the
   * write safe to retry AND that behavior has been certified.
   */
  idempotent?: boolean;
}

/**
 * Invoke one Eden MCP tool and return its parsed `{ ok, ... }` envelope. Maps auth/permission
 * failures to the refreshAndRetry contract. Callers (per-resource wrappers) pick a BOUNDED set
 * of keys off the envelope — never spread it into workflow outputs.
 */
export async function edenCallTool(input: EdenCallInput): Promise<EdenEnvelope> {
  const client = createMcpClient({
    endpoint: edenMcpUrl(),
    accessToken: input.accessToken,
    serverLabel: "Eden",
  });
  try {
    const result = await client.callTool(input.tool, input.args, { idempotent: input.idempotent ?? false });
    return parseEdenEnvelope(result);
  } catch (err) {
    if (err instanceof McpAuthError) {
      // Let refreshAndRetry drive the (non-refreshable) reconnect path.
      throw new Unauthorized401Error("Eden returned HTTP 401 (Unauthorized).");
    }
    if (err instanceof McpPermissionError) {
      // Read-only token used for a write — re-consent with write permission is required.
      throw new InsufficientScopeError(
        "Your Eden connection is read-only. Reconnect Eden with Read & write access to run this action.",
        "eden",
      );
    }
    throw err;
  }
}
