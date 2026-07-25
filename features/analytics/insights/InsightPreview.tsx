"use client";

import Link from "next/link";
import type { InsightChartType } from "@/contracts/analytics";
import { AnalyticsIcon } from "@/components/analytics/icons";
import type { InsightPreviewGate } from "./useInsightPreview";
import { InsightFailureView, InsightMessage } from "./InsightStates";
import { InsightResult } from "./InsightResult";

/**
 * Live preview panel (CD-3A). Renders the gated preview lifecycle:
 * incomplete guidance → connect CTA → explicit-run consent (non-preview-safe
 * datasets) → the real result through the SAME renderer the saved widget
 * uses. Preview data lives only here — it never touches dashboard
 * persistence.
 */
export function InsightPreview({
  gate,
  runExplicitPreview,
  sourceLabel,
  chart,
}: {
  gate: InsightPreviewGate;
  runExplicitPreview: () => void;
  sourceLabel: string | null;
  /** The draft's display intent, so the preview draws what will be saved. */
  chart?: InsightChartType | undefined;
}) {
  return (
    <section className="flex min-h-[210px] flex-col rounded-xl border border-border bg-background/40 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="text-primary">
          <AnalyticsIcon name="Sparkle" size={11} />
        </span>
        <span>Preview</span>
      </div>
      <div className="min-h-0 flex-1">
        <PreviewBody
          gate={gate}
          runExplicitPreview={runExplicitPreview}
          sourceLabel={sourceLabel}
          chart={chart}
        />
      </div>
    </section>
  );
}

function PreviewBody({
  gate,
  runExplicitPreview,
  sourceLabel,
  chart,
}: {
  gate: InsightPreviewGate;
  runExplicitPreview: () => void;
  sourceLabel: string | null;
  chart?: InsightChartType | undefined;
}) {
  if (gate.kind === "incomplete") {
    const first = gate.issues[0] ?? "Choose where your data comes from.";
    return <InsightMessage icon="Sparkle" title={first} />;
  }

  if (gate.kind === "disconnected") {
    return (
      <InsightMessage
        icon="Webhook"
        title={`Connect ${gate.sourceLabel}`}
        body={`Connect ${gate.sourceLabel} to preview this data.`}
      >
        <Link
          href="/apps"
          className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11.5px] font-semibold text-primary-foreground hover:brightness-105"
        >
          Connect {gate.sourceLabel}
        </Link>
      </InsightMessage>
    );
  }

  if (gate.kind === "needs-run") {
    return (
      <InsightMessage
        icon="Clock"
        title="This preview runs on request"
        body={`Loading ${gate.datasetLabel} can take a moment, so it only runs when you ask.`}
      >
        <button
          type="button"
          className="mt-1 rounded-md bg-primary px-3 py-1.5 text-[11.5px] font-semibold text-primary-foreground hover:brightness-105"
          onClick={runExplicitPreview}
        >
          Run preview
        </button>
      </InsightMessage>
    );
  }

  const { state, retry, refresh } = gate;
  if (state.status === "idle" || (state.status === "loading" && state.prior === null)) {
    return (
      <div className="flex h-full min-h-[80px] animate-pulse items-center justify-center text-xs text-muted-foreground motion-reduce:animate-none">
        Loading preview…
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <InsightFailureView
        failure={state.failure}
        sourceLabel={sourceLabel ?? "This app"}
        context="builder"
        onRetry={retry}
      />
    );
  }
  const result = state.status === "ok" ? state.result : state.prior!;
  return (
    <InsightResult
      result={result}
      chart={chart}
      refreshError={state.status === "ok" ? state.refreshError : null}
      onRefresh={result.freshness.mode === "cached" ? refresh : undefined}
      refreshing={state.status === "loading"}
    />
  );
}
