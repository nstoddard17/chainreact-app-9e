"use client";

import { useState } from "react";
import type { OptionsRecoveryDescriptor } from "@/core/workflows/options/optionsRecovery";
import { reconnectHrefForProvider } from "@/core/workflows/options/optionsRecovery";

/**
 * Shared recovery block for a resolver-backed setup field (REACT-AGENT-RESOLVER-RECOVERY-1).
 *
 * Rendered by BOTH React-rail setup cards (preview nodes and existing draft nodes) whenever an
 * option source cannot produce a pickable list. It replaces the previous dead end — a single
 * "Couldn't load options. You can finish this in the step editor." string with no working action —
 * with the honest state plus every recovery the situation actually supports:
 *
 *   - **Try again** — re-issues the SAME request through the existing hook (`useOptionsSource`
 *     → `GET /api/options/[source]`). Shown only when retrying can plausibly succeed.
 *   - **Connect <provider>** — REACT-AGENT-PREAPPLY-SETUP-UX-1: when the caller can run the rail's
 *     own OAuth popup (`onConnectProvider`), that is the PRIMARY recovery and the user never leaves
 *     the rail. Sending someone to the Apps page for an ordinary missing connection abandons the
 *     guided journey mid-step, so the Apps deep link is kept only as an Advanced fallback — and
 *     stays primary when no popup handler was supplied (e.g. outside the rail).
 *   - **Open step editor** — supplied by the caller (it owns node selection); the button only
 *     renders when a working handler was passed, so the copy can never promise a path that
 *     doesn't exist.
 *   - **Enter ID manually** — a deliberate, labeled fallback for resolver-backed fields whose
 *     stored value is a provider identifier.
 *
 * GUARANTEES (presentational only): no store access, no fetch, no model/Hermes call, no secret.
 * All copy comes from the pure `classifyOptionsRecovery` descriptor; provider bodies, tokens,
 * scopes and stack traces never reach this component because the options route never returns them.
 */

const boxStyle = {
  background: "var(--builder-panel-2)",
  border: "1px solid var(--builder-border)",
} as const;

const actionStyle = {
  color: "var(--builder-accent)",
} as const;

export interface SetupFieldRecoveryProps {
  /** The classified, honest state. */
  readonly descriptor: OptionsRecoveryDescriptor;
  /** Fully-formed testid root owned by the caller (`preview-setup-<id>-<field>` / `node-setup-…`). */
  readonly testid: string;
  /** Re-issue the option request. Rendered only when `descriptor.canRetry`. */
  readonly onRetry: () => void;
  /**
   * Open this field's node in its normal configuration panel, focused on this field. Absent → the
   * button is not rendered AND no copy claims the step editor is available.
   */
  readonly onOpenStepEditor?: (() => void) | undefined;
  /** Label for the step-editor action — callers whose node is not in the draft yet say so. */
  readonly openStepEditorLabel?: string;
  /** Tooltip for the step-editor action. */
  readonly openStepEditorTitle?: string;
  /** Switch this field into hand-typed-ID mode. Absent → manual entry unsupported for this field. */
  readonly onEnterManualMode?: (() => void) | undefined;
  /** Why manual entry is unavailable, when it is. Shown instead of the manual action. */
  readonly manualUnavailableReason?: string;
  /**
   * REACT-AGENT-PREAPPLY-SETUP-UX-1 — connect this field's provider through the rail's existing
   * OAuth popup, returning to the rail automatically. When supplied AND the descriptor is a
   * connection problem, this becomes the primary action and the Apps deep link moves under
   * Advanced. Absent → unchanged behaviour (the Apps link stays the reconnect path).
   */
  readonly onConnectProvider?: (() => void) | undefined;
  /** Display name for the connect action ("Connect Slack"). */
  readonly connectProviderLabel?: string;
  /** True while a connect popup for this provider is in flight. */
  readonly connecting?: boolean;
}

export function SetupFieldRecovery({
  descriptor,
  testid,
  onRetry,
  onOpenStepEditor,
  openStepEditorLabel,
  openStepEditorTitle,
  onEnterManualMode,
  manualUnavailableReason,
  onConnectProvider,
  connectProviderLabel,
  connecting,
}: SetupFieldRecoveryProps) {
  const showManual = descriptor.canEnterManually && onEnterManualMode !== undefined;
  // An in-rail connect is only meaningful when the problem IS the connection.
  const canConnectInRail = descriptor.canReconnect && onConnectProvider !== undefined;
  // Advanced holds the escape hatches: leaving for the Apps page, and typing a raw
  // provider ID. Both are legitimate; neither is what an ordinary user reaches for first.
  const hasAdvanced = canConnectInRail || showManual;
  const [advancedOpen, setAdvancedOpen] = useState(false);
  return (
    <div
      data-testid={`${testid}-error`}
      data-recovery-kind={descriptor.kind}
      role="status"
      className="mt-0.5 rounded px-2 py-1.5 text-[11px]"
      style={{ ...boxStyle, color: "var(--builder-text)" }}
    >
      <div data-testid={`${testid}-recovery-headline`}>{descriptor.headline}</div>
      {descriptor.detail ? (
        <div className="mt-0.5" style={{ color: "var(--builder-muted)" }}>
          {descriptor.detail}
        </div>
      ) : null}

      {/* Primary recovery for a connection problem: connect right here, in the rail. */}
      {canConnectInRail && (
        <button
          type="button"
          data-testid={`${testid}-connect`}
          onClick={onConnectProvider}
          disabled={connecting === true}
          className="mt-1 rounded-md px-2.5 py-1 text-[11.5px] font-semibold text-white disabled:opacity-60"
          style={{ background: "var(--builder-accent)", border: "1px solid var(--builder-accent)" }}
          title={`Connect ${connectProviderLabel ?? "this app"} in a popup window — you'll come right back here`}
        >
          {connecting === true ? "Waiting…" : `Connect ${connectProviderLabel ?? "app"}`}
        </button>
      )}

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        {descriptor.canRetry && (
          <button
            type="button"
            data-testid={`${testid}-retry`}
            onClick={onRetry}
            className="underline"
            style={actionStyle}
          >
            Try again
          </button>
        )}
        {/* No popup handler (outside the rail) → the Apps link remains the primary path. */}
        {descriptor.canReconnect && !canConnectInRail && (
          <a
            data-testid={`${testid}-reconnect`}
            href={reconnectHrefForProvider(descriptor.reconnectProvider)}
            className="underline"
            style={actionStyle}
          >
            Reconnect in Apps
          </a>
        )}
        {onOpenStepEditor && (
          <button
            type="button"
            data-testid={`${testid}-open-step-editor`}
            onClick={onOpenStepEditor}
            className="underline"
            style={actionStyle}
            {...(openStepEditorTitle ? { title: openStepEditorTitle } : {})}
          >
            {openStepEditorLabel ?? "Open step editor"}
          </button>
        )}
      </div>

      {/* Advanced: the Apps page and hand-typed provider IDs. Present but never
          the first thing offered — see the note on `hasAdvanced` above. */}
      {hasAdvanced ? (
        <div className="mt-1">
          <button
            type="button"
            data-testid={`${testid}-advanced-toggle`}
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((open) => !open)}
            className="underline"
            style={{ color: "var(--builder-muted)" }}
          >
            {advancedOpen ? "Hide advanced" : "Advanced"}
          </button>
          {advancedOpen ? (
            <div
              data-testid={`${testid}-advanced`}
              className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1"
            >
              {canConnectInRail && (
                <a
                  data-testid={`${testid}-reconnect`}
                  href={reconnectHrefForProvider(descriptor.reconnectProvider)}
                  className="underline"
                  style={actionStyle}
                >
                  Reconnect in Apps
                </a>
              )}
              {showManual && (
                <button
                  type="button"
                  data-testid={`${testid}-manual-toggle`}
                  onClick={onEnterManualMode}
                  className="underline"
                  style={actionStyle}
                >
                  Enter ID manually
                </button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {!showManual && manualUnavailableReason ? (
        <div
          data-testid={`${testid}-manual-unavailable`}
          className="mt-1"
          style={{ color: "var(--builder-muted)" }}
        >
          {manualUnavailableReason}
        </div>
      ) : null}
    </div>
  );
}
