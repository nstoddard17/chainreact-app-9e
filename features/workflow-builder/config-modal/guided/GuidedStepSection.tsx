"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";

/**
 * One step of the guided spreadsheet accordion
 * (SHEETS-GUIDED-CONFIG-1).
 *
 * Accessibility notes that are load-bearing rather than decorative:
 *
 *   - The header is a real `<button aria-expanded aria-controls>` and the
 *     body is a labelled `region`. A `<details>` element would have been
 *     less code, but its summary cannot carry the live status text this
 *     design puts in the header without nesting interactive content.
 *   - Completion is announced in WORDS ("Done"), never by the tint or the
 *     tick alone — colour is not a channel every user has.
 *   - The heading is an `<h3>` wrapping the button so the panel keeps a
 *     navigable heading structure under the existing `<h2>` node title.
 */

export interface GuidedStepSectionProps {
  readonly stepId: string;
  /** 1-based position, shown in the bubble when the step is not complete. */
  readonly index: number;
  readonly title: string;
  /** Live one-line summary. Empty renders the fallback hint. */
  readonly summary: string;
  readonly fallbackSummary: string;
  readonly complete: boolean;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly children: React.ReactNode;
  /** Rendered at the end of the body — usually the "next step" control. */
  readonly footer?: React.ReactNode;
}

export const GuidedStepSection = React.forwardRef<
  HTMLButtonElement,
  GuidedStepSectionProps
>(function GuidedStepSection(
  {
    stepId,
    index,
    title,
    summary,
    fallbackSummary,
    complete,
    open,
    onToggle,
    children,
    footer,
  },
  ref,
) {
  const headerId = `guided-step-${stepId}-header`;
  const bodyId = `guided-step-${stepId}-body`;

  return (
    <section
      className={`min-w-0 overflow-hidden rounded-lg border ${
        open ? "border-input shadow-sm" : "border-input/70"
      } ${complete && !open ? "bg-muted/30" : "bg-card"}`}
      data-testid={`guided-step-${stepId}`}
      data-complete={complete ? "true" : "false"}
      data-open={open ? "true" : "false"}
    >
      <h3 className="m-0">
        <button
          ref={ref}
          type="button"
          id={headerId}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
          data-testid={`guided-step-${stepId}-header`}
          className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/40"
        >
          <span
            aria-hidden
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
              complete
                ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                : open
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-muted text-muted-foreground"
            }`}
          >
            {complete ? <Check className="h-3.5 w-3.5" /> : index}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold leading-tight">
              {title}
            </span>
            <span
              className="mt-0.5 block truncate text-xs text-muted-foreground"
              data-testid={`guided-step-${stepId}-summary`}
            >
              {summary.length > 0 ? summary : fallbackSummary}
            </span>
          </span>
          {/* Status in words — the tick and the tint are reinforcement only. */}
          <span className="sr-only">{complete ? "Done" : "Not finished"}</span>
          <ChevronDown
            aria-hidden
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
      </h3>
      {/* SPREADSHEET-GUIDED-CONFIG-S3 — `min-w-0` on the step body. The
          section above carries `overflow-hidden` for its rounded corners,
          which CLIPS a burst instead of showing it: without this the panel
          measured a scroll overflow at every swept width while looking
          merely "cut off" on screen. Every field inside is now free to
          shrink to the width it was actually allocated. */}
      <div
        id={bodyId}
        role="region"
        aria-labelledby={headerId}
        hidden={!open}
        className="flex min-w-0 flex-col gap-3 border-t p-3"
      >
        {children}
        {footer}
      </div>
    </section>
  );
});
