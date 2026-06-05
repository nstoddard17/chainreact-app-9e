/**
 * Tests for the WF-5 folders / trash / filters additions to WorkflowsDashboard.
 * Mocks lib/api/{workflows,folders,trash} + next/navigation.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockList = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return { ...actual, listWorkflows: (...a: unknown[]) => mockList(...a) };
});

const mockListFolders = jest.fn();
const mockCreateFolder = jest.fn();
const mockUpdateFolder = jest.fn();
const mockReorderFolders = jest.fn();
const mockDeleteFolder = jest.fn();
const mockRestoreFolder = jest.fn();
jest.mock("@/lib/api/folders", () => {
  const actual = jest.requireActual("@/lib/api/folders");
  return {
    ...actual,
    listFolders: (...a: unknown[]) => mockListFolders(...a),
    createFolder: (...a: unknown[]) => mockCreateFolder(...a),
    updateFolder: (...a: unknown[]) => mockUpdateFolder(...a),
    reorderFolders: (...a: unknown[]) => mockReorderFolders(...a),
    deleteFolder: (...a: unknown[]) => mockDeleteFolder(...a),
    restoreFolder: (...a: unknown[]) => mockRestoreFolder(...a),
  };
});

const mockListTrash = jest.fn();
const mockDeleteWorkflow = jest.fn();
const mockRestoreWorkflow = jest.fn();
const mockMoveWorkflow = jest.fn();
jest.mock("@/lib/api/trash", () => ({
  listTrash: (...a: unknown[]) => mockListTrash(...a),
  deleteWorkflow: (...a: unknown[]) => mockDeleteWorkflow(...a),
  restoreWorkflow: (...a: unknown[]) => mockRestoreWorkflow(...a),
  moveWorkflowToFolder: (...a: unknown[]) => mockMoveWorkflow(...a),
}));

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));

import { WorkflowsDashboard } from "@/features/workflows/WorkflowsDashboard";
import type { WorkflowListItem } from "@/contracts/workflow";
import type { WorkflowFolder } from "@/contracts/folders";

function wf(
  id: string,
  name: string,
  overrides: Partial<WorkflowListItem> = {},
): WorkflowListItem {
  return {
    id,
    name,
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
    ...overrides,
  };
}

function folder(
  id: string,
  name: string,
  overrides: Partial<WorkflowFolder> = {},
): WorkflowFolder {
  return {
    id,
    accountId: "acct",
    parentFolderId: null,
    name,
    position: 0,
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockResolvedValue([]);
  mockListFolders.mockResolvedValue([]);
});

describe("folder navigation", () => {
  it("Folders tab renders folder cards with workflow counts", async () => {
    const user = userEvent.setup();
    render(
      <WorkflowsDashboard
        initialWorkflows={[wf("a", "A", { folderId: "f1" }), wf("b", "B", { folderId: "f1" })]}
        initialFolders={[folder("f1", "Payments")]}
        folderLimit={10}
      />,
    );
    await user.click(screen.getByTestId("workflows-tab-folders"));
    const card = screen.getByTestId("workflow-folder-card");
    expect(card).toHaveTextContent("Payments");
    expect(card).toHaveTextContent("2 automations");
  });

  it("opening a folder narrows the Automations list to that folder", async () => {
    const user = userEvent.setup();
    render(
      <WorkflowsDashboard
        initialWorkflows={[wf("a", "In folder", { folderId: "f1" }), wf("b", "Elsewhere", { folderId: null })]}
        initialFolders={[folder("f1", "Payments")]}
      />,
    );
    await user.click(screen.getByTestId("workflows-tab-folders"));
    await user.click(screen.getByTestId("workflow-folder-open-f1"));
    // Back on automations, scoped to f1 → only the in-folder workflow.
    const rows = screen.getAllByTestId("workflow-row");
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByTestId("workflow-row-name")).toHaveTextContent("In folder");
  });
});

describe("list grid table", () => {
  it("renders the design column headers and a Folder chip for a workflow in a folder", () => {
    render(
      <WorkflowsDashboard
        initialWorkflows={[wf("a", "In folder", { folderId: "f1" })]}
        initialFolders={[folder("f1", "Payments")]}
      />,
    );
    const list = screen.getByTestId("workflows-list-view");
    expect(list).toHaveTextContent("Last changed");
    expect(screen.getByTestId("workflow-row-folder")).toHaveTextContent("Payments");
  });
});

describe("folder create / rename", () => {
  it("creates a folder via the dialog", async () => {
    mockCreateFolder.mockResolvedValueOnce(folder("f2", "Sales"));
    const user = userEvent.setup();
    render(<WorkflowsDashboard initialWorkflows={[wf("a", "A")]} initialFolders={[]} />);
    await user.click(screen.getByTestId("workflows-tab-folders"));
    await user.click(screen.getByTestId("workflow-folder-new"));
    await user.type(screen.getByTestId("folder-form-name"), "Sales");
    await user.click(screen.getByTestId("folder-form-submit"));
    await waitFor(() => expect(mockCreateFolder).toHaveBeenCalledWith({ name: "Sales" }));
    await waitFor(() => expect(mockListFolders).toHaveBeenCalled());
  });

  it("renames a folder via the card menu", async () => {
    mockUpdateFolder.mockResolvedValueOnce(folder("f1", "Renamed"));
    const user = userEvent.setup();
    render(
      <WorkflowsDashboard initialWorkflows={[wf("a", "A")]} initialFolders={[folder("f1", "Payments")]} />,
    );
    await user.click(screen.getByTestId("workflows-tab-folders"));
    await user.click(screen.getByTestId("workflow-folder-menu-f1"));
    await user.click(screen.getByTestId("workflow-folder-rename-f1"));
    const input = screen.getByTestId("folder-form-name");
    await user.clear(input);
    await user.type(input, "Renamed");
    await user.click(screen.getByTestId("folder-form-submit"));
    await waitFor(() => expect(mockUpdateFolder).toHaveBeenCalledWith("f1", { name: "Renamed" }));
  });

  it("disables New folder when the limit is reached", async () => {
    const user = userEvent.setup();
    render(
      <WorkflowsDashboard
        initialWorkflows={[wf("a", "A")]}
        initialFolders={[folder("f1", "One"), folder("f2", "Two")]}
        folderLimit={2}
      />,
    );
    await user.click(screen.getByTestId("workflows-tab-folders"));
    expect(screen.getByTestId("workflow-folder-new")).toBeDisabled();
  });
});

describe("folder delete dialog (two modes) + undo", () => {
  it("shows both delete modes and confirms with the chosen one, then offers Undo", async () => {
    mockDeleteFolder.mockResolvedValueOnce({ ok: true, deleteOperationId: "op1", mode: "with_contents" });
    mockRestoreFolder.mockResolvedValueOnce({ ok: true, deleteOperationId: "op1", restoredFolders: 1, restoredWorkflows: 0 });
    const user = userEvent.setup();
    render(
      <WorkflowsDashboard initialWorkflows={[wf("a", "A")]} initialFolders={[folder("f1", "Payments")]} />,
    );
    await user.click(screen.getByTestId("workflows-tab-folders"));
    await user.click(screen.getByTestId("workflow-folder-menu-f1"));
    await user.click(screen.getByTestId("workflow-folder-delete-f1"));
    // Both explicit modes present.
    expect(screen.getByTestId("folder-delete-mode-folder_only")).toBeInTheDocument();
    expect(screen.getByTestId("folder-delete-mode-with_contents")).toBeInTheDocument();
    // Choose with_contents then confirm.
    await user.click(within(screen.getByTestId("folder-delete-mode-with_contents")).getByRole("radio"));
    await user.click(screen.getByTestId("folder-delete-confirm"));
    await waitFor(() => expect(mockDeleteFolder).toHaveBeenCalledWith("f1", "with_contents"));
    // Undo toast appears and restores.
    const toast = await screen.findByTestId("workflows-undo-toast");
    await user.click(within(toast).getByTestId("workflows-undo-button"));
    await waitFor(() => expect(mockRestoreFolder).toHaveBeenCalledWith("f1"));
  });
});

describe("move workflow to folder / trash", () => {
  it("moves a workflow into a folder from the row actions menu", async () => {
    mockMoveWorkflow.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(
      <WorkflowsDashboard
        initialWorkflows={[wf("a", "A", { folderId: null })]}
        initialFolders={[folder("f1", "Payments")]}
      />,
    );
    await user.click(screen.getByTestId("workflow-actions-menu-trigger"));
    await user.click(await screen.findByTestId("workflow-actions-menu-move-f1"));
    await waitFor(() => expect(mockMoveWorkflow).toHaveBeenCalledWith("a", "f1"));
  });

  it("moves a workflow to Trash and offers Undo (restore)", async () => {
    mockDeleteWorkflow.mockResolvedValueOnce({ ok: true, deleteOperationId: "op", purgeAfter: "2026-06-11T00:00:00Z" });
    mockRestoreWorkflow.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<WorkflowsDashboard initialWorkflows={[wf("a", "A")]} initialFolders={[]} />);
    await user.click(screen.getByTestId("workflow-actions-menu-trigger"));
    await user.click(await screen.findByTestId("workflow-actions-menu-trash"));
    await waitFor(() => expect(mockDeleteWorkflow).toHaveBeenCalledWith("a"));
    const toast = await screen.findByTestId("workflows-undo-toast");
    await user.click(within(toast).getByTestId("workflows-undo-button"));
    await waitFor(() => expect(mockRestoreWorkflow).toHaveBeenCalledWith("a"));
  });
});

describe("trash view", () => {
  it("lazy-loads Trash and restores a trashed workflow", async () => {
    mockListTrash.mockResolvedValueOnce({
      folders: [],
      workflows: [
        { id: "t1", name: "Deleted one", deletedAt: "2026-06-04T00:00:00Z", purgeAfter: "2026-06-11T00:00:00Z", deletedFromFolderId: null, deleteOperationId: "op" },
      ],
    });
    mockRestoreWorkflow.mockResolvedValueOnce(undefined);
    mockListTrash.mockResolvedValueOnce({ folders: [], workflows: [] });
    const user = userEvent.setup();
    render(<WorkflowsDashboard initialWorkflows={[wf("a", "A")]} initialFolders={[]} />);
    await user.click(screen.getByTestId("workflows-tab-trash"));
    const row = await screen.findByTestId("trash-workflow-row");
    expect(row).toHaveTextContent("Deleted one");
    expect(row).toHaveTextContent(/purges in \d+ days?/);
    await user.click(screen.getByTestId("trash-restore-workflow-t1"));
    await waitFor(() => expect(mockRestoreWorkflow).toHaveBeenCalledWith("t1"));
  });

  it("renders the empty-trash state when Trash has nothing", async () => {
    mockListTrash.mockResolvedValueOnce({ folders: [], workflows: [] });
    const user = userEvent.setup();
    render(<WorkflowsDashboard initialWorkflows={[wf("a", "A")]} initialFolders={[]} />);
    await user.click(screen.getByTestId("workflows-tab-trash"));
    expect(await screen.findByTestId("workflows-empty-trash")).toBeInTheDocument();
  });
});

describe("filters panel", () => {
  it("folder + app filters narrow the list and Clear all resets", async () => {
    const user = userEvent.setup();
    render(
      <WorkflowsDashboard
        initialWorkflows={[
          wf("a", "Stripe in folder", { folderId: "f1", providers: [{ id: "stripe", label: "Stripe", iconUrl: null }] }),
          wf("b", "Gmail uncategorized", { folderId: null, providers: [{ id: "gmail", label: "Gmail", iconUrl: null }] }),
        ]}
        initialFolders={[folder("f1", "Payments")]}
      />,
    );
    expect(screen.getAllByTestId("workflow-row")).toHaveLength(2);
    await user.click(screen.getByTestId("workflows-filters-open"));
    // Folder facet → only f1.
    await user.click(within(screen.getByTestId("workflows-filters-folder-f1")).getByRole("checkbox"));
    let rows = screen.getAllByTestId("workflow-row");
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByTestId("workflow-row-name")).toHaveTextContent("Stripe in folder");
    // Clear all → both back.
    await user.click(screen.getByTestId("workflows-filters-clear"));
    rows = screen.getAllByTestId("workflow-row");
    expect(rows).toHaveLength(2);
  });

  it("the app chip filter narrows to workflows using that provider", async () => {
    const user = userEvent.setup();
    render(
      <WorkflowsDashboard
        initialWorkflows={[
          wf("a", "Has Stripe", { providers: [{ id: "stripe", label: "Stripe", iconUrl: null }] }),
          wf("b", "Has Gmail", { providers: [{ id: "gmail", label: "Gmail", iconUrl: null }] }),
        ]}
        initialFolders={[]}
      />,
    );
    await user.click(screen.getByTestId("workflows-filters-open"));
    await user.click(screen.getByTestId("workflows-filters-app-stripe"));
    const rows = screen.getAllByTestId("workflow-row");
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByTestId("workflow-row-name")).toHaveTextContent("Has Stripe");
  });

  it("shows the empty-folder state when a folder filter matches nothing", async () => {
    const user = userEvent.setup();
    render(
      <WorkflowsDashboard
        initialWorkflows={[wf("a", "Uncategorized", { folderId: null })]}
        initialFolders={[folder("f1", "Empty")]}
      />,
    );
    await user.click(screen.getByTestId("workflows-tab-folders"));
    await user.click(screen.getByTestId("workflow-folder-open-f1"));
    expect(screen.getByTestId("workflows-empty-folder")).toBeInTheDocument();
  });
});

describe("multi-select bulk actions", () => {
  it("selecting a row reveals the bulk bar; selecting all checks every row", async () => {
    const user = userEvent.setup();
    render(
      <WorkflowsDashboard
        initialWorkflows={[wf("a", "A"), wf("b", "B"), wf("c", "C")]}
        initialFolders={[]}
      />,
    );
    // No selection → no bulk bar.
    expect(screen.queryByTestId("workflows-bulk-bar")).toBeNull();

    await user.click(screen.getByTestId("workflow-row-select-a"));
    expect(screen.getByTestId("workflows-bulk-bar")).toHaveTextContent("1 selected");

    // Select-all header → 3 selected.
    await user.click(screen.getByTestId("workflows-select-all"));
    expect(screen.getByTestId("workflows-bulk-count")).toHaveTextContent("3");
    expect(screen.getByTestId("workflow-row-select-b")).toBeChecked();

    // Clear resets selection + hides the bar.
    await user.click(screen.getByTestId("workflows-bulk-clear"));
    expect(screen.queryByTestId("workflows-bulk-bar")).toBeNull();
  });

  it("bulk-moves every selected workflow into a folder (fan-out over the move API)", async () => {
    mockMoveWorkflow.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <WorkflowsDashboard
        initialWorkflows={[wf("a", "A"), wf("b", "B")]}
        initialFolders={[folder("f1", "Payments")]}
      />,
    );
    await user.click(screen.getByTestId("workflows-select-all"));
    await user.click(screen.getByTestId("workflows-bulk-move-trigger"));
    await user.click(await screen.findByTestId("workflows-bulk-move-f1"));
    await waitFor(() => {
      expect(mockMoveWorkflow).toHaveBeenCalledWith("a", "f1");
      expect(mockMoveWorkflow).toHaveBeenCalledWith("b", "f1");
    });
  });

  it("bulk-moves selected workflows to Uncategorized", async () => {
    mockMoveWorkflow.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <WorkflowsDashboard
        initialWorkflows={[wf("a", "A", { folderId: "f1" })]}
        initialFolders={[folder("f1", "Payments")]}
      />,
    );
    await user.click(screen.getByTestId("workflow-row-select-a"));
    await user.click(screen.getByTestId("workflows-bulk-move-trigger"));
    await user.click(await screen.findByTestId("workflows-bulk-move-uncategorized"));
    await waitFor(() => expect(mockMoveWorkflow).toHaveBeenCalledWith("a", null));
  });

  it("bulk-trashes selected workflows and offers Undo (restores each)", async () => {
    mockDeleteWorkflow.mockResolvedValue({
      ok: true,
      deleteOperationId: "op",
      purgeAfter: "2026-06-11T00:00:00Z",
    });
    mockRestoreWorkflow.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <WorkflowsDashboard
        initialWorkflows={[wf("a", "A"), wf("b", "B")]}
        initialFolders={[]}
      />,
    );
    await user.click(screen.getByTestId("workflows-select-all"));
    await user.click(screen.getByTestId("workflows-bulk-trash"));
    await waitFor(() => {
      expect(mockDeleteWorkflow).toHaveBeenCalledWith("a");
      expect(mockDeleteWorkflow).toHaveBeenCalledWith("b");
    });
    const toast = await screen.findByTestId("workflows-undo-toast");
    expect(toast).toHaveTextContent("2 workflows moved to Trash");
    await user.click(within(toast).getByTestId("workflows-undo-button"));
    await waitFor(() => {
      expect(mockRestoreWorkflow).toHaveBeenCalledWith("a");
      expect(mockRestoreWorkflow).toHaveBeenCalledWith("b");
    });
  });

  it("drops selection that filters out of view (can't act on hidden rows)", async () => {
    const user = userEvent.setup();
    render(
      <WorkflowsDashboard
        initialWorkflows={[
          wf("a", "Alpha", { providers: [{ id: "stripe", label: "Stripe", iconUrl: null }] }),
          wf("b", "Beta", { providers: [{ id: "gmail", label: "Gmail", iconUrl: null }] }),
        ]}
        initialFolders={[]}
      />,
    );
    await user.click(screen.getByTestId("workflows-select-all")); // 2 selected
    expect(screen.getByTestId("workflows-bulk-count")).toHaveTextContent("2");
    // Search narrows to just "Alpha" → selection prunes to 1.
    await user.type(screen.getByTestId("workflows-search-input"), "Alpha");
    await waitFor(() =>
      expect(screen.getByTestId("workflows-bulk-count")).toHaveTextContent("1"),
    );
  });
});

describe("nested folder tree", () => {
  // root "Payments" (p) → child "Cards" (c) → grandchild "Visa" (g)
  const nested = [
    folder("p", "Payments"),
    folder("c", "Cards", { parentFolderId: "p", position: 0 }),
    folder("g", "Visa", { parentFolderId: "c", position: 0 }),
  ];

  it("drills into a folder to reveal its subfolders, then a breadcrumb walks back", async () => {
    const user = userEvent.setup();
    render(<WorkflowsDashboard initialWorkflows={[wf("a", "A")]} initialFolders={nested} />);
    await user.click(screen.getByTestId("workflows-tab-folders"));

    // Root level shows only top-level folders (Payments), not its descendants.
    expect(screen.getByTestId("workflow-folder-drill-p")).toBeInTheDocument();
    expect(screen.queryByTestId("workflow-folder-drill-c")).toBeNull();

    // Drill into Payments → its child Cards appears; Payments no longer a card.
    await user.click(screen.getByTestId("workflow-folder-drill-p"));
    expect(screen.getByTestId("workflow-folder-drill-c")).toBeInTheDocument();
    expect(screen.queryByTestId("workflow-folder-drill-p")).toBeNull();

    // Breadcrumb back to All folders.
    await user.click(screen.getByTestId("workflow-folder-crumb-root"));
    expect(screen.getByTestId("workflow-folder-drill-p")).toBeInTheDocument();
  });

  it("creates a subfolder inside the browsed folder (parentFolderId threaded)", async () => {
    mockCreateFolder.mockResolvedValueOnce(folder("n", "New", { parentFolderId: "p" }));
    const user = userEvent.setup();
    render(<WorkflowsDashboard initialWorkflows={[wf("a", "A")]} initialFolders={nested} />);
    await user.click(screen.getByTestId("workflows-tab-folders"));
    await user.click(screen.getByTestId("workflow-folder-drill-p"));
    await user.click(screen.getByTestId("workflow-folder-new"));
    await user.type(screen.getByTestId("folder-form-name"), "Refunds");
    await user.click(screen.getByTestId("folder-form-submit"));
    await waitFor(() =>
      expect(mockCreateFolder).toHaveBeenCalledWith({ name: "Refunds", parentFolderId: "p" }),
    );
  });

  it("disables New subfolder once the depth-3 cap is reached", async () => {
    const user = userEvent.setup();
    render(<WorkflowsDashboard initialWorkflows={[wf("a", "A")]} initialFolders={nested} folderLimit={100} />);
    await user.click(screen.getByTestId("workflows-tab-folders"));
    await user.click(screen.getByTestId("workflow-folder-drill-p")); // browse Payments (a depth-2 child is ok)
    await user.click(screen.getByTestId("workflow-folder-drill-c")); // browse Cards (a depth-3 child is ok)
    await user.click(screen.getByTestId("workflow-folder-drill-g")); // browse Visa (depth 3) — a child would be depth 4
    expect(screen.getByTestId("workflow-folder-new")).toBeDisabled();
  });

  it("moves a folder to the top level via the Move dialog", async () => {
    mockUpdateFolder.mockResolvedValueOnce(folder("c", "Cards"));
    const user = userEvent.setup();
    render(<WorkflowsDashboard initialWorkflows={[wf("a", "A")]} initialFolders={nested} />);
    await user.click(screen.getByTestId("workflows-tab-folders"));
    await user.click(screen.getByTestId("workflow-folder-drill-p"));
    await user.click(screen.getByTestId("workflow-folder-menu-c"));
    await user.click(screen.getByTestId("workflow-folder-move-c"));
    // Cards is nested under Payments → "Top level" is offered; pick + confirm.
    await user.click(screen.getByTestId("folder-move-target-root"));
    await user.click(screen.getByTestId("folder-move-confirm"));
    await waitFor(() =>
      expect(mockUpdateFolder).toHaveBeenCalledWith("c", { parentFolderId: null }),
    );
  });

  it("reorders sibling folders with the up/down controls", async () => {
    mockReorderFolders.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(
      <WorkflowsDashboard
        initialWorkflows={[wf("a", "A")]}
        initialFolders={[
          folder("f1", "Alpha", { position: 0 }),
          folder("f2", "Beta", { position: 1 }),
        ]}
      />,
    );
    await user.click(screen.getByTestId("workflows-tab-folders"));
    // Move Beta up → siblings reordered to [f2, f1] within the root group.
    await user.click(screen.getByTestId("workflow-folder-up-f2"));
    await waitFor(() =>
      expect(mockReorderFolders).toHaveBeenCalledWith({
        parentFolderId: null,
        orderedIds: ["f2", "f1"],
      }),
    );
  });
});
