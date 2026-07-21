"use client";

import type { SetupBannerState } from "./setupQueueModel";

/**
 * 5.DUAL-BUILDER-1 CS-3 — the Document setup-status banner.
 *
 * A calm status line near the top of the Document that explains, in plain
 * language, what still needs the user — derived from the SAME live signals as
 * the header issues pill (supported setup count + blocking-error count +
 * dirty). It NEVER duplicates the header's lifecycle controls and NEVER enables
 * activation: it only explains state and offers "Finish setup" (the opt-in
 * queue), a Visual-Builder handoff for structural blockers, and a Save reminder
 * for a ready-but-unsaved draft. The header Turn on / Save remain authoritative.
 */
export function FinishSetupBanner({
  state,
  queueActive,
  onFinishSetup,
  onOpenMap,
  onOpenInVisual,
}: {
  state: SetupBannerState;
  queueActive: boolean;
  onFinishSetup: () => void;
  onOpenMap: () => void;
  onOpenInVisual?: (() => void) | undefined;
}) {
  const { primary, supportedCount, hasVisualBlockers } = state;

  const message =
    primary === "needs_setup"
      ? supportedCount === 1
        ? "1 detail still needs you."
        : `${supportedCount} details still need you.`
      : primary === "blocked_structural"
        ? "Some parts of this workflow need the Visual Builder before it can run."
        : primary === "ready_unsaved"
          ? "Everything's filled in — save to keep your changes."
          : "This workflow is set up. Nothing else needs you here.";

  const tone =
    primary === "needs_setup" || primary === "blocked_structural" ? "attention" : "calm";

  return (
    <div
      data-testid="document-setup-banner"
      data-banner-state={primary}
      data-supported-count={supportedCount}
      role="status"
      className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-4 py-3"
      style={{
        background: tone === "attention" ? "var(--builder-accent-soft)" : "var(--builder-panel-2)",
        border:
          tone === "attention"
            ? "1.5px solid var(--builder-accent)"
            : "1px solid var(--builder-border)",
      }}
    >
      <span
        aria-hidden
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px]"
        style={{
          background: tone === "attention" ? "var(--builder-accent)" : "var(--builder-panel)",
          color: tone === "attention" ? "var(--builder-panel)" : "var(--builder-muted)",
          border: "1px solid var(--builder-border)",
        }}
      >
        {primary === "ready_saved" ? "✓" : primary === "ready_unsaved" ? "⤳" : "◆"}
      </span>
      <p
        className="m-0 min-w-0 flex-1 text-[13.5px] font-medium"
        style={{ color: "var(--builder-text)" }}
      >
        {message}
      </p>
      {primary === "needs_setup" && !queueActive ? (
        <button
          type="button"
          data-testid="document-finish-setup-button"
          onClick={onFinishSetup}
          className="inline-flex h-8 items-center rounded-md px-3.5 text-[12.5px] font-semibold"
          style={{ background: "var(--builder-text)", color: "var(--builder-panel)" }}
        >
          Finish setup · {supportedCount} left
        </button>
      ) : null}
      {primary === "blocked_structural" && hasVisualBlockers && onOpenInVisual ? (
        <button
          type="button"
          data-testid="document-setup-open-visual"
          onClick={onOpenInVisual}
          className="inline-flex h-8 items-center rounded-md px-3 text-[12.5px] font-medium"
          style={{
            background: "var(--builder-panel)",
            color: "var(--builder-text)",
            border: "1px solid var(--builder-border)",
          }}
        >
          Open in Visual Builder
        </button>
      ) : null}
      <button
        type="button"
        data-testid="document-open-map-button"
        onClick={onOpenMap}
        className="inline-flex h-8 items-center rounded-md px-3 text-[12.5px] font-medium"
        style={{
          background: "var(--builder-panel)",
          color: "var(--builder-text-2)",
          border: "1px solid var(--builder-border)",
        }}
        title="See the whole workflow"
      >
        Whole workflow
      </button>
    </div>
  );
}
