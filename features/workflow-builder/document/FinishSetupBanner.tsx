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

  const tone: "attention" | "done" | "calm" =
    primary === "needs_setup" || primary === "blocked_structural"
      ? "attention"
      : primary === "ready_saved"
        ? "done"
        : "calm";

  return (
    <div
      data-testid="document-setup-banner"
      data-banner-state={primary}
      data-supported-count={supportedCount}
      role="status"
      className={`crv2-banner ${tone === "attention" ? "crv2-banner--attention" : tone === "done" ? "crv2-banner--done" : ""}`}
    >
      <span aria-hidden className="crv2-banner-mark text-[15px]">
        {primary === "ready_saved" ? "✓" : primary === "ready_unsaved" ? "⤳" : "✦"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[14px] font-semibold" style={{ color: "var(--builder-text)" }}>
          {primary === "needs_setup"
            ? "React drafted this workflow."
            : primary === "ready_unsaved"
              ? "Everything's filled in."
              : primary === "blocked_structural"
                ? "One part needs the Visual Builder."
                : "All set."}
        </p>
        <p className="m-0 mt-0.5 text-[13px]" style={{ color: "var(--builder-muted)" }}>
          {message}
        </p>
      </div>
      {primary === "needs_setup" && !queueActive ? (
        <button
          type="button"
          data-testid="document-finish-setup-button"
          onClick={onFinishSetup}
          className="crv2-banner-primary"
        >
          Finish setup
          <span
            className="rounded-full px-2 py-px text-[12px]"
            style={{ background: "rgba(255,255,255,.25)" }}
          >
            {supportedCount} left
          </span>
        </button>
      ) : null}
      {primary === "blocked_structural" && hasVisualBlockers && onOpenInVisual ? (
        <button
          type="button"
          data-testid="document-setup-open-visual"
          onClick={onOpenInVisual}
          className="crv2-banner-secondary"
        >
          Open in Visual Builder
        </button>
      ) : null}
      <button
        type="button"
        data-testid="document-open-map-button"
        onClick={onOpenMap}
        className="crv2-banner-secondary"
        title="See the whole workflow"
      >
        Whole workflow
      </button>
    </div>
  );
}
