import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Create-token affordance (extracted from McpTokensPanel in the PUBLIC-MCP UI
 * cleanup slice — no behavior change). Shows a "Create MCP token" button that opens
 * an inline name form. All create state lives in the parent; this is presentational
 * + callbacks. The parent renders it only when the account is NOT frozen.
 */
interface Props {
  creating: boolean;
  name: string;
  createPending: boolean;
  createError: string | null;
  onOpen: () => void;
  onNameChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function McpCreateTokenCard({
  creating,
  name,
  createPending,
  createError,
  onOpen,
  onNameChange,
  onSubmit,
  onCancel,
}: Props) {
  if (!creating) {
    return (
      <div>
        <Button type="button" size="sm" data-testid="mcp-token-create-open" onClick={onOpen}>
          Create MCP token
        </Button>
      </div>
    );
  }

  return (
    <div
      data-testid="mcp-token-create-form"
      className="flex flex-col gap-2 rounded-lg border border-border bg-background/40 p-3"
    >
      <label htmlFor="mcp-token-name" className="text-xs font-medium text-foreground">
        Token name
      </label>
      <Input
        id="mcp-token-name"
        aria-label="MCP token name"
        data-testid="mcp-token-name-input"
        placeholder="e.g. Claude Desktop"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        disabled={createPending}
      />
      <p className="text-xs text-muted-foreground">
        Grants <span className="font-medium text-foreground">read-only</span> access to
        this account&apos;s accounts, workflows, runs, and integrations.
      </p>
      {createError && (
        <p role="alert" data-testid="mcp-token-create-error" className="text-xs text-destructive">
          {createError}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          data-testid="mcp-token-create-submit"
          disabled={createPending}
          onClick={onSubmit}
        >
          {createPending ? "Creating…" : "Create token"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          data-testid="mcp-token-create-cancel"
          disabled={createPending}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
