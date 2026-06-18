/**
 * @jest-environment node
 *
 * Folder CRUD + hierarchy orchestration (Slice 4.WORKFLOW-FOLDERS-3 / WF-2).
 * Mocks the repos; drives the REAL hierarchy + limit guards. Proves the typed
 * outcomes for every required behavior. Roles are never consulted — the service
 * takes no role argument, so a plain member exercises every path here.
 */

const foldersRepo = {
  listByAccount: jest.fn(),
  getById: jest.fn(),
  create: jest.fn(),
  updateName: jest.fn(),
  updateParentAndPosition: jest.fn(),
  updatePositions: jest.fn(),
};
const workflowsRepo = {
  updateFolder: jest.fn(),
};

jest.mock("@/repositories/workflowFolders", () => foldersRepo);
jest.mock("@/repositories/workflows", () => workflowsRepo);

import {
  createFolder,
  renameFolder,
  moveFolder,
  reorderFolders,
  moveWorkflowToFolder,
  listFolders,
} from "@/services/workflowFolders/folderService";

const ACCT = "acct-1";

function folder(over: {
  id: string;
  name?: string;
  parentFolderId?: string | null;
  position?: number;
  accountId?: string;
  deletedAt?: string | null;
}) {
  return {
    id: over.id,
    accountId: over.accountId ?? ACCT,
    parentFolderId: over.parentFolderId ?? null,
    name: over.name ?? over.id,
    position: over.position ?? 0,
    createdByUserId: "u1",
    createdAt: "2026-06-03T00:00:00Z",
    updatedAt: "2026-06-03T00:00:00Z",
    deletedAt: over.deletedAt ?? null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  foldersRepo.create.mockImplementation(async (input) => folder({ id: "new", ...input }));
  foldersRepo.updateName.mockImplementation(async (id, name) => folder({ id, name }));
  foldersRepo.updateParentAndPosition.mockImplementation(async (id, parentFolderId, position) =>
    folder({ id, parentFolderId, position }),
  );
  foldersRepo.updatePositions.mockResolvedValue(undefined);
  workflowsRepo.updateFolder.mockResolvedValue({ id: "wf", accountId: ACCT });
});

describe("listFolders", () => {
  it("returns the account's live folders (repo is live-only)", async () => {
    foldersRepo.listByAccount.mockResolvedValue([folder({ id: "a" })]);
    const out = await listFolders(ACCT);
    expect(foldersRepo.listByAccount).toHaveBeenCalledWith(ACCT);
    expect(out).toHaveLength(1);
  });
});

describe("createFolder", () => {
  it("succeeds for an account member", async () => {
    foldersRepo.listByAccount.mockResolvedValue([]);
    const r = await createFolder({ accountId: ACCT, folderLimit: 10, userId: "u1", name: "Marketing" });
    expect(r.ok).toBe(true);
    expect(foldersRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: ACCT, name: "Marketing", parentFolderId: null, position: 0 }),
    );
  });

  it("rejects when the tier limit is reached (Free personal = 10)", async () => {
    foldersRepo.listByAccount.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => folder({ id: `f${i}`, name: `f${i}` })),
    );
    const r = await createFolder({ accountId: ACCT, folderLimit: 10, userId: "u1", name: "f10" });
    expect(r).toMatchObject({ ok: false, code: "FOLDER_LIMIT_REACHED" });
    expect(foldersRepo.create).not.toHaveBeenCalled();
  });

  it("a Pro cap (25) allows an 11th folder that the Free cap (10) would reject (PRICING-LOCK)", async () => {
    foldersRepo.listByAccount.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => folder({ id: `f${i}`, name: `f${i}` })),
    );
    const r = await createFolder({ accountId: ACCT, folderLimit: 25, userId: "u1", name: "f10" });
    expect(r.ok).toBe(true);
  });

  it("rejects the 26th folder on the Pro cap (25)", async () => {
    foldersRepo.listByAccount.mockResolvedValue(
      Array.from({ length: 25 }, (_, i) => folder({ id: `f${i}`, name: `f${i}` })),
    );
    const r = await createFolder({ accountId: ACCT, folderLimit: 25, userId: "u1", name: "f25" });
    expect(r).toMatchObject({ ok: false, code: "FOLDER_LIMIT_REACHED" });
  });

  it("an uncapped plan (null cap = Enterprise) allows creation past any tier default", async () => {
    foldersRepo.listByAccount.mockResolvedValue(
      Array.from({ length: 300 }, (_, i) => folder({ id: `f${i}`, name: `f${i}` })),
    );
    const r = await createFolder({ accountId: ACCT, folderLimit: null, userId: "u1", name: "f300" });
    expect(r.ok).toBe(true);
  });

  it("rejects a duplicate live sibling name (case-insensitive)", async () => {
    foldersRepo.listByAccount.mockResolvedValue([folder({ id: "m", name: "Marketing", parentFolderId: null })]);
    const r = await createFolder({ accountId: ACCT, folderLimit: 10, userId: "u1", name: "  marketing " });
    expect(r).toMatchObject({ ok: false, code: "FOLDER_NAME_TAKEN" });
  });

  it("allows the same name under a different parent", async () => {
    foldersRepo.listByAccount.mockResolvedValue([
      folder({ id: "p1", name: "P1", parentFolderId: null }),
      folder({ id: "sub", name: "Sub", parentFolderId: "p1" }),
    ]);
    const r = await createFolder({ accountId: ACCT, folderLimit: 10, userId: "u1", name: "Sub" }); // parent null
    expect(r.ok).toBe(true);
  });

  it("rejects creating below depth 3", async () => {
    // r(1) → a(2) → b(3); creating under b would be depth 4.
    foldersRepo.listByAccount.mockResolvedValue([
      folder({ id: "r", parentFolderId: null }),
      folder({ id: "a", parentFolderId: "r" }),
      folder({ id: "b", parentFolderId: "a" }),
    ]);
    const r = await createFolder({ accountId: ACCT, folderLimit: 10, userId: "u1", name: "x", parentFolderId: "b" });
    expect(r).toMatchObject({ ok: false, code: "FOLDER_TOO_DEEP" });
  });

  it("rejects an unknown / cross-account parent (not in the account's live set)", async () => {
    foldersRepo.listByAccount.mockResolvedValue([]);
    const r = await createFolder({ accountId: ACCT, folderLimit: 10, userId: "u1", name: "x", parentFolderId: "ghost" });
    expect(r).toMatchObject({ ok: false, code: "FOLDER_NOT_FOUND" });
  });
});

describe("renameFolder", () => {
  it("renames and preserves account/parent integrity", async () => {
    foldersRepo.getById.mockResolvedValue(folder({ id: "a", name: "Old", parentFolderId: null }));
    foldersRepo.listByAccount.mockResolvedValue([folder({ id: "a", name: "Old", parentFolderId: null })]);
    const r = await renameFolder({ folderId: "a", name: "New" });
    expect(r.ok).toBe(true);
    expect(foldersRepo.updateName).toHaveBeenCalledWith("a", "New");
  });

  it("non-member (RLS hides the folder) → FOLDER_NOT_FOUND", async () => {
    foldersRepo.getById.mockResolvedValue(null);
    const r = await renameFolder({ folderId: "a", name: "New" });
    expect(r).toMatchObject({ ok: false, code: "FOLDER_NOT_FOUND" });
  });

  it("rejects a duplicate sibling name", async () => {
    foldersRepo.getById.mockResolvedValue(folder({ id: "a", name: "A", parentFolderId: null }));
    foldersRepo.listByAccount.mockResolvedValue([
      folder({ id: "a", name: "A", parentFolderId: null }),
      folder({ id: "b", name: "Taken", parentFolderId: null }),
    ]);
    const r = await renameFolder({ folderId: "a", name: "Taken" });
    expect(r).toMatchObject({ ok: false, code: "FOLDER_NAME_TAKEN" });
  });
});

describe("moveFolder", () => {
  it("rejects a self/descendant cycle", async () => {
    foldersRepo.getById.mockResolvedValue(folder({ id: "r", parentFolderId: null }));
    foldersRepo.listByAccount.mockResolvedValue([
      folder({ id: "r", parentFolderId: null }),
      folder({ id: "c", parentFolderId: "r" }),
    ]);
    const r = await moveFolder({ folderId: "r", newParentFolderId: "c" });
    expect(r).toMatchObject({ ok: false, code: "FOLDER_CYCLE" });
  });

  it("rejects a move that would exceed depth 3", async () => {
    // s(1) → a2(2). Moving r (subtree height 2) under a2 → depth 4.
    foldersRepo.getById.mockResolvedValue(folder({ id: "r", parentFolderId: null }));
    foldersRepo.listByAccount.mockResolvedValue([
      folder({ id: "r", parentFolderId: null }),
      folder({ id: "rc", parentFolderId: "r" }),
      folder({ id: "s", parentFolderId: null }),
      folder({ id: "a2", parentFolderId: "s" }),
    ]);
    const r = await moveFolder({ folderId: "r", newParentFolderId: "a2" });
    expect(r).toMatchObject({ ok: false, code: "FOLDER_TOO_DEEP" });
  });

  it("rejects a cross-account / unknown destination parent (not in live set)", async () => {
    foldersRepo.getById.mockResolvedValue(folder({ id: "a", parentFolderId: null }));
    foldersRepo.listByAccount.mockResolvedValue([folder({ id: "a", parentFolderId: null })]);
    const r = await moveFolder({ folderId: "a", newParentFolderId: "other-acct-folder" });
    expect(r).toMatchObject({ ok: false, code: "FOLDER_NOT_FOUND" });
  });

  it("moves to top level (null parent) successfully", async () => {
    foldersRepo.getById.mockResolvedValue(folder({ id: "a", parentFolderId: "r" }));
    foldersRepo.listByAccount.mockResolvedValue([
      folder({ id: "r", parentFolderId: null }),
      folder({ id: "a", parentFolderId: "r" }),
    ]);
    const r = await moveFolder({ folderId: "a", newParentFolderId: null });
    expect(r.ok).toBe(true);
    expect(foldersRepo.updateParentAndPosition).toHaveBeenCalledWith("a", null, expect.any(Number));
  });
});

describe("reorderFolders", () => {
  it("writes deterministic positions for the full ordered sibling list", async () => {
    foldersRepo.listByAccount.mockResolvedValue([
      folder({ id: "a", parentFolderId: null, position: 0 }),
      folder({ id: "b", parentFolderId: null, position: 1 }),
      folder({ id: "c", parentFolderId: null, position: 2 }),
    ]);
    const r = await reorderFolders({ accountId: ACCT, parentFolderId: null, orderedIds: ["c", "a", "b"] });
    expect(r.ok).toBe(true);
    expect(foldersRepo.updatePositions).toHaveBeenCalledWith([
      { id: "c", position: 0 },
      { id: "a", position: 1 },
      { id: "b", position: 2 },
    ]);
  });

  it("rejects ids that are not live siblings of the parent (no cross-group smuggling)", async () => {
    foldersRepo.listByAccount.mockResolvedValue([folder({ id: "a", parentFolderId: null })]);
    const r = await reorderFolders({ accountId: ACCT, parentFolderId: null, orderedIds: ["a", "x"] });
    expect(r).toMatchObject({ ok: false, code: "FOLDER_NOT_FOUND" });
    expect(foldersRepo.updatePositions).not.toHaveBeenCalled();
  });
});

describe("moveWorkflowToFolder", () => {
  it("moves a workflow into a same-account live folder", async () => {
    foldersRepo.getById.mockResolvedValue(folder({ id: "f", accountId: ACCT }));
    const r = await moveWorkflowToFolder({ accountId: ACCT, workflowId: "wf", folderId: "f" });
    expect(r.ok).toBe(true);
    expect(workflowsRepo.updateFolder).toHaveBeenCalledWith("wf", "f");
  });

  it("uncategorizes a workflow (folderId = null) without a folder lookup", async () => {
    const r = await moveWorkflowToFolder({ accountId: ACCT, workflowId: "wf", folderId: null });
    expect(r.ok).toBe(true);
    expect(foldersRepo.getById).not.toHaveBeenCalled();
    expect(workflowsRepo.updateFolder).toHaveBeenCalledWith("wf", null);
  });

  it("rejects a cross-account folder", async () => {
    foldersRepo.getById.mockResolvedValue(folder({ id: "f", accountId: "other" }));
    const r = await moveWorkflowToFolder({ accountId: ACCT, workflowId: "wf", folderId: "f" });
    expect(r).toMatchObject({ ok: false, code: "FOLDER_CROSS_ACCOUNT" });
    expect(workflowsRepo.updateFolder).not.toHaveBeenCalled();
  });

  it("rejects a trashed folder", async () => {
    foldersRepo.getById.mockResolvedValue(folder({ id: "f", accountId: ACCT, deletedAt: "2026-06-03T00:00:00Z" }));
    const r = await moveWorkflowToFolder({ accountId: ACCT, workflowId: "wf", folderId: "f" });
    expect(r).toMatchObject({ ok: false, code: "FOLDER_TRASHED" });
    expect(workflowsRepo.updateFolder).not.toHaveBeenCalled();
  });

  it("rejects an unknown folder (not visible)", async () => {
    foldersRepo.getById.mockResolvedValue(null);
    const r = await moveWorkflowToFolder({ accountId: ACCT, workflowId: "wf", folderId: "ghost" });
    expect(r).toMatchObject({ ok: false, code: "FOLDER_NOT_FOUND" });
  });
});
