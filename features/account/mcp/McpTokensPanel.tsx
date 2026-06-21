"use client";

import { useCallback, useEffect, useState } from "react";
import {
  McpApiError,
  createMcpToken,
  listMcpTokens,
  revokeMcpToken,
  type CreatedMcpToken,
  type McpTokenView,
} from "@/lib/api/mcp";
import { McpServerUrlCard } from "./McpServerUrlCard";
import { McpCreatedTokenBanner } from "./McpCreatedTokenBanner";
import { McpCreateTokenCard } from "./McpCreateTokenCard";
import { McpTokenList } from "./McpTokenList";
import { buildClientConfig } from "./McpTokenConfigBlock";

/**
 * Owner/admin MCP-token manager (Slice 4.PUBLIC-MCP-10).
 *
 * The stateful container: it owns ALL token state + API calls and composes the
 * presentational sub-components (server-URL card, one-time reveal banner, create
 * card, token list). Behavior is unchanged by the cleanup split — the markup,
 * test-ids, and flows are identical to the pre-split single file.
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
export interface McpTokensPanelProps {
  accountId: string;
  /** Display name of the account these tokens are scoped to (account-scope clarity). */
  accountName: string;
  /** True when the active account is pending deletion (read-only). */
  frozen: boolean;
}

export function McpTokensPanel({ accountId, accountName, frozen }: McpTokensPanelProps) {
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
  const [configCopied, setConfigCopied] = useState(false);

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
      setConfigCopied(false);
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

  async function handleCopyConfig() {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(buildClientConfig(revealed.token));
      setConfigCopied(true);
    } catch {
      setConfigCopied(false);
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
      <McpServerUrlCard />

      {frozen && (
        <p
          data-testid="mcp-tokens-frozen"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-muted-foreground"
        >
          This account is pending deletion. MCP tokens are read-only — you can&apos;t create
          or revoke tokens while it&apos;s frozen.
        </p>
      )}

      {revealed && (
        <McpCreatedTokenBanner
          revealed={revealed}
          accountName={accountName}
          copied={copied}
          configCopied={configCopied}
          onCopy={handleCopy}
          onCopyConfig={handleCopyConfig}
          onDismiss={() => {
            setRevealed(null);
            setCopied(false);
            setConfigCopied(false);
          }}
        />
      )}

      {!frozen && (
        <McpCreateTokenCard
          creating={creating}
          name={name}
          createPending={createPending}
          createError={createError}
          onOpen={() => {
            setCreating(true);
            setCreateError(null);
          }}
          onNameChange={setName}
          onSubmit={() => void handleCreate()}
          onCancel={() => {
            setCreating(false);
            setName("");
            setCreateError(null);
          }}
        />
      )}

      <McpTokenList
        tokens={tokens}
        loadError={loadError}
        accountName={accountName}
        frozen={frozen}
        busyId={busyId}
        revokeId={revokeId}
        actionError={actionError}
        onRetry={() => void load()}
        onRevokeOpen={(tokenId) => {
          setRevokeId(tokenId);
          setActionError(null);
        }}
        onRevokeConfirm={(tokenId) => void confirmRevoke(tokenId)}
        onRevokeCancel={() => setRevokeId(null)}
      />
    </div>
  );
}
