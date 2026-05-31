"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { listRuns, RunApiError } from "@/lib/api/runs";
import type { RunListItem } from "@/contracts/workflow";
import { RunRow } from "./RunRow";
import { RunsEmptyState } from "./RunsEmptyState";
import {
  RunsToolbar,
  type RunSourceFilter,
  type RunStatusFilter,
} from "./RunsToolbar";

/**
 * Runs dashboard — top-level client orchestrator
 * (Slice 4.RUNS-PAGE-1).
 *
 * Receives the server-rendered `initialRuns` so the first paint
 * doesn't flash a loading state. Owns:
 *   - search query
 *   - status / source filter facets
 *   - include-test-runs toggle (default: hidden — `is_test=true` runs
 *     are dev noise for the user-facing surface)
 *   - non-optimistic refresh against `/api/runs` (returns the same
 *     `RunListItem[]` projection)
 *
 * Single-flight refresh: overlapping calls collapse to the latest
 * issuance (same pattern as `WorkflowsDashboard`). No polling, no
 * background fetch — the user owns when to refresh.
 *
 * Read-only — no row-level mutation, no Retry/Replay/Cancel action.
 * Those would require server APIs that don't exist in V2 yet, and
 * the slice guard explicitly forbids fake action affordances.
 */
interface Props {
  initialRuns: readonly RunListItem[];
}

export function RunsDashboard({ initialRuns }: Props) {
  const [runs, setRuns] = useState<readonly RunListItem[]>(initialRuns);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<RunStatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<RunSourceFilter>("all");
  const [includeTest, setIncludeTest] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshSeqRef = useRef(0);
  const refresh = useCallback(async () => {
    const seq = ++refreshSeqRef.current;
    setRefreshing(true);
    setError(null);
    try {
      const next = await listRuns();
      if (seq !== refreshSeqRef.current) return;
      setRuns(next);
    } catch (err) {
      if (seq !== refreshSeqRef.current) return;
      const message =
        err instanceof RunApiError
          ? err.message
          : "Couldn't refresh runs. Please try again.";
      setError(message);
    } finally {
      if (seq === refreshSeqRef.current) setRefreshing(false);
    }
  }, []);

  const filtered = useMemo(
    () => applyFilters(runs, query, statusFilter, sourceFilter, includeTest),
    [runs, query, statusFilter, sourceFilter, includeTest],
  );

  const hasAny = runs.length > 0;
  const hasFiltered = filtered.length > 0;

  return (
    <section
      data-testid="runs-dashboard"
      aria-label="Runs"
      className="flex flex-col gap-6"
    >
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Runs
        </h1>
        <p
          data-testid="runs-dashboard-subtitle"
          className="text-sm text-muted-foreground"
        >
          {hasAny ? (
            <>
              Showing <code className="font-mono">{filtered.length}</code> of{" "}
              <code className="font-mono">{runs.length}</code> recent runs —
              ordered by most recent start.
            </>
          ) : (
            <>
              When a workflow fires, its run will show up here with its
              outcome.
            </>
          )}
        </p>
      </header>

      <RunsToolbar
        query={query}
        onQuery={setQuery}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
        sourceFilter={sourceFilter}
        onSourceFilter={setSourceFilter}
        includeTest={includeTest}
        onIncludeTest={setIncludeTest}
        onRefresh={refresh}
        refreshing={refreshing}
      />

      {error && (
        <div
          role="alert"
          data-testid="runs-dashboard-error"
          className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <span>{error}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={refresh}
            data-testid="runs-dashboard-retry"
          >
            Retry
          </Button>
        </div>
      )}

      {refreshing && !error && (
        <p
          role="status"
          data-testid="runs-dashboard-loading"
          className="text-xs text-muted-foreground"
        >
          Refreshing…
        </p>
      )}

      {!hasAny && <RunsEmptyState kind="no-runs" />}
      {hasAny && !hasFiltered && <RunsEmptyState kind="no-matches" />}
      {hasAny && hasFiltered && (
        <ul
          data-testid="runs-list"
          aria-label="Runs list"
          className="flex flex-col gap-2"
        >
          {filtered.map((r) => (
            <RunRow key={r.id} run={r} />
          ))}
        </ul>
      )}
    </section>
  );
}

function applyFilters(
  runs: readonly RunListItem[],
  query: string,
  statusFilter: RunStatusFilter,
  sourceFilter: RunSourceFilter,
  includeTest: boolean,
): readonly RunListItem[] {
  const trimmed = query.trim().toLowerCase();
  return runs.filter((r) => {
    if (!includeTest && r.isTest) return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (sourceFilter !== "all" && r.triggeredBy !== sourceFilter) return false;
    if (trimmed.length === 0) return true;
    return r.workflowName.toLowerCase().includes(trimmed);
  });
}
