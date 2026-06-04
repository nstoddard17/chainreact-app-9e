/**
 * @jest-environment node
 *
 * Trash soft-delete + restore orchestration (Slice 4.WORKFLOW-FOLDERS-4 / WF-3).
 * Mocks the repos + the lifecycle orchestrator; drives the real batch/ordering
 * logic. Roles are never consulted.
 */

const foldersRepo = {
  getById: jest.fn(),
  listByAccount: jest.fn(),
  updateParentAndPosition: jest.fn(),
  softDelete: jest.fn(),
  restore: jest.fn(),
  listByDeleteOperation: jest.fn(),
  listTrashedByAccount: jest.fn(),
};
const workflowsRepo = {
  getById: jest.fn(),
  reparentWorkflows: jest.fn(),
  listByFolderIds: jest.fn(),
  listByDeleteOperation: jest.fn(),
  listTrashedByAccount: jest.fn(),
};
const orchestrator = { delete: jest.fn(), restore: jest.fn() };

jest.mock("@/repositories/workflowFolders", () => foldersRepo);
jest.mock("@/repositories/workflows", () => workflowsRepo);
jest.mock("@/services/workflows/orchestratorFactory", () => ({
  createLifecycleOrchestrator: () => orchestrator,
}));

import {
  deleteWorkflow,
  restoreWorkflow,
  deleteFolder,
  restoreFolder,
  listTrash,
  orderFoldersForRestore,
  WORKFLOW_TRASH_RETENTION_DAYS,
} from "@/services/workflowFolders/trashService";

const ACCT = "acct-1";

function folder(over: {
  id: string;
  parentFolderId?: string | null;
  accountId?: string;
  deletedAt?: string | null;
  deletedFromParentFolderId?: string | null;
  deleteOperationId?: string | null;
  position?: number;
}) {
  return {
    id: over.id,
    accountId: over.accountId ?? ACCT,
    parentFolderId: over.parentFolderId ?? null,
    name: over.id,
    position: over.position ?? 0,
    createdByUserId: "u1",
    createdAt: "2026-06-03T00:00:00Z",
    updatedAt: "2026-06-03T00:00:00Z",
    deletedAt: over.deletedAt ?? null,
    deletedByUserId: null,
    purgeAfter: null,
    deletedFromParentFolderId: over.deletedFromParentFolderId ?? null,
    deleteOperationId: over.deleteOperationId ?? null,
  };
}

function workflow(over: {
  id: string;
  state?: string;
  folderId?: string | null;
  deletedFromFolderId?: string | null;
  deleteOperationId?: string | null;
}) {
  return {
    id: over.id,
    accountId: ACCT,
    createdByUserId: "u1",
    name: over.id,
    state: over.state ?? "active",
    disabledReason: null,
    disabledContext: null,
    activeRevisionId: null,
    draftDefinition: { nodes: [], edges: [] },
    deletedAt: null,
    folderId: over.folderId ?? null,
    deletedByUserId: null,
    purgeAfter: null,
    deletedFromFolderId: over.deletedFromFolderId ?? null,
    deleteOperationId: over.deleteOperationId ?? null,
    createdAt: "2026-06-03T00:00:00Z",
    updatedAt: "2026-06-03T00:00:00Z",
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  foldersRepo.softDelete.mockResolvedValue(null);
  foldersRepo.restore.mockResolvedValue(null);
  foldersRepo.updateParentAndPosition.mockResolvedValue(undefined);
  foldersRepo.listByAccount.mockResolvedValue([]);
  workflowsRepo.reparentWorkflows.mockResolvedValue(undefined);
  workflowsRepo.listByFolderIds.mockResolvedValue([]);
  orchestrator.delete.mockResolvedValue(undefined);
  orchestrator.restore.mockResolvedValue(undefined);
});

// ── workflow delete ────────────────────────────────────────────────────────────

describe("deleteWorkflow", () => {
  it("stamps trash metadata (purge_after = deleted_at + 7d) and returns a deleteOperationId", async () => {
    workflowsRepo.getById.mockResolvedValue(workflow({ id: "wf", state: "active", folderId: "f1" }));
    const r = await deleteWorkflow("wf", "user-1");
    expect(r.ok).toBe(true);
    expect(orchestrator.delete).toHaveBeenCalledWith(
      "wf",
      expect.objectContaining({ deletedByUserId: "user-1", deletedFromFolderId: "f1" }),
    );
    const trash = orchestrator.delete.mock.calls[0]![1];
    const windowMs = new Date(trash.purgeAfter).getTime() - new Date(trash.deletedAt).getTime();
    expect(windowMs).toBe(WORKFLOW_TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    expect((r as { ok: true; data: { deleteOperationId: string } }).data.deleteOperationId).toBeTruthy();
  });

  it("returns WORKFLOW_NOT_FOUND for a missing or already-deleted workflow", async () => {
    workflowsRepo.getById.mockResolvedValue(workflow({ id: "wf", state: "deleted" }));
    const r = await deleteWorkflow("wf", "user-1");
    expect(r).toMatchObject({ ok: false, code: "WORKFLOW_NOT_FOUND", status: 404 });
    expect(orchestrator.delete).not.toHaveBeenCalled();
  });
});

// ── workflow restore ─────────────────────────────────────────────────────────

describe("restoreWorkflow", () => {
  it("restores to the original folder when it is still live", async () => {
    workflowsRepo.getById.mockResolvedValue(
      workflow({ id: "wf", state: "deleted", deletedFromFolderId: "f1" }),
    );
    foldersRepo.getById.mockResolvedValue(folder({ id: "f1", deletedAt: null }));
    const r = await restoreWorkflow("wf");
    expect(r.ok).toBe(true);
    expect(orchestrator.restore).toHaveBeenCalledWith("wf", { folderId: "f1" });
  });

  it("falls back to root when the original folder is gone", async () => {
    workflowsRepo.getById.mockResolvedValue(
      workflow({ id: "wf", state: "deleted", deletedFromFolderId: "f1" }),
    );
    foldersRepo.getById.mockResolvedValue(null);
    await restoreWorkflow("wf");
    expect(orchestrator.restore).toHaveBeenCalledWith("wf", { folderId: null });
  });

  it("falls back to root when the original folder is itself trashed", async () => {
    workflowsRepo.getById.mockResolvedValue(
      workflow({ id: "wf", state: "deleted", deletedFromFolderId: "f1" }),
    );
    foldersRepo.getById.mockResolvedValue(folder({ id: "f1", deletedAt: "2026-06-03T00:00:00Z" }));
    await restoreWorkflow("wf");
    expect(orchestrator.restore).toHaveBeenCalledWith("wf", { folderId: null });
  });

  it("returns NOT_TRASHED when the workflow is not deleted", async () => {
    workflowsRepo.getById.mockResolvedValue(workflow({ id: "wf", state: "active" }));
    const r = await restoreWorkflow("wf");
    expect(r).toMatchObject({ ok: false, code: "NOT_TRASHED" });
    expect(orchestrator.restore).not.toHaveBeenCalled();
  });
});

// ── folder delete modes ────────────────────────────────────────────────────────

describe("deleteFolder — folder_only", () => {
  it("promotes direct child folders + workflows one level, then trashes only the folder", async () => {
    foldersRepo.getById.mockResolvedValue(folder({ id: "a", parentFolderId: "p" }));
    foldersRepo.listByAccount.mockResolvedValue([
      folder({ id: "a", parentFolderId: "p" }),
      folder({ id: "child1", parentFolderId: "a" }),
      folder({ id: "child2", parentFolderId: "a" }),
    ]);
    const r = await deleteFolder({ folderId: "a", userId: "u1", mode: "folder_only" });
    expect(r.ok).toBe(true);
    // children promoted to 'p'
    expect(foldersRepo.updateParentAndPosition).toHaveBeenCalledWith("child1", "p", expect.any(Number));
    expect(foldersRepo.updateParentAndPosition).toHaveBeenCalledWith("child2", "p", expect.any(Number));
    // contained workflows promoted to 'p'
    expect(workflowsRepo.reparentWorkflows).toHaveBeenCalledWith("a", "p");
    // only the folder itself is trashed
    expect(foldersRepo.softDelete).toHaveBeenCalledTimes(1);
    expect(foldersRepo.softDelete).toHaveBeenCalledWith(
      expect.objectContaining({ folderId: "a", deletedFromParentFolderId: "p" }),
    );
  });
});

describe("deleteFolder — with_contents", () => {
  it("trashes the whole subtree + contained workflows under ONE delete_operation_id", async () => {
    foldersRepo.getById.mockResolvedValue(folder({ id: "a", parentFolderId: null }));
    foldersRepo.listByAccount.mockResolvedValue([
      folder({ id: "a", parentFolderId: null }),
      folder({ id: "b", parentFolderId: "a" }),
      folder({ id: "c", parentFolderId: "b" }),
    ]);
    workflowsRepo.listByFolderIds.mockResolvedValue([
      workflow({ id: "wf1", folderId: "a" }),
      workflow({ id: "wf2", folderId: "c" }),
    ]);
    const r = await deleteFolder({ folderId: "a", userId: "u1", mode: "with_contents" });
    expect(r.ok).toBe(true);
    const opId = (r as { ok: true; data: { deleteOperationId: string } }).data.deleteOperationId;

    // all three subtree folders trashed with the same op id
    expect(foldersRepo.softDelete).toHaveBeenCalledTimes(3);
    for (const id of ["a", "b", "c"]) {
      expect(foldersRepo.softDelete).toHaveBeenCalledWith(
        expect.objectContaining({ folderId: id, deleteOperationId: opId }),
      );
    }
    // both contained workflows soft-deleted via the orchestrator with the same op id
    expect(orchestrator.delete).toHaveBeenCalledTimes(2);
    for (const id of ["wf1", "wf2"]) {
      expect(orchestrator.delete).toHaveBeenCalledWith(
        id,
        expect.objectContaining({ deleteOperationId: opId }),
      );
    }
    // no promotion happens in with_contents mode
    expect(workflowsRepo.reparentWorkflows).not.toHaveBeenCalled();
  });
});

// ── folder restore (batch) ─────────────────────────────────────────────────────

describe("restoreFolder — batch", () => {
  it("restores the subtree parents-before-children and relocates contained workflows", async () => {
    // batch op 'op' contains a→b→c (deletedFromParent chain) + wf1(in a), wf2(in c)
    foldersRepo.getById.mockResolvedValue(
      folder({ id: "a", deletedAt: "2026-06-03T00:00:00Z", deleteOperationId: "op", deletedFromParentFolderId: null }),
    );
    foldersRepo.listByDeleteOperation.mockResolvedValue([
      folder({ id: "c", deletedAt: "x", deleteOperationId: "op", deletedFromParentFolderId: "b" }),
      folder({ id: "a", deletedAt: "x", deleteOperationId: "op", deletedFromParentFolderId: null }),
      folder({ id: "b", deletedAt: "x", deleteOperationId: "op", deletedFromParentFolderId: "a" }),
    ]);
    workflowsRepo.listByDeleteOperation.mockResolvedValue([
      workflow({ id: "wf1", state: "deleted", deletedFromFolderId: "a", deleteOperationId: "op" }),
      workflow({ id: "wf2", state: "deleted", deletedFromFolderId: "c", deleteOperationId: "op" }),
    ]);
    foldersRepo.listByAccount.mockResolvedValue([]); // none live before restore

    const r = await restoreFolder("a");
    expect(r.ok).toBe(true);

    // Parents before children: a (root) → b (parent a) → c (parent b).
    const order = foldersRepo.restore.mock.calls.map((c: unknown[]) => c[0]);
    expect(order).toEqual(["a", "b", "c"]);
    expect(foldersRepo.restore).toHaveBeenCalledWith("a", null);
    expect(foldersRepo.restore).toHaveBeenCalledWith("b", "a");
    expect(foldersRepo.restore).toHaveBeenCalledWith("c", "b");
    // workflows relocated to their now-live original folders
    expect(orchestrator.restore).toHaveBeenCalledWith("wf1", { folderId: "a" });
    expect(orchestrator.restore).toHaveBeenCalledWith("wf2", { folderId: "c" });
  });

  it("degrades a folder to root when its original parent is not in the batch and not live", async () => {
    foldersRepo.getById.mockResolvedValue(
      folder({ id: "x", deletedAt: "x", deleteOperationId: "op", deletedFromParentFolderId: "gone" }),
    );
    foldersRepo.listByDeleteOperation.mockResolvedValue([
      folder({ id: "x", deletedAt: "x", deleteOperationId: "op", deletedFromParentFolderId: "gone" }),
    ]);
    workflowsRepo.listByDeleteOperation.mockResolvedValue([]);
    foldersRepo.listByAccount.mockResolvedValue([]); // 'gone' is not live

    await restoreFolder("x");
    expect(foldersRepo.restore).toHaveBeenCalledWith("x", null);
  });

  it("returns NOT_TRASHED when the folder is live", async () => {
    foldersRepo.getById.mockResolvedValue(folder({ id: "a", deletedAt: null }));
    const r = await restoreFolder("a");
    expect(r).toMatchObject({ ok: false, code: "NOT_TRASHED" });
  });
});

// ── listing ────────────────────────────────────────────────────────────────────

describe("listTrash", () => {
  it("merges trashed folders + workflows for the account", async () => {
    foldersRepo.listTrashedByAccount.mockResolvedValue([folder({ id: "f", deletedAt: "x" })]);
    workflowsRepo.listTrashedByAccount.mockResolvedValue([workflow({ id: "w", state: "deleted" })]);
    const out = await listTrash(ACCT);
    expect(out.folders).toHaveLength(1);
    expect(out.workflows).toHaveLength(1);
    expect(foldersRepo.listTrashedByAccount).toHaveBeenCalledWith(ACCT);
    expect(workflowsRepo.listTrashedByAccount).toHaveBeenCalledWith(ACCT);
  });
});

describe("orderFoldersForRestore", () => {
  it("orders ancestors before descendants by the deletedFromParentFolderId chain", () => {
    const batch = [
      folder({ id: "c", deletedFromParentFolderId: "b" }),
      folder({ id: "a", deletedFromParentFolderId: null }),
      folder({ id: "b", deletedFromParentFolderId: "a" }),
    ];
    expect(orderFoldersForRestore(batch).map((f) => f.id)).toEqual(["a", "b", "c"]);
  });
});
