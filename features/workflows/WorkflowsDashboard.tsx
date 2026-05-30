"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { listWorkflows, WorkflowApiError } from "@/lib/api/workflows";
import type { WorkflowListItem } from "@/contracts/workflow";
import { WorkflowCard } from "./WorkflowCard";
import { WorkflowRow } from "./WorkflowRow";
import { WorkflowsEmptyState } from "./WorkflowsEmptyState";
import { WorkflowsStatCards } from "./WorkflowsStatCards";
import {
  WorkflowsToolbar,
  type WorkflowStatusFilter,
  type WorkflowsView,
} from "./WorkflowsToolbar";

/**
 * Workflows dashboard — top-level client orchestrator
 * (Slice 4.WORKFLOWS-PAGE-1).
 *
 * Receives the enriched list (`WorkflowListItem[]`) from the server page as
 * `initialWorkflows` so there's no first-paint loading flash. Owns the
 * client state (search, status filter, view list/grid) and a `refresh()`
 * that re-fetches via `listWorkflows()` after a status toggle / lifecycle
 * action. Loading state surfaces during a refresh; error state surfaces when
 * a refresh fails (the user can retry without leaving the page). Per the
 * locked decisions: status toggles are non-optimistic — refreshes only fire
 * AFTER the lifecycle API returns success.
 */
interface Props {
  initialWorkflows: readonly WorkflowListItem[];
}

export function WorkflowsDashboard({ initialWorkflows }: Props) {
  const [workflows, setWorkflows] =
    useState<readonly WorkflowListItem[]>(initialWorkflows);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<WorkflowStatusFilter>("all");
  const [view, setView] = useState<WorkflowsView>("list");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Single-flight: dedup overlapping refresh() calls (e.g. several status
  // toggles confirming in quick succession). The latest invocation wins.
  const refreshSeqRef = useRef(0);
  const refresh = useCallback(async () => {
    const seq = ++refreshSeqRef.current;
    setRefreshing(true);
    setError(null);
    try {
      const next = await listWorkflows();
      if (seq !== refreshSeqRef.current) return;
      setWorkflows(next);
    } catch (err) {
      if (seq !== refreshSeqRef.current) return;
      const message =
        err instanceof WorkflowApiError
          ? err.message
          : "Couldn't refresh workflows. Please try again.";
      setError(message);
    } finally {
      if (seq === refreshSeqRef.current) setRefreshing(false);
    }
  }, []);

  const filtered = useMemo(
    () => applyFilters(workflows, query, statusFilter),
    [workflows, query, statusFilter],
  );

  const hasAny = workflows.length > 0;
  const hasFiltered = filtered.length > 0;

  return (
    <section
      data-testid="workflows-dashboard"
      aria-label="Workflows"
      className="flex flex-col gap-6"
    >
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Workflows
        </h1>
        <p
          data-testid="workflows-dashboard-subtitle"
          className="text-sm text-muted-foreground"
        >
          {hasAny ? (
            <>
              Showing <code className="font-mono">{filtered.length}</code> of{" "}
              <code className="font-mono">{workflows.length}</code> — ordered
              by most recently changed.
            </>
          ) : (
            <>Create your first workflow to get started.</>
          )}
        </p>
      </header>

      <WorkflowsStatCards workflows={workflows} />

      <WorkflowsToolbar
        query={query}
        onQuery={setQuery}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
        view={view}
        onView={setView}
      />

      {error && (
        <div
          role="alert"
          data-testid="workflows-dashboard-error"
          className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <span>{error}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={refresh}
            data-testid="workflows-dashboard-retry"
          >
            Retry
          </Button>
        </div>
      )}

      {refreshing && !error && (
        <p
          role="status"
          data-testid="workflows-dashboard-loading"
          className="text-xs text-muted-foreground"
        >
          Refreshing…
        </p>
      )}

      {!hasAny && <WorkflowsEmptyState kind="no-workflows" />}
      {hasAny && !hasFiltered && <WorkflowsEmptyState kind="no-matches" />}
      {hasAny && hasFiltered && view === "list" && (
        <ul
          data-testid="workflows-list-view"
          aria-label="Workflows list"
          className="flex flex-col gap-2"
        >
          {filtered.map((w) => (
            <WorkflowRow key={w.id} workflow={w} onChanged={refresh} />
          ))}
        </ul>
      )}
      {hasAny && hasFiltered && view === "grid" && (
        <ul
          data-testid="workflows-grid-view"
          aria-label="Workflows grid"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {filtered.map((w) => (
            <WorkflowCard key={w.id} workflow={w} onChanged={refresh} />
          ))}
        </ul>
      )}
    </section>
  );
}

function applyFilters(
  workflows: readonly WorkflowListItem[],
  query: string,
  statusFilter: WorkflowStatusFilter,
): readonly WorkflowListItem[] {
  const trimmed = query.trim().toLowerCase();
  return workflows.filter((w) => {
    if (statusFilter !== "all" && !matchesStatusFilter(w, statusFilter)) {
      return false;
    }
    if (trimmed.length === 0) return true;
    if (w.name.toLowerCase().includes(trimmed)) return true;
    return w.providers.some(
      (p) =>
        p.id.toLowerCase().includes(trimmed) ||
        p.label.toLowerCase().includes(trimmed),
    );
  });
}

function matchesStatusFilter(
  w: WorkflowListItem,
  filter: Exclude<WorkflowStatusFilter, "all">,
): boolean {
  switch (filter) {
    case "running":
      return w.state === "active";
    case "draft":
      return w.state === "draft";
    case "paused":
      return w.state === "paused";
    case "attention":
      return w.state === "disabled" || w.state === "eligible_to_resume";
  }
}
