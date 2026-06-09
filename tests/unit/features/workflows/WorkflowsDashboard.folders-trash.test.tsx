/**
 * Integration coverage for WorkflowsDashboard's folder-CRUD, trash, and undo
 * orchestration — the handlers that live directly on the dashboard
 * (handleCreateFolder / handleRenameFolder / handleReorderFolder /
 * handleDeleteFolder / handleMoveToFolder / handleMoveToTrash /
 * handleRestoreFromTrash / runUndo) plus the folder-nav cleanup effect.
 *
 * The existing WorkflowsDashboard.test.tsx covers render / filters / Create-CTA
 * but NOT these mutation flows, so they were previously unverified at the
 * dashboard-integration level. This file renders the real dashboard with mocked
 * lib/api/{workflows,folders,trash} and drives the real sub-components
 * (folders grid, dialogs, trash view, undo toast, row actions menu) so the
 * wiring is exercised end-to-end. Establishes the safety net for a future
 * extraction of the folder/trash concern into a hook.
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
    ...actual, // keep FolderApiError for the dialogs
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
const mockMoveWorkflowToFolder = jest.fn();
jest.mock("@/lib/api/trash", () => {
  const actual = jest.requireActual("@/lib/api/trash");
  return {
    ...actual,
    listTrash: (...a: unknown[]) => mockListTrash(...a),
    deleteWorkflow: (...a: unknown[]) => mockDeleteWorkflow(...a),
    restoreWorkflow: (...a: unknown[]) => mockRestoreWorkflow(...a),
    moveWorkflowToFolder: (...a: unknown[]) => mockMoveWorkflowToFolder(...a),
  };
});

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

import { WorkflowsDashboard } from "@/features/workflows/WorkflowsDashboard";
import type { WorkflowListItem } from "@/contracts/workflow";
import type { WorkflowFolder } from "@/contracts/folders";

function wf(
  id: string,
  name: string,
  state: WorkflowListItem["state"] = "active",
  overrides: Partial<WorkflowListItem> = {},
): WorkflowListItem {
  return {
    id,
    name,
    state,
    disabledReason: null,
    disabledContext: null,
    deletedAt: null,
    folderId: null,
    createdAt: "2026-05-29T00:00:00Z",
    updatedAt: "2026-05-29T00:00:00Z",
    providers: [],
    triggerCount: 0,
    actionCount: 0,
    runStats: {
      total: 0,
      succeeded: 0,
      successRate: 0,
      lastRunAt: null,
      lastRunStatus: null,
    },
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
    accountId: "acct-1",
    parentFolderId: null,
    name,
    position: 0,
    createdAt: "2026-05-29T00:00:00Z",
    updatedAt: "2026-05-29T00:00:00Z",
    ...overrides,
  };
}

const FUTURE = "2099-01-01T00:00:00Z";

beforeEach(() => {
  mockList.mockReset().mockResolvedValue([]);
  mockListFolders.mockReset().mockResolvedValue([]);
  mockCreateFolder.mockReset();
  mockUpdateFolder.mockReset();
  mockReorderFolders.mockReset().mockResolvedValue(undefined);
  mockDeleteFolder.mockReset();
  mockRestoreFolder.mockReset().mockResolvedValue({
    ok: true,
    deleteOperationId: "op",
    restoredFolders: 1,
    restoredWorkflows: 0,
  });
  mockListTrash.mockReset();
  mockDeleteWorkflow.mockReset();
  mockRestoreWorkflow.mockReset().mockResolvedValue(undefined);
  mockMoveWorkflowToFolder.mockReset().mockResolvedValue(undefined);
  mockPush.mockReset();
});

async function openFoldersTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("workflows-tab-folders"));
}

describe("WorkflowsDashboard — folder CRUD", () => {
  it("creates a top-level folder (createFolder + folder list refresh)", async () => {
    const user = userEvent.setup();
    mockCreateFolder.mockResolvedValueOnce(folder("f-new", "Payments ops"));
    mockListFolders.mockResolvedValueOnce([folder("f-new", "Payments ops")]);

    render(<WorkflowsDashboard initialWorkflows={[]} initialFolders={[]} />);
    await openFoldersTab(user);

    await user.click(screen.getByTestId("workflow-folder-new"));
    await user.type(screen.getByTestId("folder-form-name"), "Payments ops");
    await user.click(screen.getByTestId("folder-form-submit"));

    await waitFor(() =>
      expect(mockCreateFolder).toHaveBeenCalledWith({ name: "Payments ops" }),
    );
    // refreshFolders re-fetched and the new card rendered.
    await waitFor(() =>
      expect(screen.getByTestId("workflow-folder-drill-f-new")).toBeInTheDocument(),
    );
  });

  it("creates a subfolder INSIDE the browsed folder (threads parentFolderId)", async () => {
    const user = userEvent.setup();
    mockCreateFolder.mockResolvedValueOnce(
      folder("f-child", "Refunds", { parentFolderId: "f1" }),
    );
    mockListFolders.mockResolvedValueOnce([
      folder("f1", "Parent"),
      folder("f-child", "Refunds", { parentFolderId: "f1" }),
    ]);

    render(
      <WorkflowsDashboard initialWorkflows={[]} initialFolders={[folder("f1", "Parent")]} />,
    );
    await openFoldersTab(user);
    // Drill into the parent so folderNav = f1.
    await user.click(screen.getByTestId("workflow-folder-drill-f1"));

    await user.click(screen.getByTestId("workflow-folder-new"));
    await user.type(screen.getByTestId("folder-form-name"), "Refunds");
    await user.click(screen.getByTestId("folder-form-submit"));

    await waitFor(() =>
      expect(mockCreateFolder).toHaveBeenCalledWith({
        name: "Refunds",
        parentFolderId: "f1",
      }),
    );
  });

  it("renames a folder (updateFolder with the new name)", async () => {
    const user = userEvent.setup();
    mockUpdateFolder.mockResolvedValueOnce(folder("f1", "Renamed"));
    mockListFolders.mockResolvedValueOnce([folder("f1", "Renamed")]);

    render(
      <WorkflowsDashboard initialWorkflows={[]} initialFolders={[folder("f1", "Parent")]} />,
    );
    await openFoldersTab(user);

    await user.click(screen.getByTestId("workflow-folder-menu-f1"));
    await user.click(screen.getByTestId("workflow-folder-rename-f1"));
    const input = screen.getByTestId("folder-form-name");
    await user.clear(input);
    await user.type(input, "Renamed");
    await user.click(screen.getByTestId("folder-form-submit"));

    await waitFor(() =>
      expect(mockUpdateFolder).toHaveBeenCalledWith("f1", { name: "Renamed" }),
    );
  });

  it("reorders sibling folders (reorderFolders with the swapped order)", async () => {
    const user = userEvent.setup();
    mockListFolders.mockResolvedValueOnce([
      folder("f1", "First", { position: 1 }),
      folder("f2", "Second", { position: 0 }),
    ]);

    render(
      <WorkflowsDashboard
        initialWorkflows={[]}
        initialFolders={[
          folder("f1", "First", { position: 0 }),
          folder("f2", "Second", { position: 1 }),
        ]}
      />,
    );
    await openFoldersTab(user);

    // Move the first sibling down → order becomes [f2, f1].
    await user.click(screen.getByTestId("workflow-folder-down-f1"));

    await waitFor(() =>
      expect(mockReorderFolders).toHaveBeenCalledWith({
        parentFolderId: null,
        orderedIds: ["f2", "f1"],
      }),
    );
  });

  it("deletes a folder then UNDO restores it", async () => {
    const user = userEvent.setup();
    mockDeleteFolder.mockResolvedValueOnce({
      ok: true,
      deleteOperationId: "op1",
      mode: "with_contents",
    });
    // After delete: folder list empty + workflow list refresh.
    mockListFolders.mockResolvedValueOnce([]);

    render(
      <WorkflowsDashboard initialWorkflows={[]} initialFolders={[folder("f1", "Parent")]} />,
    );
    await openFoldersTab(user);

    await user.click(screen.getByTestId("workflow-folder-menu-f1"));
    await user.click(screen.getByTestId("workflow-folder-delete-f1"));
    // Pick the explicit "with contents" mode, then confirm.
    await user.click(screen.getByTestId("folder-delete-mode-with_contents"));
    await user.click(screen.getByTestId("folder-delete-confirm"));

    await waitFor(() =>
      expect(mockDeleteFolder).toHaveBeenCalledWith("f1", "with_contents"),
    );

    // Undo toast appears → clicking Undo restores via restoreFolder.
    const toast = await screen.findByTestId("workflows-undo-toast");
    expect(toast).toHaveTextContent(/Parent.*moved to Trash/i);
    await user.click(screen.getByTestId("workflows-undo-button"));
    await waitFor(() => expect(mockRestoreFolder).toHaveBeenCalledWith("f1"));
  });
});

describe("WorkflowsDashboard — workflow move + trash from the row menu", () => {
  it("moves a workflow into a folder (moveWorkflowToFolder + refresh)", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValue([wf("a", "Payments")]);

    render(
      <WorkflowsDashboard
        initialWorkflows={[wf("a", "Payments")]}
        initialFolders={[folder("f1", "Ops")]}
      />,
    );

    await user.click(screen.getByTestId("workflow-actions-menu-trigger"));
    await screen.findByTestId("workflow-actions-menu-content");
    await user.click(screen.getByTestId("workflow-actions-menu-move-f1"));

    await waitFor(() =>
      expect(mockMoveWorkflowToFolder).toHaveBeenCalledWith("a", "f1"),
    );
    await waitFor(() => expect(mockList).toHaveBeenCalled());
  });

  it("moves a workflow to Trash then UNDO restores it", async () => {
    const user = userEvent.setup();
    mockDeleteWorkflow.mockResolvedValueOnce({
      ok: true,
      deleteOperationId: "op",
      purgeAfter: FUTURE,
    });
    mockList.mockResolvedValue([]);

    render(<WorkflowsDashboard initialWorkflows={[wf("a", "Payments")]} />);

    await user.click(screen.getByTestId("workflow-actions-menu-trigger"));
    await screen.findByTestId("workflow-actions-menu-content");
    await user.click(screen.getByTestId("workflow-actions-menu-trash"));

    await waitFor(() => expect(mockDeleteWorkflow).toHaveBeenCalledWith("a"));

    const toast = await screen.findByTestId("workflows-undo-toast");
    expect(toast).toHaveTextContent(/Payments.*moved to Trash/i);
    await user.click(screen.getByTestId("workflows-undo-button"));
    await waitFor(() => expect(mockRestoreWorkflow).toHaveBeenCalledWith("a"));
  });
});

describe("WorkflowsDashboard — Trash tab", () => {
  it("lazy-loads Trash on first open and restores a workflow", async () => {
    const user = userEvent.setup();
    mockListTrash
      .mockResolvedValueOnce({
        folders: [],
        workflows: [
          {
            id: "a",
            name: "Deleted wf",
            deletedAt: null,
            purgeAfter: FUTURE,
            deletedFromFolderId: null,
            deleteOperationId: null,
          },
        ],
      })
      .mockResolvedValueOnce({ folders: [], workflows: [] });

    render(<WorkflowsDashboard initialWorkflows={[]} />);
    await user.click(screen.getByTestId("workflows-tab-trash"));

    // Lazy-load fired exactly once on first open.
    await waitFor(() => expect(mockListTrash).toHaveBeenCalledTimes(1));
    const row = await screen.findByTestId("trash-workflow-row");
    expect(row).toHaveTextContent("Deleted wf");

    await user.click(screen.getByTestId("trash-restore-workflow-a"));
    await waitFor(() => expect(mockRestoreWorkflow).toHaveBeenCalledWith("a"));
    // Restore reloads Trash (and the workflow/folder lists).
    await waitFor(() => expect(mockListTrash).toHaveBeenCalledTimes(2));
  });

  it("shows an error with Retry when Trash fails to load", async () => {
    const user = userEvent.setup();
    mockListTrash
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ folders: [], workflows: [] });

    render(<WorkflowsDashboard initialWorkflows={[]} />);
    await user.click(screen.getByTestId("workflows-tab-trash"));

    const err = await screen.findByTestId("workflows-trash-error");
    await user.click(within(err).getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(mockListTrash).toHaveBeenCalledTimes(2));
  });
});

describe("WorkflowsDashboard — folder-nav cleanup effect", () => {
  it("falls back to the root level when the browsed folder disappears", async () => {
    const user = userEvent.setup();
    // While browsing inside f1, a refresh returns a list WITHOUT f1 (it was
    // deleted out from under us) → nav must reset to root.
    mockListFolders.mockResolvedValueOnce([folder("fx", "Other")]);

    render(
      <WorkflowsDashboard
        initialWorkflows={[]}
        initialFolders={[
          folder("f1", "Parent", { position: 0 }),
          folder("f2", "ChildA", { parentFolderId: "f1", position: 0 }),
          folder("f3", "ChildB", { parentFolderId: "f1", position: 1 }),
        ]}
      />,
    );
    await openFoldersTab(user);
    await user.click(screen.getByTestId("workflow-folder-drill-f1"));
    // Inside f1 we see its subfolders.
    expect(screen.getByTestId("workflow-folder-drill-f2")).toBeInTheDocument();

    // Reorder a child → triggers a folder refresh that drops f1 entirely.
    await user.click(screen.getByTestId("workflow-folder-down-f2"));

    // Nav reset to root: the ghost "no subfolders" view is gone and the
    // remaining root folder is shown.
    await waitFor(() =>
      expect(screen.getByTestId("workflow-folder-drill-fx")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("workflow-folder-no-subfolders")).toBeNull();
    expect(screen.queryByTestId("workflow-folder-crumb-f1")).toBeNull();
  });
});
