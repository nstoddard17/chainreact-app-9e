"use client";

import type { AnonGateReason } from "@/lib/anonymousBuilder";

/**
 * ANON-BUILDER-3 Scope C — post-restore next-action banner.
 *
 * Shown once in the authenticated builder right after an anonymous draft was
 * restored, reminding the user what they were trying to do before sign-up. It is
 * PURELY informational + dismissible: it never auto-saves, auto-activates,
 * auto-runs, or auto-connects (the draft is saved; lifecycle actions stay
 * explicit via the normal header controls).
 */

const REASON_COPY: Record<AnonGateReason, string> = {
  save: "Your draft was restored and saved. You can keep editing or activate when ready.",
  activate: "Your draft was restored. Review the required fields, then activate.",
  run: "Your draft was restored. Save/activate or run when ready.",
  connect: "Your draft was restored. Connect the required app from this step when ready.",
  ai: "Your draft was restored. You can continue with React Agent now that you're signed in.",
};

export function RestoredDraftBanner({
  reason,
  onDismiss,
}: {
  reason: AnonGateReason;
  onDismiss: () => void;
}) {
  return (
    <div
      data-testid="restored-draft-banner"
      data-reason={reason}
      role="status"
      className="flex items-center justify-between gap-3 px-3 py-2 text-[12px]"
      style={{
        background: "var(--builder-panel-2)",
        borderBottom: "1px solid var(--builder-border)",
        color: "var(--builder-text-2)",
      }}
    >
      <span>{REASON_COPY[reason]}</span>
      <button
        type="button"
        onClick={onDismiss}
        data-testid="restored-draft-banner-dismiss"
        aria-label="Dismiss"
        className="shrink-0 rounded px-1.5 py-0.5"
        style={{ color: "var(--builder-muted)" }}
      >
        ✕
      </button>
    </div>
  );
}
