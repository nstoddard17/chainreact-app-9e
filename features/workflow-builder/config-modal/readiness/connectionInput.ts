import type { AgentConnectionSignal } from "@/core/workflows/agentReadiness";

/**
 * CONNECTION-AWARE-READINESS-1 — pure translation from the builder's
 * server-resolved connection signal (`useConnectionReadiness`, backed by
 * the diagnostics brain via `POST /api/workflows/[id]/connection-readiness`)
 * to the readiness banner's per-node connection input.
 *
 * Honesty rules:
 *   - Connection truth comes ONLY from the server signal. Nothing here
 *     infers, caches, or invents state.
 *   - `loading` renders as `checking` and `error`/`disabled`/absent
 *     provider entries render as `unknown` — BOTH block "Ready to run".
 *     A non-OK access verdict (e.g. a workflow the caller's account
 *     cannot see) surfaces from the hook as `error`, so a connection
 *     from another account can never satisfy readiness.
 *   - Native / connectionless nodes short-circuit to `not-required`
 *     before the signal is consulted.
 */

export type ConfigConnectionStatus =
  | "not-required"
  | "checking"
  | "connected"
  | "missing"
  | "reconnect-required"
  | "attention"
  | "unknown";

export interface ConfigConnectionInput {
  readonly status: ConfigConnectionStatus;
  /** Friendly provider name for banner copy ("Microsoft Excel"). */
  readonly providerDisplayName: string;
}

/** Invalid-connection reasons a user can fix by re-authorizing the app. */
const RECONNECTABLE_REASONS: ReadonlySet<string> = new Set([
  "needs_reconnect",
  "token_expired",
  "missing_scopes",
  "disconnected",
]);

export function connectionInputForProvider(input: {
  /** From the node metadata's `requiresIntegration` (false for native/logic nodes). */
  readonly requiresConnection: boolean;
  readonly provider: string;
  readonly signal: AgentConnectionSignal;
  /** Fallback display name when the signal carries none. */
  readonly fallbackDisplayName?: string;
}): ConfigConnectionInput {
  const { requiresConnection, provider, signal, fallbackDisplayName } = input;
  const fallbackName = fallbackDisplayName ?? provider;

  if (!requiresConnection) {
    return { status: "not-required", providerDisplayName: fallbackName };
  }
  if (signal.state === "loading") {
    return { status: "checking", providerDisplayName: fallbackName };
  }
  if (signal.state === "disabled" || signal.state === "error") {
    return { status: "unknown", providerDisplayName: fallbackName };
  }

  const entry = signal.providers.find((p) => p.provider === provider);
  if (!entry) {
    // The server did not report on this provider (should not happen when
    // the checked graph contains this node) — never guess "connected".
    return { status: "unknown", providerDisplayName: fallbackName };
  }

  const providerDisplayName = entry.name ?? fallbackName;
  if (entry.state === "connected") {
    return { status: "connected", providerDisplayName };
  }
  if (entry.state === "missing") {
    return { status: "missing", providerDisplayName };
  }
  // `invalid` — a connection exists but is not usable. Reasons the user
  // can fix by re-authorizing map to the Reconnect CTA; anything else
  // (e.g. provider disabled) gets neutral "needs attention" copy.
  return {
    status:
      entry.reasonCode !== undefined && RECONNECTABLE_REASONS.has(entry.reasonCode)
        ? "reconnect-required"
        : "attention",
    providerDisplayName,
  };
}
