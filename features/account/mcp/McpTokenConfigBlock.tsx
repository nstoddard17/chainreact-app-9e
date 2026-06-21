import { MCP_ENDPOINT_URL } from "@/lib/api/mcp";
import { Button } from "@/components/ui/button";

/**
 * Ready-to-paste MCP client config block (extracted from McpTokensPanel in the
 * PUBLIC-MCP UI cleanup slice — no behavior change). Renders the freshly-minted raw
 * token inlined into a client config + a copy button + the account-scope note.
 *
 * The config is built ONLY from the in-memory raw token passed in (which lives and
 * dies with the reveal banner) — never persisted, refetched, or logged.
 */

/** Build the client config a customer drops into their LLM client, token inlined. */
export function buildClientConfig(rawToken: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        chainreact: {
          url: MCP_ENDPOINT_URL,
          headers: { Authorization: `Bearer ${rawToken}` },
        },
      },
    },
    null,
    2,
  );
}

interface Props {
  rawToken: string;
  accountName: string;
  configCopied: boolean;
  onCopyConfig: () => void;
}

export function McpTokenConfigBlock({ rawToken, accountName, configCopied, onCopyConfig }: Props) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground">Client config</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="mcp-token-config-copy"
          onClick={onCopyConfig}
        >
          {configCopied ? "Copied!" : "Copy config"}
        </Button>
      </div>
      <pre
        data-testid="mcp-token-config"
        className="overflow-x-auto rounded-md border border-input bg-background p-3 font-mono text-[11px] leading-relaxed text-foreground"
      >
        {buildClientConfig(rawToken)}
      </pre>
      <p className="text-[11px] text-muted-foreground">
        This token only works for{" "}
        <span className="font-medium text-foreground">{accountName}</span>. It does not
        follow your active-account changes — switching accounts won&apos;t change which
        account this token can read.
      </p>
    </div>
  );
}
