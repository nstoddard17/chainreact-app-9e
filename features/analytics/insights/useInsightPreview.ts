"use client";

import { useMemo, useState } from "react";
import { findDataset, findSource, type InsightCatalog } from "./insightCatalog";
import type { InsightDraft } from "./reconcileInsightConfig";
import {
  insightConfigFromDraft,
  insightDraftIssues,
  insightQueryFromConfig,
} from "./insightQueryFromConfig";
import { useInsightQuery, type InsightQueryState } from "./useInsightQuery";

/**
 * Live-preview gating over `useInsightQuery` (CD-3A).
 *
 * A preview request is sent ONLY when the draft is complete and locally
 * valid, the source needs no missing connection, and the dataset is
 * preview-safe (or the user explicitly ran a non-preview-safe one). Query
 * changes are debounced; superseded requests are aborted by the underlying
 * hook; closing the panel unmounts the caller, which aborts in-flight work.
 */

export type InsightPreviewGate =
  | { kind: "incomplete"; issues: readonly string[] }
  | { kind: "disconnected"; sourceLabel: string; providerId: string | null }
  | { kind: "needs-run"; datasetLabel: string }
  | { kind: "query"; state: InsightQueryState; retry: () => void; refresh: () => void };

const PREVIEW_DEBOUNCE_MS = 500;

export function useInsightPreview(
  catalog: InsightCatalog,
  draft: InsightDraft,
  connectedProviders: Record<string, boolean>,
): { gate: InsightPreviewGate; runExplicitPreview: () => void } {
  // Explicit-run consent for non-preview-safe datasets, per dataset identity.
  const [armedFor, setArmedFor] = useState<string | null>(null);

  const source = findSource(catalog, draft.source);
  const dataset = findDataset(source, draft.dataset);
  const issues = useMemo(() => insightDraftIssues(catalog, draft), [catalog, draft]);
  const config = useMemo(
    () => (issues.length === 0 ? insightConfigFromDraft(draft) : null),
    [issues, draft],
  );

  const disconnected =
    source !== null &&
    source.connectionRequired &&
    source.providerId !== null &&
    connectedProviders[source.providerId] !== true;

  const datasetKey = source && dataset ? `${source.id}.${dataset.id}` : null;
  const needsRun =
    dataset !== null && !dataset.previewSafe && armedFor !== datasetKey;

  const query = useMemo(() => {
    if (!config || disconnected || needsRun) return null;
    return insightQueryFromConfig(config);
  }, [config, disconnected, needsRun]);

  const { state, retry, refresh } = useInsightQuery(query, {
    debounceMs: PREVIEW_DEBOUNCE_MS,
  });

  let gate: InsightPreviewGate;
  if (!config || issues.length > 0) {
    gate = { kind: "incomplete", issues };
  } else if (disconnected) {
    gate = {
      kind: "disconnected",
      sourceLabel: source!.label,
      providerId: source!.providerId,
    };
  } else if (needsRun) {
    gate = { kind: "needs-run", datasetLabel: dataset!.label };
  } else {
    gate = { kind: "query", state, retry, refresh };
  }

  return {
    gate,
    runExplicitPreview: () => setArmedFor(datasetKey),
  };
}
