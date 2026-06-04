import type { WorkflowListItem } from "@/contracts/workflow";
import type { WorkflowStatusFilter } from "../WorkflowsToolbar";
import { UNCATEGORIZED, type DashboardFilters } from "./WorkflowsFiltersPanel";

/**
 * Pure filter/sort/derivation helpers for the workflows dashboard (WF-5).
 * Extracted from WorkflowsDashboard so the logic is unit-testable in isolation
 * (and to keep the orchestrator under the file-size cap). Operates only on real
 * WorkflowListItem fields (name, providers, state, folderId, updatedAt).
 */

export function deriveAppOptions(
  workflows: readonly WorkflowListItem[],
): ReadonlyArray<{ id: string; label: string }> {
  const map = new Map<string, string>();
  for (const w of workflows) {
    for (const p of w.providers) if (!map.has(p.id)) map.set(p.id, p.label);
  }
  return [...map.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function deriveFolderCounts(
  workflows: readonly WorkflowListItem[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const w of workflows) {
    if (w.folderId) counts.set(w.folderId, (counts.get(w.folderId) ?? 0) + 1);
  }
  return counts;
}

function withinDate(updatedAt: string, date: DashboardFilters["date"]): boolean {
  if (date === "any") return true;
  const ts = new Date(updatedAt).getTime();
  if (Number.isNaN(ts)) return true;
  const ageMs = Date.now() - ts;
  const day = 24 * 60 * 60 * 1000;
  if (date === "today") return ageMs < day;
  if (date === "week") return ageMs < 7 * day;
  return ageMs < 31 * day; // month
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

export function applyFilters(
  workflows: readonly WorkflowListItem[],
  query: string,
  statusFilter: WorkflowStatusFilter,
  filters: DashboardFilters,
): readonly WorkflowListItem[] {
  const trimmed = query.trim().toLowerCase();
  const result = workflows.filter((w) => {
    if (statusFilter !== "all" && !matchesStatusFilter(w, statusFilter)) return false;
    if (filters.folderIds.length > 0) {
      const inUncat = filters.folderIds.includes(UNCATEGORIZED) && w.folderId === null;
      const inFolder = w.folderId !== null && filters.folderIds.includes(w.folderId);
      if (!inUncat && !inFolder) return false;
    }
    if (filters.apps.length > 0 && !w.providers.some((p) => filters.apps.includes(p.id))) {
      return false;
    }
    if (!withinDate(w.updatedAt, filters.date)) return false;
    if (trimmed.length === 0) return true;
    if (w.name.toLowerCase().includes(trimmed)) return true;
    return w.providers.some(
      (p) => p.id.toLowerCase().includes(trimmed) || p.label.toLowerCase().includes(trimmed),
    );
  });
  const sorted = [...result];
  if (filters.sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
  else sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return sorted;
}
