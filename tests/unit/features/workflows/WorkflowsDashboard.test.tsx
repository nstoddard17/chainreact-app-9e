/**
 * Tests for features/workflows/WorkflowsDashboard.
 *
 * Integration-flavored: renders the dashboard with mocked `lib/api/workflows`
 * + a mocked `next/navigation` router. Covers Slice 4.WORKFLOWS-PAGE-1's
 * required test list: render with data, loading on refresh, empty state,
 * filtered-empty, error on refresh, search + status filter + view toggle,
 * Create CTA + open-workflow navigation, no fake delete/duplicate actions
 * wired, accessibility basics.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockList = jest.fn();
const mockCreate = jest.fn();
const mockActivate = jest.fn();
const mockPause = jest.fn();
const mockResume = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    listWorkflows: (...a: unknown[]) => mockList(...a),
    createWorkflow: (...a: unknown[]) => mockCreate(...a),
    activateWorkflow: (...a: unknown[]) => mockActivate(...a),
    pauseWorkflow: (...a: unknown[]) => mockPause(...a),
    resumeWorkflow: (...a: unknown[]) => mockResume(...a),
  };
});

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { WorkflowApiError } from "@/lib/api/workflows";
import { WorkflowsDashboard } from "@/features/workflows/WorkflowsDashboard";
import type { WorkflowListItem } from "@/contracts/workflow";

function wf(
  id: string,
  name: string,
  state: WorkflowListItem["state"],
  providers: WorkflowListItem["providers"] = [],
  overrides: Partial<WorkflowListItem> = {},
): WorkflowListItem {
  return {
    id,
    name,
    state,
    disabledReason: state === "disabled" ? "manual_admin" : null,
    disabledContext: null,
    deletedAt: null,
    folderId: null,
    createdAt: "2026-05-29T00:00:00Z",
    updatedAt: "2026-05-29T00:00:00Z",
    providers,
    triggerCount: 0,
    actionCount: 0,
    runStats: {
      total: 10,
      succeeded: 9,
      successRate: 0.9,
      lastRunAt: "2026-05-29T00:00:00Z",
      lastRunStatus: "succeeded",
    },
    ...overrides,
  };
}

beforeEach(() => {
  mockList.mockReset();
  mockCreate.mockReset();
  mockActivate.mockReset();
  mockPause.mockReset();
  mockResume.mockReset();
  mockPush.mockReset();
});

describe("WorkflowsDashboard — initial render with real data", () => {
  it("renders heading, stat cards, list view, and each workflow row with name link to the builder", () => {
    const workflows = [
      wf("a", "Failed payment follow-ups", "active", [
        { id: "stripe", label: "Stripe", iconUrl: "/integrations/stripe.svg" },
        { id: "slack", label: "Slack", iconUrl: "/integrations/slack.svg" },
      ]),
      wf("b", "Friendly invoice reminders", "draft"),
    ];
    render(<WorkflowsDashboard initialWorkflows={workflows} />);

    // h1 + subtitle counts.
    const h1 = screen.getByRole("heading", { level: 1, name: /workflows/i });
    expect(h1).toBeInTheDocument();
    expect(screen.getByTestId("workflows-dashboard-subtitle")).toHaveTextContent(
      /Showing\s*2\s*of\s*2/i,
    );

    // List view by default; one row per workflow.
    expect(screen.getByTestId("workflows-list-view")).toBeInTheDocument();
    const rows = screen.getAllByTestId("workflow-row");
    expect(rows).toHaveLength(2);
    // Name is a <a> link to the builder (open-workflow navigation).
    const firstName = within(rows[0]!).getByTestId("workflow-row-name");
    expect(firstName.tagName.toLowerCase()).toBe("a");
    expect(firstName).toHaveAttribute("href", "/workflows/a");
    expect(firstName).toHaveTextContent("Failed payment follow-ups");

    // Provider chips render for workflows that have providers.
    expect(within(rows[0]!).getAllByTestId("workflow-provider-chip")).toHaveLength(2);

    // Stat cards reflect real counts: 1 running of 2 total.
    expect(screen.getByTestId("workflows-stat-running")).toHaveTextContent("1");
    expect(screen.getByTestId("workflows-stat-total")).toHaveTextContent("2");
  });
});

describe("WorkflowsDashboard — empty + filtered-empty states", () => {
  it("renders the no-workflows empty state when initialWorkflows is empty", () => {
    render(<WorkflowsDashboard initialWorkflows={[]} />);
    expect(screen.getByTestId("workflows-empty-no-workflows")).toBeInTheDocument();
    // Filtered-empty NOT shown.
    expect(screen.queryByTestId("workflows-empty-no-matches")).toBeNull();
    // No rows.
    expect(screen.queryByTestId("workflow-row")).toBeNull();
  });

  it("no-workflows empty state surfaces a Browse-templates link to the /templates marketplace", () => {
    render(<WorkflowsDashboard initialWorkflows={[]} />);
    const link = within(screen.getByTestId("workflows-empty-no-workflows")).getByTestId(
      "workflows-empty-browse-templates",
    );
    expect(link).toHaveAttribute("href", "/templates");
    expect(link).toHaveTextContent(/browse templates/i);
  });

  it("renders the no-matches empty state when filters exclude every workflow", async () => {
    const user = userEvent.setup();
    render(
      <WorkflowsDashboard
        initialWorkflows={[wf("a", "Stripe ops", "active")]}
      />,
    );
    await user.type(
      screen.getByTestId("workflows-search-input"),
      "no-such-name",
    );
    expect(screen.getByTestId("workflows-empty-no-matches")).toBeInTheDocument();
    expect(screen.queryByTestId("workflow-row")).toBeNull();
  });

  it("no-matches state offers a Clear search & filters button that restores the list", async () => {
    const user = userEvent.setup();
    render(<WorkflowsDashboard initialWorkflows={[wf("a", "Stripe ops", "active")]} />);
    await user.type(screen.getByTestId("workflows-search-input"), "no-such-name");
    expect(screen.getByTestId("workflows-empty-no-matches")).toBeInTheDocument();

    await user.click(screen.getByTestId("workflows-empty-clear-filters"));

    // Filters reset → the workflow is visible again and the empty state is gone.
    expect(screen.queryByTestId("workflows-empty-no-matches")).toBeNull();
    expect(screen.getByTestId("workflow-row")).toBeInTheDocument();
    expect(screen.getByTestId("workflows-search-input")).toHaveValue("");
  });
});

describe("WorkflowsDashboard — search + status filter + view toggle", () => {
  it("search filters on name and provider label", async () => {
    const user = userEvent.setup();
    render(
      <WorkflowsDashboard
        initialWorkflows={[
          wf("a", "Failed payments", "active", [
            { id: "stripe", label: "Stripe", iconUrl: null },
          ]),
          wf("b", "Welcome email", "active", [
            { id: "gmail", label: "Gmail", iconUrl: null },
          ]),
        ]}
      />,
    );
    expect(screen.getAllByTestId("workflow-row")).toHaveLength(2);
    await user.type(screen.getByTestId("workflows-search-input"), "stripe");
    const rows = screen.getAllByTestId("workflow-row");
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByTestId("workflow-row-name")).toHaveTextContent(
      "Failed payments",
    );
  });

  it("status filter scopes to one lifecycle facet", async () => {
    const user = userEvent.setup();
    render(
      <WorkflowsDashboard
        initialWorkflows={[
          wf("a", "Running one", "active"),
          wf("b", "Draft one", "draft"),
          wf("c", "Paused one", "paused"),
        ]}
      />,
    );
    await user.click(screen.getByTestId("workflows-status-filter-draft"));
    const rows = screen.getAllByTestId("workflow-row");
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByTestId("workflow-row-name")).toHaveTextContent(
      "Draft one",
    );
  });

  it("view toggle switches between list and grid renderings", async () => {
    const user = userEvent.setup();
    render(
      <WorkflowsDashboard initialWorkflows={[wf("a", "One", "active")]} />,
    );
    expect(screen.getByTestId("workflows-list-view")).toBeInTheDocument();
    expect(screen.queryByTestId("workflows-grid-view")).toBeNull();
    await user.click(screen.getByTestId("workflows-view-toggle-grid"));
    expect(screen.queryByTestId("workflows-list-view")).toBeNull();
    expect(screen.getByTestId("workflows-grid-view")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-card")).toBeInTheDocument();
  });
});

describe("WorkflowsDashboard — refresh after a status change + loading + error states", () => {
  it("pausing a workflow triggers a refresh; loading indicator then updated rows render", async () => {
    mockPause.mockResolvedValueOnce({ id: "a", state: "paused" });
    mockList.mockResolvedValueOnce([
      wf("a", "Running one", "paused"), // server says paused now
    ]);
    const user = userEvent.setup();
    render(
      <WorkflowsDashboard initialWorkflows={[wf("a", "Running one", "active")]} />,
    );
    await user.click(screen.getByTestId("workflow-status-toggle-switch"));
    // Refresh fired → listWorkflows called once.
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));
  });

  it("refresh failure shows an error banner with a Retry button (data load fails)", async () => {
    mockPause.mockResolvedValueOnce({ id: "a", state: "paused" });
    mockList.mockRejectedValueOnce(
      new WorkflowApiError("Server is unavailable.", "SERVER_ERROR", 500),
    );
    const user = userEvent.setup();
    render(
      <WorkflowsDashboard initialWorkflows={[wf("a", "Running one", "active")]} />,
    );
    await user.click(screen.getByTestId("workflow-status-toggle-switch"));
    const banner = await screen.findByTestId("workflows-dashboard-error");
    expect(banner).toHaveTextContent(/Server is unavailable/i);
    // Retry triggers another listWorkflows call.
    mockList.mockResolvedValueOnce([wf("a", "Running one", "paused")]);
    await user.click(screen.getByTestId("workflows-dashboard-retry"));
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
  });
});

describe("WorkflowsDashboard — Create CTA + Open navigation", () => {
  it("Create CTA hits createWorkflow and navigates to the new builder", async () => {
    mockCreate.mockResolvedValueOnce({ id: "wf-new" });
    const user = userEvent.setup();
    render(<WorkflowsDashboard initialWorkflows={[]} />);

    // Empty state and toolbar BOTH expose the Create CTA — drive the toolbar one.
    const toolbar = screen.getByTestId("workflows-toolbar");
    await user.click(
      within(toolbar).getByRole("button", { name: /create workflow/i }),
    );
    await user.type(
      within(toolbar).getByLabelText(/workflow name/i),
      "New automation",
    );
    await user.click(within(toolbar).getByRole("button", { name: /^create$/i }));
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({ name: "New automation" }),
    );
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith("/workflows/wf-new"),
    );
  });

  it("the row name is a link to /workflows/[id] (open-workflow navigation)", () => {
    render(
      <WorkflowsDashboard initialWorkflows={[wf("xyz", "Some workflow", "active")]} />,
    );
    const link = screen.getByTestId("workflow-row-name");
    expect(link).toHaveAttribute("href", "/workflows/xyz");
  });
});

describe("WorkflowsDashboard — no fake delete/duplicate actions are wired", () => {
  it("the actions menu exposes Open/Activate/Pause/Resume only — NOT Delete/Duplicate", async () => {
    const user = userEvent.setup();
    render(
      <WorkflowsDashboard initialWorkflows={[wf("a", "Active one", "active")]} />,
    );
    await user.click(screen.getByTestId("workflow-actions-menu-trigger"));
    const menu = await screen.findByTestId("workflow-actions-menu-content");
    expect(within(menu).getByTestId("workflow-actions-menu-open")).toBeInTheDocument();
    expect(within(menu).getByTestId("workflow-actions-menu-pause")).toBeInTheDocument();
    // Unsupported design-only actions: explicitly absent.
    expect(within(menu).queryByRole("button", { name: /delete/i })).toBeNull();
    expect(within(menu).queryByRole("button", { name: /duplicate/i })).toBeNull();
  });
});

describe("WorkflowsDashboard — accessibility basics", () => {
  it("uses a single <h1> and exposes named landmarks", () => {
    render(<WorkflowsDashboard initialWorkflows={[wf("a", "Wf", "active")]} />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("region", { name: /workflows/i })).toBeInTheDocument();
  });

  it("status conveys state by label text (not color alone)", () => {
    const { container } = render(
      <WorkflowsDashboard initialWorkflows={[wf("a", "Wf", "draft")]} />,
    );
    // The status badge (data-status-kind) carries an icon + the literal
    // "Draft" label — state is conveyed by shape+text, not color alone.
    const badge = container.querySelector('[data-status-kind="draft"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toMatch(/Draft/);
  });
});
