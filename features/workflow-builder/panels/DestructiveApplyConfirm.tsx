"use client";

import { useEffect, useRef } from "react";
import {
  DESTRUCTIVE_APPLY_CONFIRM,
  describeDestructiveRemoval,
  type DestructivePreviewClassification,
} from "@/core/workflows/destructivePreview";

/**
 * Shared destructive-apply confirmation (DOC-FINAL-ACCEPTANCE-1).
 *
 * ONE confirmation component used by BOTH the center Document ghost-preview
 * Apply and the right-drawer apply-mode flow, so the two surfaces share the
 * exact wording (`DESTRUCTIVE_APPLY_CONFIRM`), the same result shape
 * (`onConfirm` / `onCancel`), and the same consequence description
 * (`describeDestructiveRemoval`). It decides nothing and applies nothing — the
 * parent still calls the single governed apply path on confirm, so stale-proposal
 * protection, checkpoints, and Agent history are untouched.
 *
 * Accessibility:
 *   - `role="alertdialog"` with labelled title + description, so a screen reader
 *     announces the destructive consequence distinctly from the preview.
 *   - Focus enters the dialog on mount (the safe "Keep my workflow" control is
 *     focused first — the non-destructive default), and returns to the opener on
 *     unmount (Cancel or Confirm) so keyboard users are never dropped.
 *   - Escape cancels.
 *   - Consequence is stated in TEXT, not color alone; the destructive action is
 *     also marked with `data-destructive` and a warning icon (aria-hidden).
 *   - No keyboard trap: it is inline content (not a modal overlay), Tab flows
 *     normally, and Escape / Cancel always exits.
 *   - Reduced-motion safe: no animation is used.
 */

export interface DestructiveApplyConfirmProps {
  readonly classification: Pick<
    DestructivePreviewClassification,
    "removedStepCount" | "removedConnectionCount"
  >;
  /** Confirm the destructive apply — the caller runs the governed apply path. */
  readonly onConfirm: () => void;
  /** Cancel — nothing is applied; focus returns to the opener. */
  readonly onCancel: () => void;
  /** testid prefix so the two host surfaces get distinct, discoverable ids. */
  readonly testIdPrefix?: string;
}

export function DestructiveApplyConfirm({
  classification,
  onConfirm,
  onCancel,
  testIdPrefix = "destructive-apply",
}: DestructiveApplyConfirmProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const titleId = `${testIdPrefix}-title`;
  const bodyId = `${testIdPrefix}-body`;
  const removalLine = describeDestructiveRemoval(classification);

  // Focus the safe default on open; restore focus to the opener on unmount.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => {
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <div
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      data-testid={`${testIdPrefix}-confirm`}
      className="flex flex-col gap-2 rounded-md p-3"
      style={{
        border: "1.5px solid var(--builder-danger, #b91c1c)",
        background: "var(--builder-panel)",
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <div className="flex items-start gap-2">
        <span aria-hidden style={{ color: "var(--builder-danger, #b91c1c)" }}>
          ⚠
        </span>
        <div className="min-w-0">
          <p
            id={titleId}
            className="m-0 text-[13px] font-semibold"
            style={{ color: "var(--builder-text)" }}
          >
            {DESTRUCTIVE_APPLY_CONFIRM.title}
          </p>
          <p
            id={bodyId}
            className="m-0 mt-1 text-[12px]"
            style={{ color: "var(--builder-text-2)" }}
          >
            {DESTRUCTIVE_APPLY_CONFIRM.body}
            {removalLine ? (
              <>
                {" "}
                <span
                  data-testid={`${testIdPrefix}-removal`}
                  className="font-semibold"
                  style={{ color: "var(--builder-text)" }}
                >
                  {removalLine}
                </span>
              </>
            ) : null}
          </p>
        </div>
      </div>
      <div className="mt-1 flex gap-2">
        <button
          ref={cancelRef}
          type="button"
          data-testid={`${testIdPrefix}-cancel`}
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-[12px] font-medium"
          style={{ color: "var(--builder-text-2)", border: "1px solid var(--builder-border)" }}
        >
          {DESTRUCTIVE_APPLY_CONFIRM.cancelLabel}
        </button>
        <button
          type="button"
          data-testid={`${testIdPrefix}-accept`}
          data-destructive="true"
          onClick={onConfirm}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold text-white"
          style={{ background: "var(--builder-danger, #b91c1c)", border: "1px solid var(--builder-danger, #b91c1c)" }}
        >
          <span aria-hidden>⚠</span>
          {DESTRUCTIVE_APPLY_CONFIRM.applyLabel}
        </button>
      </div>
    </div>
  );
}
