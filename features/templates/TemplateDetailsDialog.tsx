"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { TemplateUseSummary } from "@/components/templates/TemplateUseSummary";
import type { MarketplaceTemplateSummary } from "./types";
import { OfficialBadge, CreatorChip } from "./TemplateBadges";

/**
 * Marketplace template details / use-confirmation dialog (CS-XT-MARKETPLACE-UX-DETAIL).
 *
 * Opened from a marketplace card so a user sees a clear summary BEFORE creating a workflow:
 * title + attribution, description, category, trigger type, required apps, step count, the static
 * trigger → action chain, and plain-English "what happens next" copy. Use / Save a copy are
 * confirmed from here (wired to the dashboard's existing handlers).
 *
 * No raw definition / config / ids and no provider calls — the summary renders only the safe
 * derived {@link MarketplaceTemplateSummary.card} metadata. Hand-rolled overlay (the repo has no
 * Dialog primitive yet) mirroring BuilderTemplatesModal's pattern.
 */

interface Props {
  template: MarketplaceTemplateSummary;
  busy: boolean;
  onUse: () => void;
  onFork: () => void;
  onClose: () => void;
}

export function TemplateDetailsDialog({ template, busy, onUse, onFork, onClose }: Props) {
  // Escape closes (but not mid-action, to avoid orphaning a request).
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
      data-testid="template-details-overlay"
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Template details: ${template.name}`}
        data-testid="template-details-dialog"
        onClick={(e) => e.stopPropagation()}
        /* §11 — verified sound and left almost alone. `w-full max-w-lg` inside the
           overlay's `p-4` already guarantees a 1rem safe margin at 360px, and
           `max-h-[85vh]` + the scrolling body already handle height. The only
           addition is `min-w-0`, so the header/body/footer are free to shrink
           inside it rather than the dialog being widened from within. */
        className="flex max-h-[85vh] w-full min-w-0 max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            {/* A long unbroken template name must wrap, not collide with the ✕. */}
            <h2 className="break-words text-base font-semibold leading-tight text-foreground">
              {template.name}
            </h2>
            <div className="mt-1.5 flex min-h-[20px] items-center gap-2">
              {template.isOfficial ? (
                <OfficialBadge />
              ) : template.creatorDisplayName ? (
                <CreatorChip displayName={template.creatorDisplayName} />
              ) : (
                <span className="text-xs text-muted-foreground">Community template</span>
              )}
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            data-testid="template-details-close"
            onClick={() => !busy && onClose()}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <TemplateUseSummary description={template.description} card={template.card} variant="use" />
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="template-details-fork"
            disabled={busy}
            onClick={onFork}
          >
            Save a copy
          </Button>
          <Button
            type="button"
            size="sm"
            data-testid="template-details-use"
            disabled={busy}
            onClick={onUse}
          >
            {busy ? "Creating…" : "Use this template"}
          </Button>
        </div>
      </div>
    </div>
  );
}
