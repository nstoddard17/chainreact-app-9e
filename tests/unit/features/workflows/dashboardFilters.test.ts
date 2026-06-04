/**
 * @jest-environment node
 *
 * Pure filter/sort helpers for the WF-5 dashboard.
 */
import {
  applyFilters,
  deriveAppOptions,
  deriveFolderCounts,
} from "@/features/workflows/folders/dashboardFilters";
import {
  DEFAULT_FILTERS,
  UNCATEGORIZED,
  type DashboardFilters,
} from "@/features/workflows/folders/WorkflowsFiltersPanel";
import type { WorkflowListItem } from "@/contracts/workflow";

function wf(over: Partial<WorkflowListItem> & { id: string; name: string }): WorkflowListItem {
  return {
    state: "active",
    disabledReason: null,
    disabledContext: null,
    deletedAt: null,
    folderId: null,
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
    providers: [],
    triggerCount: 0,
    actionCount: 0,
    runStats: { total: 0, succeeded: 0, successRate: 0, lastRunAt: null, lastRunStatus: null },
    ...over,
  };
}

const f = (o: Partial<DashboardFilters> = {}): DashboardFilters => ({ ...DEFAULT_FILTERS, ...o });

describe("applyFilters — sort", () => {
  it("sorts by most-recently-changed by default", () => {
    const out = applyFilters(
      [
        wf({ id: "old", name: "Old", updatedAt: "2026-06-01T00:00:00Z" }),
        wf({ id: "new", name: "New", updatedAt: "2026-06-03T00:00:00Z" }),
      ],
      "",
      "all",
      f(),
    );
    expect(out.map((w) => w.id)).toEqual(["new", "old"]);
  });

  it("sorts by name A–Z when sort=name", () => {
    const out = applyFilters(
      [wf({ id: "b", name: "Bravo" }), wf({ id: "a", name: "Alpha" })],
      "",
      "all",
      f({ sort: "name" }),
    );
    expect(out.map((w) => w.id)).toEqual(["a", "b"]);
  });
});

describe("applyFilters — folder facet", () => {
  it("UNCATEGORIZED matches only folderId === null", () => {
    const out = applyFilters(
      [wf({ id: "u", name: "U", folderId: null }), wf({ id: "f", name: "F", folderId: "f1" })],
      "",
      "all",
      f({ folderIds: [UNCATEGORIZED] }),
    );
    expect(out.map((w) => w.id)).toEqual(["u"]);
  });

  it("a folder id matches only workflows in that folder", () => {
    const out = applyFilters(
      [wf({ id: "u", name: "U", folderId: null }), wf({ id: "f", name: "F", folderId: "f1" })],
      "",
      "all",
      f({ folderIds: ["f1"] }),
    );
    expect(out.map((w) => w.id)).toEqual(["f"]);
  });
});

describe("applyFilters — date facet", () => {
  it("`today` excludes a workflow changed long ago", () => {
    const out = applyFilters(
      [
        wf({ id: "fresh", name: "Fresh", updatedAt: new Date().toISOString() }),
        wf({ id: "stale", name: "Stale", updatedAt: "2020-01-01T00:00:00Z" }),
      ],
      "",
      "all",
      f({ date: "today" }),
    );
    expect(out.map((w) => w.id)).toEqual(["fresh"]);
  });
});

describe("derivations", () => {
  it("deriveAppOptions dedupes + sorts providers by label", () => {
    const opts = deriveAppOptions([
      wf({ id: "a", name: "A", providers: [{ id: "stripe", label: "Stripe", iconUrl: null }] }),
      wf({ id: "b", name: "B", providers: [{ id: "gmail", label: "Gmail", iconUrl: null }, { id: "stripe", label: "Stripe", iconUrl: null }] }),
    ]);
    expect(opts).toEqual([
      { id: "gmail", label: "Gmail" },
      { id: "stripe", label: "Stripe" },
    ]);
  });

  it("deriveFolderCounts counts live workflows per folder", () => {
    const counts = deriveFolderCounts([
      wf({ id: "a", name: "A", folderId: "f1" }),
      wf({ id: "b", name: "B", folderId: "f1" }),
      wf({ id: "c", name: "C", folderId: null }),
    ]);
    expect(counts.get("f1")).toBe(2);
    expect(counts.has("null")).toBe(false);
  });
});
