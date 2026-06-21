"use client";

import { useCallback, useEffect, useState } from "react";
import {
  McpApiError,
  createMcpToken,
  listMcpTokens,
  revokeMcpToken,
  MCP_ENDPOINT_URL,
  type CreatedMcpToken,
  type McpTokenView,
} from "@/lib/api/mcp";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Owner/admin MCP-token manager (Slice 4.PUBLIC-MCP-10).
 *
 * Lists token METADATA (never the raw token or `token_hash`), creates a token with
 * a one-time raw-secret reveal, and soft-revokes tokens — all via the management
 * routes (`@/lib/api/mcp`). The raw secret returned by create lives ONLY in this
 * component's `revealed` state: shown once, copyable, discarded on dismiss; it is
 * never refetched, persisted, logged, or put in a URL.
 *
 * Renders only for an owner/admin on a resolved account (the parent gates that). A
 * frozen account is read-only: create + revoke are hidden, the list stays visible.
 */
interface Props {
  accountId: string;
  /** True when the active account is pending deletion (read-only). */
  frozen: boolean;
}

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

export function McpTokensPanel({ accountId, frozen }: Props) {
  const [tokens, setTokens] = useState<McpTokenView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Create form.
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // One-time raw-token reveal (in-memory only, discarded on dismiss).
  const [revealed, setRevealed] = useState<CreatedMcpToken | null>(null);
  const [copied, setCopied] = useState(false);

  // Revoke.
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setTokens(await listMcpTokens(accountId));
    } catch (err) {
      setTokens(null);
      setLoadError(
        err instanceof McpApiError ? err.message : "Couldn't load MCP tokens. Try again.",
      );
    }
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setCreateError("Give the token a name.");
      return;
    }
    setCreatePending(true);
    setCreateError(null);
    try {
      const created = await createMcpToken(accountId, { name: trimmed });
      setRevealed(created);
      setCopied(false);
      setCreating(false);
      setName("");
      await load();
    } catch (err) {
      setCreateError(
        err instanceof McpApiError ? err.message : "Couldn't create the token. Try again.",
      );
    } finally {
      setCreatePending(false);
    }
  }

  async function handleCopy() {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed.token);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function confirmRevoke(tokenId: string) {
    setRevokeId(null);
    setBusyId(tokenId);
    setActionError(null);
    try {
      await revokeMcpToken(accountId, tokenId);
      await load();
    } catch (err) {
      setActionError(
        err instanceof McpApiError ? err.message : "Couldn't revoke the token. Try again.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div data-testid="mcp-tokens-panel" className="flex flex-col gap-4">
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

      {frozen && (
        <p
          data-testid="mcp-tokens-frozen"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-muted-foreground"
        >
          This account is pending deletion. MCP tokens are read-only — you can&apos;t create
          or revoke tokens while it&apos;s frozen.
        </p>
      )}

      {/* One-time raw-token reveal. */}
      {revealed && (
        <div
          data-testid="mcp-token-reveal"
          className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3"
        >
          <span className="text-xs font-semibold text-foreground">
            Token “{revealed.metadata.name}” created
          </span>
          <p data-testid="mcp-token-reveal-warning" className="text-xs text-amber-600 dark:text-amber-400">
            Copy this now. You won&apos;t be able to see it again.
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
              onClick={handleCopy}
            >
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
          <div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              data-testid="mcp-token-reveal-dismiss"
              onClick={() => {
                setRevealed(null);
                setCopied(false);
              }}
            >
              Done
            </Button>
          </div>
        </div>
      )}

      {/* Create. */}
      {!frozen && !creating && (
        <div>
          <Button
            type="button"
            size="sm"
            data-testid="mcp-token-create-open"
            onClick={() => {
              setCreating(true);
              setCreateError(null);
            }}
          >
            Create MCP token
          </Button>
        </div>
      )}

      {!frozen && creating && (
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
            onChange={(e) => setName(e.target.value)}
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
              onClick={handleCreate}
            >
              {createPending ? "Creating…" : "Create token"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              data-testid="mcp-token-create-cancel"
              disabled={createPending}
              onClick={() => {
                setCreating(false);
                setName("");
                setCreateError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* List / states. */}
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
              onClick={() => void load()}
            >
              Retry
            </Button>
          </div>
        </div>
      )}

      {tokens !== null && tokens.length === 0 && (
        <p data-testid="mcp-tokens-empty" className="text-xs text-muted-foreground">
          No MCP tokens yet.
        </p>
      )}

      {tokens !== null && tokens.length > 0 && (
        <ul data-testid="mcp-tokens-list" className="flex flex-col gap-2">
          {tokens.map((t) => {
            const rowBusy = busyId === t.id;
            const confirming = revokeId === t.id;
            return (
              <li
                key={t.id}
                data-testid={`mcp-token-row-${t.id}`}
                className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
              >
                <div className="flex items-center justify-between gap-3">
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
                      disabled={rowBusy}
                      onClick={() => {
                        setRevokeId(t.id);
                        setActionError(null);
                      }}
                      className="text-destructive hover:text-destructive"
                    >
                      {rowBusy ? "…" : "Revoke"}
                    </Button>
                  )}
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Scopes: {t.scopes.join(", ") || "—"}</span>
                  <span>Created {formatDate(t.createdAt)}</span>
                  <span>Last used {formatDate(t.lastUsedAt)}</span>
                  {t.expiresAt && <span>Expires {formatDate(t.expiresAt)}</span>}
                </div>

                {confirming && (
                  <div
                    data-testid={`mcp-token-revoke-confirm-row-${t.id}`}
                    className="flex items-center gap-2 border-t border-border pt-2"
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
                      onClick={() => void confirmRevoke(t.id)}
                    >
                      {rowBusy ? "Revoking…" : "Revoke token"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      data-testid={`mcp-token-revoke-cancel-${t.id}`}
                      disabled={rowBusy}
                      onClick={() => setRevokeId(null)}
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
    </div>
  );
}
