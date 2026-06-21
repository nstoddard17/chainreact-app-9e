"use client";

import {
  appliedConfigHintNeedsAttention,
  type AppliedConfigHint,
} from "../utils/appliedConfigHints";

/**
 * Transient post-apply confirmation + config-hint panel
 * (HERMES-AGENT-APPLY-CONFIG-HINTS).
 *
 * Renders after an explicit "Apply preview". Two parts:
 *   1. The placement-derived headline (`notice`) telling the user the preview
 *      was applied to the LOCAL draft and they still review + save normally.
 *   2. A per-node list of the required fields each newly-added node still needs,
 *      so the user knows the workflow is incomplete before saving / activating.
 *
 * The hint rows are field NAMES only — sourced from action/trigger metadata (the
 * same `missingRequiredFields` rule as the canvas "Needs setup" chip). When a
 * node's type has no metadata, it shows a conservative generic review notice. No
 * values, secrets, tokens, or credential ids ever appear here.
 *
 * Presentational only: no store reads, no side effects. The parent owns the
 * lifetime (it clears on dismiss / workflow switch / a new preview).
 */
export function BuilderApplyNotice({
  notice,
  hints,
  onDismiss,
}: {
  readonly notice: string;
  readonly hints: readonly AppliedConfigHint[];
  readonly onDismiss: () => void;
}) {
  const attention = hints.filter(appliedConfigHintNeedsAttention);

  return (
    <div
      data-testid="builder-apply-notice"
      role="status"
      className="pointer-events-auto absolute left-1/2 top-3 z-30 flex max-w-[420px] -translate-x-1/2 flex-col gap-1.5 rounded-md px-3 py-2 text-[12px] shadow-md"
      style={{
        background: "var(--builder-panel)",
        border: "1px solid var(--builder-border)",
        color: "var(--builder-text)",
      }}
    >
      <div className="flex items-center gap-3">
        <span>{notice}</span>
        <button
          type="button"
          onClick={onDismiss}
          data-testid="builder-apply-notice-dismiss"
          aria-label="Dismiss"
          className="ml-auto rounded px-1 text-[12px]"
          style={{ color: "var(--builder-muted)" }}
        >
          ✕
        </button>
      </div>

      {attention.length > 0 ? (
        <ul
          data-testid="builder-apply-config-hints"
          className="m-0 flex list-none flex-col gap-1 p-0"
        >
          {attention.map((hint) => (
            <li
              key={hint.nodeId}
              data-testid="builder-apply-config-hint"
              data-node-id={hint.nodeId}
              className="text-[11px] leading-snug"
              style={{ color: "var(--builder-muted)" }}
            >
              <span style={{ color: "var(--builder-text)" }}>{hint.label}</span>
              {": "}
              {hint.hasMetadata && hint.missingFieldLabels.length > 0 ? (
                <span>Needs configuration: {hint.missingFieldLabels.join(", ")}</span>
              ) : (
                <span>Review this step&rsquo;s required fields.</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
