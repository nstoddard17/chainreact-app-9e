"use client";

import { useState, type CSSProperties } from "react";
import type {
  AgentApplyMode,
  AgentApplyModeAvailability,
} from "@/core/workflows/agentApplyModes";
import type { DestructivePreviewClassification } from "@/core/workflows/destructivePreview";
import { DestructiveApplyConfirm } from "./DestructiveApplyConfirm";

/**
 * React Agent apply-mode picker (REACT-AGENT-APPLY-MODES-1) — the right-rail
 * "Review changes" action group. Replaces the single Apply/Discard pair with the
 * explicit apply modes (Apply to draft / Apply and test / Keep as preview) plus
 * Discard.
 *
 * Presentational ONLY: every availability decision (enabled / disabled reason /
 * confirmation / warning) is computed deterministically upstream by
 * `computeAgentApplyModes` and arrives via `modes`. This component just renders
 * the buttons, shows the reason/warning, and gates a confirmation-required mode
 * behind an inline confirm step. It never decides what is safe.
 */

export interface AgentApplyModeActionsProps {
  /** The three modes (apply_to_draft, apply_and_test, preview_only) in display order. */
  readonly modes: readonly AgentApplyModeAvailability[];
  /** Invoked with the chosen mode once any required confirmation is satisfied. */
  readonly onSelectMode: (mode: AgentApplyMode) => void;
  /** Discard the preview entirely (graph unchanged). */
  readonly onDiscard: () => void;
  /**
   * DOC-FINAL-ACCEPTANCE-1 — the shared destructive classification (the SAME value
   * the center Document preview reads). When `isDestructive`, choosing an APPLYING
   * mode (apply to draft / apply and test) routes through the shared
   * `DestructiveApplyConfirm` before `onSelectMode` — same wording, same result
   * type, same governed apply command. `preview_only` and Discard never confirm.
   */
  readonly destructive?: DestructivePreviewClassification | null | undefined;
}

const APPLYING_MODES: ReadonlySet<AgentApplyMode> = new Set([
  "apply_to_draft",
  "apply_and_test",
]);

/** Visual emphasis per mode: apply-to-draft is primary, apply-and-test secondary, keep tertiary. */
const MODE_VARIANT: Record<AgentApplyMode, "primary" | "secondary" | "tertiary"> = {
  apply_to_draft: "primary",
  apply_and_test: "secondary",
  preview_only: "tertiary",
};

function buttonStyle(variant: "primary" | "secondary" | "tertiary"): CSSProperties {
  if (variant === "primary") {
    return { background: "var(--builder-accent)", color: "white", border: "1px solid var(--builder-accent)" };
  }
  if (variant === "secondary") {
    return { color: "var(--builder-accent)", border: "1px solid var(--builder-accent)" };
  }
  return { color: "var(--builder-text-2)", border: "1px solid var(--builder-border)" };
}

export function AgentApplyModeActions({
  modes,
  onSelectMode,
  onDiscard,
  destructive,
}: AgentApplyModeActionsProps) {
  // The mode awaiting an explicit confirm, or null. Only confirmation-required modes use this.
  const [confirmingMode, setConfirmingMode] = useState<AgentApplyMode | null>(null);
  // DOC-FINAL-ACCEPTANCE-1 — the applying mode awaiting the shared destructive confirm.
  const [destructiveMode, setDestructiveMode] = useState<AgentApplyMode | null>(null);

  const confirming = confirmingMode
    ? modes.find((m) => m.mode === confirmingMode) ?? null
    : null;

  const isDestructive = destructive?.isDestructive === true;

  function handleClick(mode: AgentApplyModeAvailability): void {
    if (!mode.enabled) return;
    // A destructive proposal takes precedence over the risk confirm for an
    // applying mode — the removal is the stronger consequence and both share the
    // one confirmation component. Non-applying modes (Keep as preview) never confirm.
    if (isDestructive && APPLYING_MODES.has(mode.mode)) {
      setDestructiveMode(mode.mode);
      return;
    }
    if (mode.confirmationRequired) {
      setConfirmingMode(mode.mode);
      return;
    }
    onSelectMode(mode.mode);
  }

  if (destructiveMode && destructive) {
    return (
      <DestructiveApplyConfirm
        testIdPrefix="agent-apply-mode-destructive"
        classification={destructive}
        onCancel={() => setDestructiveMode(null)}
        onConfirm={() => {
          const mode = destructiveMode;
          setDestructiveMode(null);
          onSelectMode(mode);
        }}
      />
    );
  }

  if (confirming) {
    return (
      <div
        data-testid="agent-apply-mode-confirm"
        className="flex flex-col gap-2 rounded-md p-2 pt-1"
        style={{ border: "1px solid var(--builder-warning, #b45309)" }}
      >
        <p className="text-[12px]" style={{ color: "var(--builder-text)" }}>
          {confirming.warning
            ? `${confirming.warning} Apply anyway?`
            : "This is a high-risk change. Apply anyway?"}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="agent-apply-mode-confirm-accept"
            onClick={() => {
              const mode = confirming.mode;
              setConfirmingMode(null);
              onSelectMode(mode);
            }}
            className="flex-1 rounded-md px-2.5 py-1.5 text-[12px] font-semibold text-white"
            style={{ background: "var(--builder-accent)", border: "1px solid var(--builder-accent)" }}
          >
            {confirming.label} anyway
          </button>
          <button
            type="button"
            data-testid="agent-apply-mode-confirm-cancel"
            onClick={() => setConfirmingMode(null)}
            className="rounded-md px-2.5 py-1.5 text-[12px] font-medium"
            style={{ color: "var(--builder-text-2)", border: "1px solid var(--builder-border)" }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="agent-apply-mode-actions" className="flex flex-col gap-1.5 pt-1">
      {modes.map((m) => (
        <div key={m.mode} className="flex flex-col gap-0.5">
          <button
            type="button"
            data-testid={`agent-apply-mode-${m.mode}`}
            disabled={!m.enabled}
            aria-disabled={!m.enabled}
            onClick={() => handleClick(m)}
            title={m.enabled ? m.description : m.disabledReason}
            className="rounded-md px-2.5 py-1.5 text-left text-[12px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            style={buttonStyle(MODE_VARIANT[m.mode])}
          >
            {m.label}
          </button>
          {m.enabled && m.warning ? (
            <p
              data-testid={`agent-apply-mode-${m.mode}-warning`}
              className="text-[11px]"
              style={{ color: "var(--builder-warning, #b45309)" }}
            >
              {m.warning}
            </p>
          ) : null}
          {!m.enabled && m.disabledReason ? (
            <p
              data-testid={`agent-apply-mode-${m.mode}-reason`}
              className="text-[11px]"
              style={{ color: "var(--builder-muted)" }}
            >
              {m.disabledReason}
            </p>
          ) : null}
        </div>
      ))}
      <button
        type="button"
        data-testid="agent-apply-mode-discard"
        onClick={onDiscard}
        className="mt-0.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium"
        style={{ color: "var(--builder-text-2)", border: "1px solid var(--builder-border)" }}
        title="Discard preview (your workflow is unchanged)"
      >
        Discard
      </button>
    </div>
  );
}
