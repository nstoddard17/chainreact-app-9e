"use client";

import { useState, type FormEvent } from "react";
import { startOAuth } from "@/lib/api/integrations";

interface Props {
  provider: string;
  label: string;
  /**
   * Accessible name, when the visible label is deliberately shorter than the
   * name a screen-reader user needs. The Apps grid shows a bare "Connect" —
   * the app name is right there on the card — but each button must still
   * announce WHICH app it connects, so the card passes "Connect <App>" here.
   * Defaults to `label`.
   */
  ariaLabel?: string;
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
  /**
   * Per-tenant connect-time input descriptor (from the provider manifest's
   * `connectInput`, e.g. Shopify's shop domain). When set on a plain Connect /
   * Connect-another button, clicking reveals an inline prompt; the entered
   * value is sent as `providerHint[hintKey]` to start OAuth. Ignored in
   * reconnect mode — the server rebuilds the hint from the stored row, so no
   * prompt is shown. Undefined for non-tenant providers (immediate redirect).
   */
  connectInput?: {
    hintKey: string;
    label: string;
    placeholder: string;
    help?: string;
  };
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
  ariaLabel,
  variant = "primary",
  testId,
  title,
  reconnect,
  connectInput,
}: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-tenant prompt state. Only used when `connectInput` is set on a
  // non-reconnect button (the server derives the hint for reconnect).
  const needsPrompt = connectInput !== undefined && reconnect === undefined;
  const [prompting, setPrompting] = useState(false);
  const [hintValue, setHintValue] = useState("");

  async function begin(opts?: {
    reconnect?: { integrationId: string; accountId: string };
    providerHint?: Record<string, string>;
  }) {
    setPending(true);
    setError(null);
    try {
      const { redirectUrl } = await startOAuth(provider, opts);
      window.location.assign(redirectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start OAuth.");
      setPending(false);
    }
  }

  function handleClick() {
    // Per-tenant providers reveal the inline prompt instead of redirecting
    // immediately — we need the shop domain before we can build the authorize
    // URL. Everyone else (and reconnect) starts OAuth straight away.
    if (needsPrompt) {
      setError(null);
      setPrompting(true);
      return;
    }
    void begin(reconnect !== undefined ? { reconnect } : undefined);
  }

  async function handlePromptSubmit(e: FormEvent) {
    e.preventDefault();
    const value = hintValue.trim();
    if (!value) {
      setError(`Enter your ${connectInput!.label.toLowerCase()}.`);
      return;
    }
    await begin({ providerHint: { [connectInput!.hintKey]: value } });
  }

  // Inline prompt form for per-tenant providers (e.g. Shopify shop domain).
  if (needsPrompt && prompting) {
    return (
      <form
        onSubmit={handlePromptSubmit}
        className="flex flex-col items-stretch gap-1.5"
        data-testid="connect-hint-form"
      >
        <label className="text-xs font-medium text-foreground">
          {connectInput!.label}
          <input
            type="text"
            autoFocus
            value={hintValue}
            onChange={(e) => setHintValue(e.target.value)}
            placeholder={connectInput!.placeholder}
            disabled={pending}
            data-testid="connect-hint-input"
            className="mt-1 w-64 rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
          />
        </label>
        {connectInput!.help && (
          <span className="text-[11px] text-muted-foreground">
            {connectInput!.help}
          </span>
        )}
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            data-testid="connect-hint-submit"
            className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {pending ? "Redirecting…" : "Continue"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setPrompting(false);
              setError(null);
            }}
            className="rounded border border-border bg-transparent px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
        {error && (
          <span role="alert" className="text-xs text-destructive">
            {error}
          </span>
        )}
      </form>
    );
  }

  const className =
    variant === "reconnect"
      ? "inline-flex items-center gap-1.5 rounded border border-border bg-muted px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/70 hover:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
      : variant === "outline"
        ? "rounded border border-border bg-transparent px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
        : "rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60";

  // While pending the visible text becomes "Redirecting…", so the override is
  // dropped rather than announcing a stale "Connect <App>".
  const accessibleName =
    ariaLabel !== undefined && !pending ? { "aria-label": ariaLabel } : {};

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={className}
        {...(testId !== undefined && { "data-testid": testId })}
        {...(title !== undefined && { title })}
        {...accessibleName}
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
