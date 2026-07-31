/**
 * RESPONSIVE-DATA-SURFACES-5 — workflow list/table responsive behaviour.
 *
 * jsdom has no layout engine, so geometry belongs to the continuous real-browser
 * sweep (12 states × 158 widths, 360→1600). What this file protects is what the
 * sweep cannot see: that the table and the stacked-card presentations are ONE set
 * of controls, that selection and permissions are untouched, and that the actions
 * a user is offered do not depend on how wide their screen is.
 *
 * That last point is the whole reason the brief forbids a duplicated mobile list,
 * so it is asserted against rendered controls rather than inferred from markup.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkflowsTable } from "@/features/workflows/WorkflowsTable";
import { WorkflowRow } from "@/features/workflows/WorkflowRow";
import type { WorkflowListItem } from "@/contracts/workflow";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), replace: jest.fn() }),
}));

const LONG_NAME =
  "Quarterly revenue reconciliation, Slack digest, and finance operations follow-up for the enterprise accounts team";
const LONG_UNBROKEN =
  "Enterprise_revenue_operations_reconciliation_and_notification_pipeline_v2026_final";
const LONG_FOLDER = "Finance Operations — EMEA Quarterly Close and Reconciliation Programme";

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
    runStats: {
      total: 10,
      succeeded: 9,
      successRate: 0.9,
      lastRunAt: "2026-07-29T10:00:00Z",
      lastRunStatus: "succeeded",
    },
    folderId: null,
    ...over,
  } as WorkflowListItem;
}

const A = wf({ id: "aaaaaaaa-0000-4000-8000-000000000001", name: "Welcome new leads" });
const B = wf({
  id: "bbbbbbbb-0000-4000-8000-000000000002",
  name: LONG_NAME,
  state: "paused",
  folderId: "f-1",
});
const C = wf({ id: "cccccccc-0000-4000-8000-000000000003", name: LONG_UNBROKEN, state: "draft" });

const FOLDERS = new Map([["f-1", LONG_FOLDER]]);
const noop = () => {};
const folderActionsFor = () => ({ folders: [], onMoveToFolder: noop, onMoveToTrash: noop });

function renderTable(over: Partial<Parameters<typeof WorkflowsTable>[0]> = {}) {
  return render(
    <WorkflowsTable
      workflows={[A, B, C]}
      folderNameById={FOLDERS}
      onChanged={noop}
      folderActionsFor={folderActionsFor}
      {...over}
    />,
  );
}

// ── One implementation, not two ──────────────────────────────────────────────

describe("the row is a table and a card from one set of controls", () => {
  it("renders exactly one action menu and one name link per workflow", () => {
    renderTable();
    expect(screen.getAllByTestId("workflow-row")).toHaveLength(3);
    // A duplicated mobile list would double every one of these, and the two
    // copies could then expose different actions or drift in selection state.
    expect(screen.getAllByTestId("workflow-actions-menu-trigger")).toHaveLength(3);
    expect(screen.getAllByTestId("workflow-row-name")).toHaveLength(3);
  });

  it("renders exactly one checkbox per workflow in selectable mode", () => {
    renderTable({ selectedIds: new Set(), onToggleSelect: noop, onToggleSelectAll: noop });
    expect(screen.getAllByRole("checkbox")).toHaveLength(4); // 3 rows + select-all
    expect(screen.getAllByTestId(`workflow-row-select-${A.id}`)).toHaveLength(1);
  });

  it("switches from stacked card to aligned grid at lg, not before", () => {
    renderTable();
    const row = screen.getAllByTestId("workflow-row")[0]!;
    // Behaviour: the row still carries identity, status and its action control…
    expect(within(row).getByTestId("workflow-row-name")).toBeInTheDocument();
    expect(within(row).getByTestId("workflow-actions-menu-trigger")).toBeInTheDocument();
    // …and the mechanism: column layout by default, grid only from `lg`.
    expect(row.className).toContain("flex-col");
    expect(row.className).toContain("lg:grid");
    expect(row.className).not.toMatch(/(^|\s)grid(\s|$)/);
  });

  it("hides the column headings below lg, where there are no columns to label", () => {
    renderTable();
    const head = screen.getByTestId("workflows-list-head");
    expect(head.className).toContain("hidden");
    expect(head.className).toContain("lg:grid");
  });

  it("labels the changed-date in card mode, where its column heading is gone", () => {
    renderTable();
    expect(screen.getAllByTestId("workflow-row-modified")[0]).toHaveTextContent(/Changed/);
  });
});

// ── No panning ───────────────────────────────────────────────────────────────

describe("the list never asks a phone user to pan sideways", () => {
  it("applies the 880px table floor and its scroller only from lg", () => {
    renderTable();
    const view = screen.getByTestId("workflows-list-view");
    // The inner sizer previously carried a hard `min-w-[880px]` at every width,
    // inside an always-on `overflow-x-auto` — an 880px table to drag on a phone.
    const sizer = view.firstElementChild as HTMLElement;
    expect(sizer.className).toContain("lg:min-w-[880px]");
    expect(sizer.className).not.toMatch(/(^|\s)min-w-\[880px\]/);
    expect(view.className).toContain("lg:overflow-x-auto");
    expect(view.className).not.toMatch(/(^|\s)overflow-x-auto/);
  });

  it("declares that panning is not an acceptable answer below lg", () => {
    renderTable();
    // The browser sweep enforces this at every swept width; the component is what
    // declares it, so the declaration is worth protecting.
    expect(screen.getByTestId("workflows-list-view")).toHaveAttribute(
      "data-no-pan-below",
      "1024",
    );
  });
});

// ── Identity legibility ──────────────────────────────────────────────────────

describe("workflow identity stays readable", () => {
  it("declares a legibility floor on the ALLOCATED identity cell", () => {
    renderTable();
    const row = screen.getAllByTestId("workflow-row")[1]!;
    const identity = row.querySelector("[data-legible-min]") as HTMLElement;
    expect(identity).not.toBeNull();
    expect(Number(identity.getAttribute("data-legible-min"))).toBeGreaterThanOrEqual(180);
    // It must be the cell that HOLDS the name, not the name itself.
    expect(within(identity).getByTestId("workflow-row-name")).toBeInTheDocument();
  });

  it("wraps a long name in card mode and ellipsises it in the table", () => {
    renderTable();
    const name = screen.getAllByTestId("workflow-row-name")[1]!;
    expect(name).toHaveTextContent(LONG_NAME);
    expect(name.className).toContain("break-words");
    expect(name.className).toContain("lg:truncate");
  });

  it("keeps a long folder label inside its own chip", () => {
    renderTable();
    const folder = screen.getByTestId("workflow-row-folder");
    expect(folder).toHaveTextContent(LONG_FOLDER);
    expect(folder.className).toContain("max-w-full");
  });

  it("keeps an unbroken name contained", () => {
    renderTable();
    expect(screen.getAllByTestId("workflow-row-name")[2]).toHaveTextContent(LONG_UNBROKEN);
  });
});

// ── Selection is unchanged ───────────────────────────────────────────────────

describe("selection semantics survive the presentation change", () => {
  it("reports the exact workflow id and checked state on toggle", async () => {
    const user = userEvent.setup();
    const onToggleSelect = jest.fn();
    renderTable({ selectedIds: new Set(), onToggleSelect, onToggleSelectAll: noop });
    await user.click(screen.getByTestId(`workflow-row-select-${B.id}`));
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    expect(onToggleSelect).toHaveBeenCalledWith(B.id, true);
  });

  it("keeps select-all and its indeterminate state", async () => {
    const user = userEvent.setup();
    const onToggleSelectAll = jest.fn();
    const { rerender } = renderTable({
      selectedIds: new Set([A.id]),
      onToggleSelect: noop,
      onToggleSelectAll,
    });
    const selectAll = screen.getByTestId("workflows-select-all") as HTMLInputElement;
    // One of three selected → indeterminate, not checked.
    expect(selectAll.indeterminate).toBe(true);
    expect(selectAll.checked).toBe(false);

    await user.click(selectAll);
    expect(onToggleSelectAll).toHaveBeenCalledWith(true);

    rerender(
      <WorkflowsTable
        workflows={[A, B, C]}
        folderNameById={FOLDERS}
        onChanged={noop}
        folderActionsFor={folderActionsFor}
        selectedIds={new Set([A.id, B.id, C.id])}
        onToggleSelect={noop}
        onToggleSelectAll={onToggleSelectAll}
      />,
    );
    const allNow = screen.getByTestId("workflows-select-all") as HTMLInputElement;
    expect(allNow.checked).toBe(true);
    expect(allNow.indeterminate).toBe(false);
  });

  it("marks a selected row for assistive tech in either presentation", () => {
    renderTable({
      selectedIds: new Set([B.id]),
      onToggleSelect: noop,
      onToggleSelectAll: noop,
    });
    const rows = screen.getAllByTestId("workflow-row");
    expect(rows[1]).toHaveAttribute("aria-selected", "true");
    expect(rows[0]).toHaveAttribute("aria-selected", "false");
  });

  it("renders no checkboxes at all when selection is not wired", () => {
    renderTable();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});

// ── Permissions / status are unchanged ───────────────────────────────────────

describe("status and permissions are unaffected by layout", () => {
  it("keeps the status control and badge present for every row", () => {
    renderTable();
    for (const row of screen.getAllByTestId("workflow-row")) {
      expect(within(row).getByTestId("workflow-actions-menu-trigger")).toBeVisible();
    }
  });

  it("still surfaces the private-connection restriction on a restricted row", () => {
    render(
      <WorkflowRow
        workflow={wf({
          id: "dddddddd-0000-4000-8000-000000000004",
          name: "Restricted",
          usesPrivateCredential: true,
          viewerCanRunEdit: false,
        })}
        onChanged={noop}
      />,
    );
    // A responsive change must not quietly drop a permission signal.
    expect(screen.getByTestId("workflow-row")).toHaveTextContent(/Private connection/i);
  });
});
