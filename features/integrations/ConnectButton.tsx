"use client";

import { useState } from "react";
import { startOAuth } from "@/lib/api/integrations";

interface Props {
  provider: string;
  label: string;
  /**
   * Visual treatment.
   *   - `primary` (default) is the filled Connect CTA.
   *   - `outline` is a flat bordered, transparent affordance.
   *   - `reconnect` is a filled-secondary treatment (muted background +
   *     border + shadow + leading refresh glyph) used for Reconnect on an
   *     already-connected card. It lifts off the card so the recovery
   *     action is noticeable, while staying clearly subordinate to the
   *     filled-primary Connect CTA (never destructive, never primary).
   */
  variant?: "primary" | "outline" | "reconnect";
  /** Optional test id so callers (e.g. the Apps card Reconnect) are selectable. */
  testId?: string;
  /** Optional native tooltip (e.g. Reconnect → "Reconnect this account"). */
  title?: string;
  /**
   * Per-account reconnect (Slice 4.APPS-RECONNECT). When set, the OAuth flow
   * targets this SPECIFIC connected row — the server steers the provider sign-in
   * to it and refuses to refresh a different account. Carries only opaque ids.
   * Omitted for plain Connect / Connect-another.
   */
  reconnect?: { integrationId: string; accountId: string };
}

/**
 * Initiates the OAuth handshake for the given provider.
 *
 * Per workflow-builder-ui.md / project-structure-and-module-boundaries.md §4-5:
 *   - The component never calls fetch directly.
 *   - It calls the typed client API (`startOAuth`) which wraps fetch + error handling.
 *   - The provider's authorize URL is an external destination, so we use
 *     `window.location.assign(...)` (testable + idiomatic for full-page nav).
 */
export function ConnectButton({
  provider,
  label,
  variant = "primary",
  testId,
  title,
  reconnect,
}: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    try {
      // Plain Connect / Connect-another call the one-arg form (unchanged); only a
      // per-account Reconnect passes the opaque reconnect bundle.
      const { redirectUrl } =
        reconnect !== undefined
          ? await startOAuth(provider, { reconnect })
          : await startOAuth(provider);
      window.location.assign(redirectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start OAuth.");
      setPending(false);
    }
  }

  const className =
    variant === "reconnect"
      ? "inline-flex items-center gap-1.5 rounded border border-border bg-muted px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/70 hover:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
      : variant === "outline"
        ? "rounded border border-border bg-transparent px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
        : "rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60";

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={className}
        {...(testId !== undefined && { "data-testid": testId })}
        {...(title !== undefined && { title })}
      >
        {variant === "reconnect" && <RefreshIcon spinning={pending} />}
        {pending ? "Redirecting…" : label}
      </button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}

/**
 * Circular-arrows glyph that reads as "refresh / re-authorize". Spins while
 * the OAuth redirect is in flight to reinforce the in-progress state.
 */
function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0${spinning ? " animate-spin" : ""}`}
    >
      <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
      <polyline points="13.5 2.5 13.5 5 11 5" />
    </svg>
  );
}
