"use client";

import { useEffect } from "react";
import type { TemplateCardMeta, TemplateCategoryKey } from "@/contracts/workflowTemplate";
import type { GuidanceOfficialTemplateMatch } from "@/contracts/aiGuidance";
import { Button } from "@/components/ui/button";
import { TemplateUseSummary } from "@/components/templates/TemplateUseSummary";
import { OfficialBadge } from "@/features/templates/TemplateBadges";

/**
 * Preview / use-confirmation dialog for a React Agent official-template match
 * (REACT-AGENT-TEMPLATE-MATCH-3).
 *
 * Reuses the SAME safe presentational body as the marketplace details dialog
 * ({@link TemplateUseSummary}) so the user sees an identical, credential-free summary — title,
 * official badge, description, required apps, step count, trigger kind, the trigger → action chain,
 * and the shared reassurance copy ("You'll connect apps and fill in required fields after the
 * workflow is created." / "This template does not copy credentials or account-specific settings.").
 *
 * It renders ONLY the safe {@link GuidanceOfficialTemplateMatch} fields — no raw definition, config,
 * `{{...}}`, or any account/user/credential/integration/provider-resource id. Opening it creates/
 * changes NOTHING; a write happens only on an explicit choice. Cancel/close/Escape do nothing.
 *
 * AI-TEMPLATE-APPLY-CURRENT — inside the builder (`canApplyToCurrent`) the dialog presents an explicit
 * CHOICE: "Apply to current workflow" (primary → `onApplyToCurrent`) replaces the current draft in
 * place (a checkpoint is created first, restorable from History), or "Create as new workflow"
 * (secondary → `onConfirmUse`) makes a separate workflow and leaves the current one unchanged. On the
 * dashboard (no open workflow) it keeps the single "Use this template" create-new action.
 */

interface Props {
  readonly match: GuidanceOfficialTemplateMatch;
  readonly busy: boolean;
  readonly error: string | null;
  /** CREATE-NEW: make a separate workflow from the template and navigate to it. */
  readonly onConfirmUse: () => void;
  /** AI-TEMPLATE-APPLY-CURRENT — when true, offer the "Apply to current workflow" primary choice. */
  readonly canApplyToCurrent?: boolean;
  /** APPLY-IN-PLACE: overwrite the current workflow's draft with the template (no navigation). */
  readonly onApplyToCurrent?: () => void;
  readonly onClose: () => void;
}

/** Rebuild the safe card metadata from the match (no detail fetch needed). */
function cardFromMatch(match: GuidanceOfficialTemplateMatch): TemplateCardMeta {
  return {
    nodeCount: match.nodeCount,
    stepCount: match.stepCount,
    triggerKind: match.triggerKind,
    providers: [...match.providers],
    category: match.category as TemplateCategoryKey,
    steps: match.steps.map((s) => ({ kind: s.kind, provider: s.provider, type: s.type })),
  };
}

export function GuidanceTemplatePreviewDialog({
  match,
  busy,
  error,
  onConfirmUse,
  canApplyToCurrent = false,
  onApplyToCurrent,
  onClose,
}: Props) {
  const offerApplyToCurrent = canApplyToCurrent && typeof onApplyToCurrent === "function";
  // Escape closes (but not mid-create, to avoid orphaning a request) — mirrors TemplateDetailsDialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      data-testid="guidance-template-preview-overlay"
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Template preview: ${match.name}`}
        data-testid="guidance-template-preview-dialog"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-tight text-foreground">{match.name}</h2>
            <div className="mt-1.5 flex min-h-[20px] items-center gap-2">
              <OfficialBadge />
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            data-testid="guidance-template-preview-close"
            onClick={() => !busy && onClose()}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {offerApplyToCurrent ? (
            <div data-testid="guidance-template-choice-intro" className="mb-4">
              <h3 className="text-sm font-semibold text-foreground">
                How would you like to use this template?
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Apply it to the workflow you&apos;re currently editing, or create it as a separate
                workflow.
              </p>
            </div>
          ) : null}
          <TemplateUseSummary description={match.description} card={cardFromMatch(match)} variant="use" />
          {error ? (
            <p
              role="alert"
              data-testid="guidance-template-preview-error"
              className="mt-3 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
        </div>

        {offerApplyToCurrent ? (
          // AI-TEMPLATE-APPLY-CURRENT — the explicit two-option choice (never two identical "Use"
          // buttons). "Apply to current workflow" is the primary, recommended action; "Create as new
          // workflow" is the secondary escape hatch. Each carries its own replacement/safety copy.
          <div className="flex flex-col gap-3 border-t border-border px-5 py-3.5">
            <div className="flex flex-col gap-1">
              <Button
                type="button"
                size="sm"
                className="w-full"
                data-testid="guidance-template-apply-current"
                disabled={busy}
                onClick={() => !busy && onApplyToCurrent?.()}
              >
                {busy ? "Applying…" : "Apply to current workflow"}
              </Button>
              <p className="text-[11.5px] text-muted-foreground">
                Replaces the current draft with this template. A checkpoint is created first, so the
                previous version can be restored from History.
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full"
                data-testid="guidance-template-create-new"
                disabled={busy}
                onClick={() => !busy && onConfirmUse()}
              >
                Create as new workflow
              </Button>
              <p className="text-[11.5px] text-muted-foreground">
                Creates a separate workflow and leaves the current workflow unchanged.
              </p>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-testid="guidance-template-preview-cancel"
                disabled={busy}
                onClick={() => !busy && onClose()}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="guidance-template-preview-cancel"
              disabled={busy}
              onClick={() => !busy && onClose()}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              data-testid="guidance-template-preview-use"
              disabled={busy}
              onClick={onConfirmUse}
            >
              {busy ? "Creating…" : "Use this template"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
