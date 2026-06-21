import { Button } from "@/components/ui/button";
import type { CreatedMcpToken } from "@/lib/api/mcp";
import { McpTokenConfigBlock } from "./McpTokenConfigBlock";

/**
 * One-time raw-token reveal banner (extracted from McpTokensPanel in the PUBLIC-MCP
 * UI cleanup slice — no behavior change). Shows the freshly-created raw token once
 * with the copy warning, a copy button, the ready-to-paste client config, and a
 * dismiss. The raw token lives ONLY in the parent's in-memory `revealed` state —
 * this component never persists, refetches, or logs it.
 */
interface Props {
  revealed: CreatedMcpToken;
  accountName: string;
  copied: boolean;
  configCopied: boolean;
  onCopy: () => void;
  onCopyConfig: () => void;
  onDismiss: () => void;
}

export function McpCreatedTokenBanner({
  revealed,
  accountName,
  copied,
  configCopied,
  onCopy,
  onCopyConfig,
  onDismiss,
}: Props) {
  return (
    <div
      data-testid="mcp-token-reveal"
      className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3"
    >
      <span className="text-xs font-semibold text-foreground">
        Token “{revealed.metadata.name}” created for {accountName}
      </span>
      <p data-testid="mcp-token-reveal-warning" className="text-xs text-amber-600 dark:text-amber-400">
        Copy this token now. You will not be able to see it again.
      </p>
      <div className="flex items-center gap-2">
        <input
          readOnly
          aria-label="New MCP token"
          data-testid="mcp-token-reveal-value"
          value={revealed.token}
          onFocus={(e) => e.target.select()}
          className="h-9 flex-1 rounded-md border border-input bg-background px-3 font-mono text-xs text-foreground"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="mcp-token-reveal-copy"
          onClick={onCopy}
        >
          {copied ? "Copied!" : "Copy"}
        </Button>
      </div>

      {/* Ready-to-paste MCP client config, token inlined (in-memory only). */}
      <McpTokenConfigBlock
        rawToken={revealed.token}
        accountName={accountName}
        configCopied={configCopied}
        onCopyConfig={onCopyConfig}
      />

      <div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          data-testid="mcp-token-reveal-dismiss"
          onClick={onDismiss}
        >
          Done
        </Button>
      </div>
    </div>
  );
}
