import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { McpTokenView } from "@/lib/api/mcp";

/**
 * MCP-token list + per-row revoke (extracted from McpTokensPanel in the PUBLIC-MCP
 * UI cleanup slice — no behavior change). Renders loading / load-error+retry /
 * empty / the token rows (safe metadata only — name, prefix, account, scopes,
 * dates), and the inline revoke confirmation. All state + API calls live in the
 * parent; this is presentational + callbacks.
 */

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function StatusBadge({ status }: { status: McpTokenView["status"] }) {
  const tone =
    status === "active"
      ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
      : status === "expired"
        ? "border-amber-500/30 text-amber-600 dark:text-amber-400"
        : "border-border text-muted-foreground";
  const label = status === "active" ? "Active" : status === "expired" ? "Expired" : "Revoked";
  return (
    <Badge variant="outline" className={tone}>
      {label}
    </Badge>
  );
}

interface Props {
  tokens: McpTokenView[] | null;
  loadError: string | null;
  accountName: string;
  frozen: boolean;
  busyId: string | null;
  revokeId: string | null;
  actionError: string | null;
  /** When false (default), revoked tokens are hidden from the list. */
  showRevoked: boolean;
  onShowRevokedChange: (value: boolean) => void;
  onRetry: () => void;
  onRevokeOpen: (tokenId: string) => void;
  onRevokeConfirm: (tokenId: string) => void;
  onRevokeCancel: () => void;
}

export function McpTokenList({
  tokens,
  loadError,
  accountName,
  frozen,
  busyId,
  revokeId,
  actionError,
  showRevoked,
  onShowRevokedChange,
  onRetry,
  onRevokeOpen,
  onRevokeConfirm,
  onRevokeCancel,
}: Props) {
  const hasRevoked = tokens?.some((t) => t.status === "revoked") ?? false;
  // Default view focuses on usable tokens — revoked tokens are hidden unless the
  // toggle is on. Revoked rows are never deleted (DB keeps the audit history).
  const visible =
    tokens === null ? [] : showRevoked ? tokens : tokens.filter((t) => t.status !== "revoked");

  return (
    <>
      {tokens === null && !loadError && (
        <p data-testid="mcp-tokens-loading" className="text-xs text-muted-foreground">
          Loading MCP tokens…
        </p>
      )}

      {loadError && (
        <div data-testid="mcp-tokens-load-error" className="flex flex-col gap-2">
          <p role="alert" className="text-xs text-destructive">
            {loadError}
          </p>
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="mcp-tokens-retry"
              onClick={onRetry}
            >
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Show-revoked toggle — offered only when there's revoked history to reveal. */}
      {tokens !== null && hasRevoked && (
        <label
          data-testid="mcp-show-revoked"
          className="flex items-center gap-2 self-start text-xs text-muted-foreground"
        >
          <input
            type="checkbox"
            data-testid="mcp-show-revoked-toggle"
            checked={showRevoked}
            onChange={(e) => onShowRevokedChange(e.target.checked)}
            className="h-3.5 w-3.5 accent-primary"
          />
          Show revoked tokens
        </label>
      )}

      {tokens !== null && tokens.length === 0 && (
        <p data-testid="mcp-tokens-empty" className="text-xs text-muted-foreground">
          No MCP tokens yet.
        </p>
      )}

      {/* Tokens exist but all are filtered out (only revoked, toggle off). */}
      {tokens !== null && tokens.length > 0 && visible.length === 0 && (
        <div data-testid="mcp-tokens-no-active" className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">No active MCP tokens.</p>
          <p className="text-[11px] text-muted-foreground">
            Turn on Show revoked tokens to view revoked token history.
          </p>
        </div>
      )}

      {visible.length > 0 && (
        <ul data-testid="mcp-tokens-list" className="flex flex-col gap-2">
          {visible.map((t) => {
            const rowBusy = busyId === t.id;
            const confirming = revokeId === t.id;
            return (
              <li
                key={t.id}
                data-testid={`mcp-token-row-${t.id}`}
                className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{t.name}</span>
                      <StatusBadge status={t.status} />
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">{t.prefix}…</span>
                  </div>
                  {!frozen && t.status === "active" && !confirming && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      data-testid={`mcp-token-revoke-${t.id}`}
                      className="shrink-0 text-destructive hover:text-destructive"
                      disabled={rowBusy}
                      onClick={() => onRevokeOpen(t.id)}
                    >
                      {rowBusy ? "…" : "Revoke"}
                    </Button>
                  )}
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span data-testid={`mcp-token-account-${t.id}`}>Account: {accountName}</span>
                  <span>Scopes: {t.scopes.join(", ") || "—"}</span>
                  <span>Created {formatDate(t.createdAt)}</span>
                  <span>Last used {formatDate(t.lastUsedAt)}</span>
                  {t.expiresAt && <span>Expires {formatDate(t.expiresAt)}</span>}
                </div>

                {confirming && (
                  <div
                    data-testid={`mcp-token-revoke-confirm-row-${t.id}`}
                    className="flex flex-wrap items-center gap-2 border-t border-border pt-2"
                  >
                    <span className="text-xs text-muted-foreground">
                      Revoke this token? It will stop working immediately.
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      data-testid={`mcp-token-revoke-confirm-${t.id}`}
                      disabled={rowBusy}
                      onClick={() => onRevokeConfirm(t.id)}
                    >
                      {rowBusy ? "Revoking…" : "Revoke token"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      data-testid={`mcp-token-revoke-cancel-${t.id}`}
                      disabled={rowBusy}
                      onClick={onRevokeCancel}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {actionError && (
        <p role="alert" data-testid="mcp-tokens-action-error" className="text-xs text-destructive">
          {actionError}
        </p>
      )}
    </>
  );
}
