"use client";

import { useMemo, useState } from "react";
import type { AnalyticsWidget, AnalyticsWidgetConfig } from "@/contracts/analytics";
import { AnalyticsIcon } from "@/components/analytics/icons";
import { findSource, type InsightCatalog } from "./insightCatalog";
import {
  emptyInsightDraft,
  insightDraftFromConfig,
  reconcileInsightDraft,
  type InsightDraft,
  type InsightReset,
} from "./reconcileInsightConfig";
import { insightConfigFromDraft } from "./insightQueryFromConfig";
import { InsightBuilder } from "./InsightBuilder";
import { InsightPreview } from "./InsightPreview";
import { useInsightPreview } from "./useInsightPreview";
import type { InsightEntityOption } from "./InsightEntityPicker";

/**
 * Custom Insight configuration drawer (CD-3A) — a dedicated panel, NOT an
 * extension of the legacy WidgetConfigPanel monolith. Owns the draft state +
 * reconciliation loop; the builder renders the steps; the preview runs the
 * real connected query. Saving hands the validated config to the dashboard's
 * normal draft/save lifecycle — nothing here persists anything itself, and
 * preview results never enter the saved config.
 */
export function InsightConfigPanel({
  widget,
  catalog,
  connectedProviders,
  internalEntityOptions,
  onClose,
  onSave,
}: {
  widget: AnalyticsWidget;
  catalog: InsightCatalog;
  connectedProviders: Record<string, boolean>;
  /** The account workflow list the page already loads (internal entities). */
  internalEntityOptions: readonly InsightEntityOption[];
  onClose: () => void;
  onSave: (config: AnalyticsWidgetConfig) => void;
}) {
  const [draft, setDraft] = useState<InsightDraft>(() => {
    if (widget.config.insight) {
      // Reconcile the saved question against today's catalog; stale parts are
      // cleared with visible notes rather than silently reinterpreted.
      return reconcileInsightDraft(catalog, insightDraftFromConfig(widget.config.insight)).draft;
    }
    return emptyInsightDraft();
  });
  const [resets, setResets] = useState<readonly InsightReset[]>([]);

  const applyPatch = (patch: Partial<InsightDraft>) => {
    setDraft((prev) => {
      const merged = { ...prev, ...patch };
      const outcome = reconcileInsightDraft(catalog, merged);
      setResets(outcome.resets);
      return outcome.draft;
    });
  };

  const selectSource = (id: string) => {
    if (id === draft.source) return;
    // A new app is a new question: dataset-specific choices don't carry over
    // (even same-named ids in another source would be a silent reinterpretation).
    setResets([]);
    setDraft((prev) =>
      reconcileInsightDraft(catalog, {
        ...emptyInsightDraft(),
        source: id,
        range: prev.range,
        chart: null,
      }).draft,
    );
  };

  const { gate, runExplicitPreview } = useInsightPreview(catalog, draft, connectedProviders);
  const config = useMemo(() => insightConfigFromDraft(draft), [draft]);
  const source = findSource(catalog, draft.source);

  const save = () => {
    if (!config) return;
    onSave({ source: "any", insight: config });
  };

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <aside
        className="fixed inset-y-0 right-0 z-[71] flex w-[460px] max-w-[calc(100%-24px)] flex-col border-l border-border bg-card shadow-2xl"
        role="dialog"
        aria-modal
        aria-label="Configure custom insight"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
          <div className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
            <span className="text-primary">
              <AnalyticsIcon name="Sparkle" size={14} />
            </span>
            <span>Custom insight</span>
          </div>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onClose}
            aria-label="Close"
          >
            <AnalyticsIcon name="X" size={13} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {!draft.source && (
            <p className="text-[12.5px] text-muted-foreground">
              Build a chart from ChainReact or one of your connected apps. Start by choosing
              where your data comes from.
            </p>
          )}
          <InsightBuilder
            catalog={catalog}
            draft={draft}
            resets={resets}
            onPatch={applyPatch}
            onSelectSource={selectSource}
            connectedProviders={connectedProviders}
            internalEntityOptions={internalEntityOptions}
          />
          <InsightPreview
            gate={gate}
            runExplicitPreview={runExplicitPreview}
            sourceLabel={source?.label ?? null}
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            className="rounded-lg border border-border px-3.5 py-1.5 text-[12.5px] text-foreground/80 hover:border-foreground/25 hover:text-foreground"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-primary-foreground hover:brightness-105 disabled:opacity-50"
            onClick={save}
            disabled={config === null}
            title={config === null ? "Finish the steps above first" : "Apply to the widget"}
          >
            Apply
          </button>
        </div>
      </aside>
    </>
  );
}
