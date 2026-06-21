"use client";

import { useState } from "react";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import { WorkflowGuidancePanel } from "@/features/workflows/WorkflowGuidancePanel";

/**
 * Builder-context "Build with me" entry (HERMES-AGENT-GUIDANCE-UI-BUILDER).
 *
 * A second, builder-scoped entry point for the advisory Hermes Agent workflow guidance that already
 * ships on the workflows dashboard. It is a thin wrapper around {@link WorkflowGuidancePanel}: a
 * compact collapsed pill that, when opened, reveals the SAME advisory panel — passing the current
 * builder `workflowId` so the server can load + sanitize the saved draft as context. It reuses the
 * existing request helper / route / panel; it adds NO new request logic.
 *
 * ADVISORY ONLY — same contract as the panel it wraps. It NEVER creates, changes, applies, or runs a
 * workflow; it only renders the normalized `guidanceText` returned by the ChainReact route. It calls
 * ONLY `POST /api/accounts/[id]/ai/workflow-guidance` (through the panel's helper), never the Render
 * gateway / a model vendor / Nous / the private Hermes Agent, and never sees a token. `accountId` and
 * `workflowId` come from trusted server/builder context (props) — never arbitrary user input.
 *
 * Rendered as a floating overlay anchored bottom-left of the builder canvas. It starts COLLAPSED so
 * it never obscures the canvas; the pointer-events wrapper lets canvas interactions pass through
 * everywhere except the entry itself.
 */

export interface BuilderGuidanceEntryProps {
  /** Account scope for the request — the workflow's owning account, resolved server-side. */
  readonly accountId: string;
  /** The workflow currently open in the builder — forwarded as trusted draft context. */
  readonly workflowId: string;
  /**
   * HERMES-AGENT-BUILDER-PREVIEW-OVERLAY: hand the latest `DraftPreview` to the builder's non-applied
   * canvas overlay (UI state owned by `WorkflowBuilder`). Wiring only — never applies/mutates anything.
   */
  readonly onShowPreview?: (preview: DraftPreview) => void;
}

export function BuilderGuidanceEntry({ accountId, workflowId, onShowPreview }: BuilderGuidanceEntryProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      data-testid="builder-guidance-entry"
      className="pointer-events-none absolute bottom-4 left-4 z-20 flex max-w-[420px] flex-col gap-2"
    >
      {open && (
        <div className="pointer-events-auto w-[380px] max-w-[90vw]">
          {/* Reuse the dashboard panel verbatim — only the builder workflowId + the canvas-preview
              hook differ. The hook adds a "Show on canvas" affordance (no apply implication). */}
          <WorkflowGuidancePanel
            accountId={accountId}
            workflowId={workflowId}
            {...(onShowPreview ? { onPreviewToCanvas: onShowPreview } : {})}
          />
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="builder-guidance-toggle"
        aria-expanded={open}
        aria-label={open ? "Hide Build with me" : "Build with me"}
        className="pointer-events-auto inline-flex w-fit items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-medium shadow-md"
        style={{
          background: "var(--builder-panel)",
          color: "var(--builder-text)",
          border: "1px solid var(--builder-border)",
        }}
        title="Ask for help improving or finishing this workflow (guidance only)"
      >
        <SparkleIcon />
        {open ? "Hide" : "Build with me"}
      </button>
    </div>
  );
}

const SparkleIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" />
    <path d="M19 14l.7 1.9L21.5 17l-1.9.7L19 19.5l-.7-1.9L16.5 17l1.9-.7z" />
  </svg>
);
