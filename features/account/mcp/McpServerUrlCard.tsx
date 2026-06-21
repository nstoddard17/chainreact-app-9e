import { MCP_ENDPOINT_URL } from "@/lib/api/mcp";

/**
 * Read-only intro + endpoint note for the MCP-token panel
 * (extracted from McpTokensPanel in the PUBLIC-MCP UI cleanup slice — no behavior
 * change). States that tokens are read-only and never expose OAuth/app tokens, and
 * shows the public MCP endpoint + bearer header. Purely presentational.
 */
export function McpServerUrlCard() {
  return (
    <div className="flex max-w-xl flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Connect any MCP-compatible LLM client (Claude, etc.) to ChainReact with a
        bearer token. Tokens are{" "}
        <span className="font-medium text-foreground">read-only</span> and{" "}
        <span className="font-medium text-foreground">
          never expose your connected app or OAuth tokens
        </span>
        .
      </p>
      <div
        data-testid="mcp-endpoint-note"
        className="rounded-md border border-border bg-background/40 p-2 text-[11px] text-muted-foreground"
      >
        <div>
          Endpoint: <code className="font-mono text-foreground">{MCP_ENDPOINT_URL}</code>
        </div>
        <div className="mt-1">
          Header: <code className="font-mono">Authorization: Bearer crmcp_…</code>
        </div>
        <p className="mt-1">
          The public MCP server is gated by a server setting — if your client gets 404,
          an admin still needs to enable it.
        </p>
      </div>
    </div>
  );
}
