"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AccountApiError,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  LAUNCH_API_KEY_SCOPE,
  type ApiKeyMetadataView,
  type CreatedApiKey,
} from "@/lib/api/accounts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Owner/admin API-key manager (Slice 4.API-KEYS-FOUNDATION-4 / FK-3).
 *
 * Lists key METADATA (never the raw key or `key_hash`), creates a key with a
 * one-time raw-secret reveal, and soft-revokes keys — all via the FK-2 management
 * routes (`@/lib/api/accounts`). The raw secret returned by create lives ONLY in
 * this component's `revealed` state: it is shown once, copyable, and discarded on
 * dismiss; it is never refetched, persisted to storage, logged, or put in a URL.
 *
 * This component renders only for an owner/admin on a resolved account (the parent
 * `ApiSection` gates that). A frozen / pending-deletion account is read-only:
 * create + revoke are hidden, the existing list stays visible.
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

function StatusBadge({ status }: { status: ApiKeyMetadataView["status"] }) {
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

export function ApiKeysPanel({ accountId, frozen }: Props) {
  const [keys, setKeys] = useState<ApiKeyMetadataView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Create form.
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // One-time raw-key reveal (in-memory only, discarded on dismiss).
  const [revealed, setRevealed] = useState<CreatedApiKey | null>(null);
  const [copied, setCopied] = useState(false);

  // Revoke.
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setKeys(await listApiKeys(accountId));
    } catch (err) {
      setKeys(null);
      setLoadError(
        err instanceof AccountApiError ? err.message : "Couldn't load API keys. Try again.",
      );
    }
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setCreateError("Give the key a name.");
      return;
    }
    setCreatePending(true);
    setCreateError(null);
    try {
      const created = await createApiKey(accountId, {
        name: trimmed,
        scopes: [LAUNCH_API_KEY_SCOPE],
        expiresAt: null,
      });
      setRevealed(created);
      setCopied(false);
      setCreating(false);
      setName("");
      await load();
    } catch (err) {
      setCreateError(
        err instanceof AccountApiError ? err.message : "Couldn't create the key. Try again.",
      );
    } finally {
      setCreatePending(false);
    }
  }

  async function handleCopy() {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed.key);
      setCopied(true);
    } catch {
      // Clipboard blocked — the value stays visible in the readonly field.
      setCopied(false);
    }
  }

  async function confirmRevoke(keyId: string) {
    setRevokeId(null);
    setBusyId(keyId);
    setActionError(null);
    try {
      await revokeApiKey(accountId, keyId);
      await load();
    } catch (err) {
      setActionError(
        err instanceof AccountApiError ? err.message : "Couldn't revoke the key. Try again.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div data-testid="api-keys-panel" className="flex flex-col gap-4">
      <div className="flex max-w-xl flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          Account-scoped keys that act as this account. Use a key to{" "}
          <span className="font-medium text-foreground">trigger a workflow</span> with a
          bearer token. Keys{" "}
          <span className="font-medium text-foreground">
            never expose your connected app or OAuth tokens
          </span>
          .
        </p>
        <div
          data-testid="api-keys-endpoint-note"
          className="rounded-md border border-border bg-background/40 p-2 text-[11px] text-muted-foreground"
        >
          <code className="font-mono text-foreground">
            POST /api/v1/workflows/{"{workflowId}"}/trigger
          </code>
          <div className="mt-1">
            Header: <code className="font-mono">Authorization: Bearer crk_…</code> · scope{" "}
            <code className="font-mono">workflows:trigger</code>
          </div>
          <p className="mt-1">
            Public API access is gated by a server setting — if requests return 404, an admin
            still needs to enable it.
          </p>
        </div>
      </div>

      {frozen && (
        <p
          data-testid="api-keys-frozen"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-muted-foreground"
        >
          This account is pending deletion. API keys are read-only — you can&apos;t create or
          revoke keys while it&apos;s frozen.
        </p>
      )}

      {/* One-time raw-key reveal. */}
      {revealed && (
        <div
          data-testid="api-key-reveal"
          className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3"
        >
          <span className="text-xs font-semibold text-foreground">
            Key “{revealed.metadata.name}” created
          </span>
          <p data-testid="api-key-reveal-warning" className="text-xs text-amber-600 dark:text-amber-400">
            Copy this now. You won&apos;t be able to see it again.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              aria-label="New API key"
              data-testid="api-key-reveal-value"
              value={revealed.key}
              onFocus={(e) => e.target.select()}
              className="h-9 flex-1 rounded-md border border-input bg-background px-3 font-mono text-xs text-foreground"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="api-key-reveal-copy"
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
              data-testid="api-key-reveal-dismiss"
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
            data-testid="api-key-create-open"
            onClick={() => {
              setCreating(true);
              setCreateError(null);
            }}
          >
            Create API key
          </Button>
        </div>
      )}

      {!frozen && creating && (
        <div
          data-testid="api-key-create-form"
          className="flex flex-col gap-2 rounded-lg border border-border bg-background/40 p-3"
        >
          <label htmlFor="api-key-name" className="text-xs font-medium text-foreground">
            Key name
          </label>
          <Input
            id="api-key-name"
            aria-label="API key name"
            data-testid="api-key-name-input"
            placeholder="e.g. CI deploy trigger"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={createPending}
          />
          <p className="text-xs text-muted-foreground">
            Scope: <span className="font-medium text-foreground">Trigger workflows</span> — the
            only scope available right now.
          </p>
          {createError && (
            <p role="alert" data-testid="api-key-create-error" className="text-xs text-destructive">
              {createError}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              data-testid="api-key-create-submit"
              disabled={createPending}
              onClick={handleCreate}
            >
              {createPending ? "Creating…" : "Create key"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              data-testid="api-key-create-cancel"
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
      {keys === null && !loadError && (
        <p data-testid="api-keys-loading" className="text-xs text-muted-foreground">
          Loading API keys…
        </p>
      )}

      {loadError && (
        <div data-testid="api-keys-load-error" className="flex flex-col gap-2">
          <p role="alert" className="text-xs text-destructive">
            {loadError}
          </p>
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="api-keys-retry"
              onClick={() => void load()}
            >
              Retry
            </Button>
          </div>
        </div>
      )}

      {keys !== null && keys.length === 0 && (
        <p data-testid="api-keys-empty" className="text-xs text-muted-foreground">
          No API keys yet.
        </p>
      )}

      {keys !== null && keys.length > 0 && (
        <ul data-testid="api-keys-list" className="flex flex-col gap-2">
          {keys.map((k) => {
            const rowBusy = busyId === k.id;
            const confirming = revokeId === k.id;
            return (
              <li
                key={k.id}
                data-testid={`api-key-row-${k.id}`}
                className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{k.name}</span>
                      <StatusBadge status={k.status} />
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">{k.prefix}</span>
                  </div>
                  {!frozen && k.status === "active" && !confirming && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      data-testid={`api-key-revoke-${k.id}`}
                      className="shrink-0 text-destructive hover:text-destructive"
                      disabled={rowBusy}
                      onClick={() => {
                        setRevokeId(k.id);
                        setActionError(null);
                      }}
                    >
                      {rowBusy ? "…" : "Revoke"}
                    </Button>
                  )}
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Scopes: {k.scopes.join(", ") || "—"}</span>
                  <span>Created {formatDate(k.createdAt)}</span>
                  <span>Last used {formatDate(k.lastUsedAt)}</span>
                  {k.expiresAt && <span>Expires {formatDate(k.expiresAt)}</span>}
                </div>

                {confirming && (
                  <div
                    data-testid={`api-key-revoke-confirm-row-${k.id}`}
                    className="flex flex-wrap items-center gap-2 border-t border-border pt-2"
                  >
                    <span className="text-xs text-muted-foreground">
                      Revoke this key? It will stop working immediately.
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      data-testid={`api-key-revoke-confirm-${k.id}`}
                      disabled={rowBusy}
                      onClick={() => void confirmRevoke(k.id)}
                    >
                      {rowBusy ? "Revoking…" : "Revoke key"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      data-testid={`api-key-revoke-cancel-${k.id}`}
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
        <p role="alert" data-testid="api-keys-action-error" className="text-xs text-destructive">
          {actionError}
        </p>
      )}
    </div>
  );
}
