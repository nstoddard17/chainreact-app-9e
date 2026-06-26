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
 * `{{...}}`, or any account/user/credential/integration/provider-resource id. Opening it creates
 * NOTHING; the only create path is the explicit "Use this template" click → `onConfirmUse` (wired by
 * the panel to the existing account-scoped use route). Cancel/close/Escape create nothing.
 */

interface Props {
  readonly match: GuidanceOfficialTemplateMatch;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onConfirmUse: () => void;
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

export function GuidanceTemplatePreviewDialog({ match, busy, error, onConfirmUse, onClose }: Props) {
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
      </div>
    </div>
  );
}
