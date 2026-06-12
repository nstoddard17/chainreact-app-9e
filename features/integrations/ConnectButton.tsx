"use client";

import { useState } from "react";
import { startOAuth } from "@/lib/api/integrations";

interface Props {
  provider: string;
  label: string;
  /**
   * Visual treatment. `primary` (default) is the filled Connect CTA;
   * `outline` is a lighter affordance used for Reconnect on an
   * already-connected card so it reads as secondary to Connect.
   */
  variant?: "primary" | "outline";
  /** Optional test id so callers (e.g. the Apps card Reconnect) are selectable. */
  testId?: string;
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
}: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    try {
      const { redirectUrl } = await startOAuth(provider);
      window.location.assign(redirectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start OAuth.");
      setPending(false);
    }
  }

  const className =
    variant === "outline"
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
      >
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
