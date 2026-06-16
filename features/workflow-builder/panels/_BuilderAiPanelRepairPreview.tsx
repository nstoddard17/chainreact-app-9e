"use client";

import { Button } from "@/components/ui/button";
import type { RepairPreview } from "@/lib/api/ai";
import { RepairPreviewGoToTarget } from "./_BuilderAiPanelRepairGoTo";

/**
 * Slice 4.AI-REPAIR-2c — immutable, UI-OWNED "nothing changed" notice for a
 * validated patch PREVIEW. UI constant (never the server's `notAppliedNotice`) so
 * the safety guarantee can't be altered by a model/route response.
 */
const REPAIR_PREVIEW_NOT_APPLIED_NOTICE_UI =
  "This is a preview only — your workflow wasn't changed, saved, or run.";

/**
 * Slice 4.AI-REPAIR-2c — renders the VALIDATED PATCH PREVIEW bubble: a plain-language
 * summary, the label-based change list, the DETERMINISTIC (validator-recomputed)
 * risk, an optional candidate/cost summary, and — when the patch failed validation
 * — a friendly blocked reason + humanized validation messages. Pure presentational;
 * shows ONLY the safe, client-owned `RepairPreview` (no raw node ids, no raw JSON,
 * no model metadata).
 *
 * Slice 4.AI-REPAIR-3E — when `canApply` is true (the LATEST preview, server-marked
 * applyable, with the opaque operations + baseRevision), it renders the Apply button.
 * The raw operations are NEVER rendered — only the value-free `changes`. Apply is hidden
 * for a blocked / non-latest / metadata-less preview. On success it shows "Applied fix.
 * Workflow not run."; on stale/blocked/network failure it shows safe copy and removes
 * the button (the user re-runs Check / Preview).
 *
 * Extracted from `_BuilderAiPanelDiagnosis.tsx` (Slice 4.AI-REPAIR-3F) to keep each
 * panel module under the project's max-lines threshold. Behavior, copy, and testIds
 * are unchanged.
 */
export function RepairPreviewBody({
  preview,
  canApply = false,
  applying = false,
  applied = false,
  applyError = null,
  onApply,
}: {
  readonly preview: RepairPreview;
  /** Show the Apply button — set true only for the LATEST applyable preview. */
  readonly canApply?: boolean;
  /** An apply round-trip is in flight (disables the button). */
  readonly applying?: boolean;
  /** This preview was applied (success line; no button). */
  readonly applied?: boolean;
  /** Safe stale/blocked/network copy for a failed apply (removes the button). */
  readonly applyError?: string | null;
  /** Explicit-click handler (never auto-called). */
  readonly onApply?: () => void;
}) {
  const blocked = !preview.ok;
  return (
    <div data-testid="builder-ai-repair-preview" className="flex flex-col gap-2">
      <p className="text-[11px] font-medium" style={{ color: "var(--builder-muted)" }}>
        Proposed changes (preview)
      </p>
      <p
        data-testid="builder-ai-repair-preview-summary"
        className="whitespace-pre-wrap text-xs"
        style={{ color: "var(--builder-text)" }}
      >
        {preview.userFacingSummaryText || preview.patchSummary}
      </p>

      {!blocked && preview.changes.length > 0 && (
        <div data-testid="builder-ai-repair-preview-changes" className="flex flex-col gap-1">
          <p className="text-[11px] font-medium" style={{ color: "var(--builder-muted)" }}>
            What would change
          </p>
          <ul className="flex list-disc flex-col gap-0.5 pl-4 text-xs">
            {preview.changes.map((c, i) => (
              <li key={i}>{c.description}</li>
            ))}
          </ul>
        </div>
      )}

      {!blocked && (
        <p
          data-testid="builder-ai-repair-preview-risk"
          className="text-[10.5px]"
          style={{ color: "var(--builder-muted)" }}
        >
          Validated risk: <span className="font-medium">{preview.riskLevel}</span>
          {preview.requiresConfirmation ? " · would require confirmation" : ""}
          {preview.taskCostEstimate
            ? ` · ~${preview.taskCostEstimate.estimatedTasksPerRun} task(s)/run`
            : ""}
        </p>
      )}

      {!blocked && preview.candidateSummary && (
        <p
          data-testid="builder-ai-repair-preview-candidate"
          className="text-[10.5px]"
          style={{ color: "var(--builder-muted)" }}
        >
          After: {preview.candidateSummary}
        </p>
      )}

      {!blocked && preview.validation.warnings.length > 0 && (
        <div data-testid="builder-ai-repair-preview-warnings" className="flex flex-col gap-1">
          <p className="text-[11px] font-medium" style={{ color: "var(--builder-warn)" }}>
            Heads up
          </p>
          <ul className="flex list-disc flex-col gap-0.5 pl-4 text-xs" style={{ color: "var(--builder-warn)" }}>
            {preview.validation.warnings.map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}

      {blocked && (
        <div data-testid="builder-ai-repair-preview-blocked" className="flex flex-col gap-1">
          <p role="status" className="text-xs" style={{ color: "var(--builder-warn)" }}>
            {preview.blockedReason
              ? `This fix can’t be applied as-is: ${preview.blockedReason}`
              : "This fix can’t be applied as-is."}
          </p>
          {preview.validation.errors.length > 0 && (
            <ul className="flex list-disc flex-col gap-0.5 pl-4 text-xs" style={{ color: "var(--builder-warn)" }}>
              {preview.validation.errors.map((e, i) => (
                <li key={i}>{e.message}</li>
              ))}
            </ul>
          )}
          <RepairPreviewGoToTarget preview={preview} />
        </div>
      )}

      {/* AI-REPAIR-3E — Apply affordance for a VALIDATED, applyable preview only. The
          raw operations are forwarded by the parent, never rendered here. */}
      {applied ? (
        <p
          data-testid="builder-ai-repair-apply-success"
          role="status"
          className="text-xs text-emerald-700 dark:text-emerald-400"
        >
          ✓ Applied fix. Workflow not run.
        </p>
      ) : applyError ? (
        <p
          data-testid="builder-ai-repair-apply-error"
          role="status"
          className="text-xs"
          style={{ color: "var(--builder-warn)" }}
        >
          {applyError}
        </p>
      ) : canApply ? (
        <div data-testid="builder-ai-repair-apply" className="flex flex-col gap-1 pt-1">
          <div>
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={onApply}
              disabled={applying}
              data-testid="builder-ai-repair-apply-button"
            >
              {applying ? "Applying…" : "Apply fix"}
            </Button>
          </div>
          <p className="text-[10.5px]" style={{ color: "var(--builder-muted)" }}>
            Applies this validated change to your workflow. It won&rsquo;t run or activate the
            workflow.
          </p>
        </div>
      ) : null}

      {/* The "nothing changed yet" notice — hidden once applied (it would be misleading). */}
      {!applied && (
        <p
          data-testid="builder-ai-repair-preview-not-applied"
          className="text-[10px]"
          style={{ color: "var(--builder-muted)" }}
        >
          {REPAIR_PREVIEW_NOT_APPLIED_NOTICE_UI}
        </p>
      )}
    </div>
  );
}
