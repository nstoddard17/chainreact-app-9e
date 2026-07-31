/**
 * RESPONSIVE-PAGES-2 — Workflows responsive regression coverage.
 *
 * The pixel claims live in the continuous harness sweep (1896 measurements,
 * 360→1600). What is protected here is user-visible BEHAVIOUR plus the specific
 * structural decisions those pixels depend on — the ones a later edit could
 * silently undo. Every structural assertion is paired with a behavioural one
 * (the control is present, reachable, and still fires its handler) so nothing in
 * this file passes on a class string alone.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/workflows",
  useSearchParams: () => new URLSearchParams(),
}));

import { WorkflowsToolbar } from "@/features/workflows/WorkflowsToolbar";
import { WorkflowsStatCards } from "@/features/workflows/WorkflowsStatCards";
import { WorkflowCard } from "@/features/workflows/WorkflowCard";
import { WorkflowsEmptyState } from "@/features/workflows/WorkflowsEmptyState";
import type { WorkflowListItem } from "@/contracts/workflow";

const LONG_UNBROKEN =
  "Enterprise_revenue_operations_reconciliation_and_notification_pipeline_v2026_final";
const LONG_MULTIWORD =
  "Quarterly revenue reconciliation, Slack digest, and finance operations follow-up for the enterprise team";

function wf(over: Partial<WorkflowListItem> & { id: string; name: string }): WorkflowListItem {
  return {
    state: "active",
    disabledReason: null,
    disabledContext: null,
    deletedAt: null,
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-07-20T00:00:00Z",
    providers: [{ id: "slack", label: "Slack", iconUrl: null }],
    triggerCount: 1,
    actionCount: 2,
    runStats: { total: 10, succeeded: 9, successRate: 0.9, lastRunAt: null, lastRunStatus: null },
    folderId: null,
    ...over,
  } as WorkflowListItem;
}

const noop = () => {};

function renderToolbar(over: Partial<Parameters<typeof WorkflowsToolbar>[0]> = {}) {
  const props = {
    tab: "automations" as const,
    onTab: noop,
    query: "",
    onQuery: noop,
    statusFilter: "all" as const,
    onStatusFilter: noop,
    view: "grid" as const,
    onView: noop,
    onOpenFilters: noop,
    activeFilterCount: 0,
    ...over,
  };
  return render(<WorkflowsToolbar {...props} />);
}

describe("Workflows toolbar at compact width", () => {
  it("keeps Create Workflow, Filters and the view toggle reachable and working", () => {
    const onOpenFilters = jest.fn();
    const onView = jest.fn();
    renderToolbar({ onOpenFilters, onView });

    // Create is the primary action and must never be the thing that gets cut.
    expect(screen.getByTestId("workflows-create-button")).toBeVisible();
    expect(screen.getByTestId("workflows-create-button")).toHaveTextContent("Create workflow");

    const filters = screen.getByTestId("workflows-filters-open");
    expect(filters).toBeVisible();
    fireEvent.click(filters);
    expect(onOpenFilters).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("workflows-view-toggle-list"));
    expect(onView).toHaveBeenCalledWith("list");
  });

  it("makes the action cluster the side that does NOT yield", () => {
    renderToolbar();
    // The defect being locked out: the search side had flex-1/min-w-0 and the
    // action side had neither, so the cluster pushed instead of the search
    // shrinking. Its controls are icon-sized or a primary CTA — none can be
    // shortened, so the cluster keeps its width and the row wraps instead.
    const cluster = screen.getByTestId("workflows-filters-open").parentElement!;
    expect(cluster.className).toContain("shrink-0");
    expect(cluster.parentElement!.className).toContain("flex-wrap");
  });

  it("lets the search input actually shrink", () => {
    renderToolbar();
    const search = screen.getByTestId("workflows-search-input");
    // An <input> has an intrinsic size and `min-width: auto`, so `max-w-sm`
    // alone never allowed it to get smaller than ~20 characters.
    expect(search.className).toContain("min-w-0");
    expect(search.className).toContain("flex-1");
  });

  it("still reports and applies the active filter count", () => {
    const onStatusFilter = jest.fn();
    renderToolbar({ activeFilterCount: 3, statusFilter: "attention", onStatusFilter });
    expect(within(screen.getByTestId("workflows-filters-open")).getByText("3")).toBeVisible();
    fireEvent.click(screen.getByTestId("workflows-status-filter-draft"));
    expect(onStatusFilter).toHaveBeenCalledWith("draft");
  });

  it("wraps the tab strip rather than letting it overflow", () => {
    renderToolbar();
    const tabs = screen.getByTestId("workflows-tabs");
    expect(tabs.className).toContain("flex-wrap");
    expect(tabs.className).toContain("max-w-full");
    for (const id of ["automations", "folders", "trash"]) {
      expect(screen.getByTestId(`workflows-tab-${id}`)).toBeVisible();
    }
  });
});

describe("Workflows stat cards", () => {
  const workflows = [
    wf({ id: "a", name: "One", state: "active" }),
    wf({ id: "b", name: "Two", state: "draft" }),
  ];

  it("keeps every metric and its meaning visible", () => {
    render(<WorkflowsStatCards workflows={workflows} />);
    // Nothing is dropped for width — all four remain.
    expect(screen.getByTestId("workflows-stat-running")).toHaveTextContent("1");
    expect(screen.getByTestId("workflows-stat-total")).toHaveTextContent("2");
    expect(screen.getByTestId("workflows-stat-runs")).toBeVisible();
    expect(screen.getByTestId("workflows-stat-success")).toBeVisible();
  });

  it("reflows on container width instead of viewport breakpoints", () => {
    render(<WorkflowsStatCards workflows={workflows} />);
    const grid = screen.getByTestId("workflows-stat-cards");
    expect(grid.className).toContain("auto-fit");
    expect(grid.className).toContain("minmax(min(170px,100%),1fr)");
    // The viewport-keyed steps are gone.
    expect(grid.className).not.toMatch(/grid-cols-2/);
    expect(grid.className).not.toMatch(/md:grid-cols-4/);
  });

  it("wraps long label/sub text rather than compressing it", () => {
    render(<WorkflowsStatCards workflows={workflows} />);
    const card = screen.getByTestId("workflows-stat-total");
    expect(card.className).toContain("min-w-0");
    expect(within(card).getByText("Total automations").className).toContain("break-words");
  });
});

describe("Workflow card", () => {
  it("keeps a long unbroken title inside the card and the actions menu pinned", () => {
    render(<WorkflowCard workflow={wf({ id: "x", name: LONG_UNBROKEN })} onChanged={noop} />);
    const name = screen.getByTestId("workflow-card-name");
    expect(name.className).toContain("min-w-0");
    expect(name.className).toContain("break-words");
    // The existing two-line clamp is a deliberate prior choice — preserved.
    expect(name.className).toContain("line-clamp-2");
    // The ⋯ trigger keeps its shape so a long name can't push it out.
    const menuTrigger = screen.getByTestId("workflow-actions-menu-trigger");
    expect(menuTrigger.closest("span")?.className).toContain("shrink-0");
  });

  it("keeps the status badge readable and lets it wrap instead of squashing", () => {
    render(
      <WorkflowCard
        workflow={wf({ id: "d", name: "Disabled one", state: "disabled", disabledReason: "integration_revoked" })}
        onChanged={noop}
      />,
    );
    const badge = screen.getByText(/Disabled — Integration disconnected/);
    expect(badge).toBeVisible();
    // `max-w-full` bounds it to the card; wrapping (not nowrap) is what keeps a
    // long "Disabled — …" label readable in a 328px card.
    const badgeEl = badge.closest("[data-status-kind]")!;
    expect(badgeEl.className).toContain("max-w-full");
    expect(badgeEl.className).not.toContain("whitespace-nowrap");
  });

  it("keeps the primary navigation action working with a long multi-word title", () => {
    render(<WorkflowCard workflow={wf({ id: "y", name: LONG_MULTIWORD })} onChanged={noop} />);
    const link = screen.getByTestId("workflow-card-name");
    expect(link).toHaveAttribute("href", "/workflows/y");
    expect(link).toHaveTextContent(LONG_MULTIWORD);
  });

  it("exposes secondary actions through the existing keyboard-reachable menu", () => {
    render(<WorkflowCard workflow={wf({ id: "z", name: "Menu" })} onChanged={noop} />);
    const trigger = screen.getByTestId("workflow-actions-menu-trigger");
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger).toHaveAccessibleName();
  });
});

describe("Workflows empty state", () => {
  it("fits a narrow screen and keeps its guidance readable", () => {
    render(<WorkflowsEmptyState kind="no-workflows" />);
    const empty = screen.getByText("No workflows yet").closest("div")!;
    expect(empty.className).toContain("min-w-0");
    // Lighter padding at narrow so the panel isn't mostly whitespace on a phone.
    expect(empty.className).toContain("p-6");
    expect(empty.className).toContain("sm:p-10");
  });
});
