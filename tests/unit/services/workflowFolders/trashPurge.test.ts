/**
 * @jest-environment node
 *
 * Trash purge service (Slice 4.WORKFLOW-FOLDERS-5 / WF-4). Mocks the service-role
 * repos; proves ordering (workflows first; folders children-before-parents),
 * counts, and idempotency.
 */

const foldersRepo = {
  listPurgeableFoldersServiceRole: jest.fn(),
  hardDeleteFolderServiceRole: jest.fn(),
};
const workflowsTrashRepo = {
  listPurgeableWorkflowIdsServiceRole: jest.fn(),
  hardDeleteWorkflowsServiceRole: jest.fn(),
};

// REACT-AGENT-CONVERSATION-RETENTION-1 — the sweep's drift backstop. Mocked
// here (its own behaviour is covered in the retention suite); these tests care
// only that the purge reports its count and never depends on it succeeding.
const agentThreadsRepo = {
  deleteOrphanedThreadsServiceRole: jest.fn(),
};

jest.mock("@/repositories/workflowFolders", () => foldersRepo);
jest.mock("@/repositories/workflowsTrash", () => workflowsTrashRepo);
jest.mock("@/repositories/builderAgentThreads", () => agentThreadsRepo);

import { purgeDueTrashedItems, orderFoldersForPurge } from "@/services/workflowFolders/trashPurge";

beforeEach(() => {
  jest.clearAllMocks();
  workflowsTrashRepo.listPurgeableWorkflowIdsServiceRole.mockResolvedValue([]);
  workflowsTrashRepo.hardDeleteWorkflowsServiceRole.mockResolvedValue(undefined);
  foldersRepo.listPurgeableFoldersServiceRole.mockResolvedValue([]);
  foldersRepo.hardDeleteFolderServiceRole.mockResolvedValue(undefined);
  agentThreadsRepo.deleteOrphanedThreadsServiceRole.mockResolvedValue({
    scanned: 0,
    threadsDeleted: 0,
  });
});

describe("purgeDueTrashedItems", () => {
  it("deletes expired workflows BEFORE folders (folder_id RESTRICT) and reports counts", async () => {
    const order: string[] = [];
    workflowsTrashRepo.listPurgeableWorkflowIdsServiceRole.mockResolvedValue(["w1", "w2"]);
    workflowsTrashRepo.hardDeleteWorkflowsServiceRole.mockImplementation(async () => {
      order.push("workflows");
    });
    foldersRepo.listPurgeableFoldersServiceRole.mockResolvedValue([
      { id: "f1", parentFolderId: null },
    ]);
    foldersRepo.hardDeleteFolderServiceRole.mockImplementation(async () => {
      order.push("folder");
    });

    const r = await purgeDueTrashedItems();
    expect(r).toEqual({ scanned: 3, workflowsPurged: 2, foldersPurged: 1, orphanThreadsPurged: 0 });
    expect(order[0]).toBe("workflows"); // workflows cleared first
    expect(workflowsTrashRepo.hardDeleteWorkflowsServiceRole).toHaveBeenCalledWith(["w1", "w2"]);
  });

  it("deletes folders deepest-first (children before parents)", async () => {
    foldersRepo.listPurgeableFoldersServiceRole.mockResolvedValue([
      { id: "a", parentFolderId: null },
      { id: "b", parentFolderId: "a" },
      { id: "c", parentFolderId: "b" },
    ]);
    const deleted: string[] = [];
    foldersRepo.hardDeleteFolderServiceRole.mockImplementation(async (id: string) => {
      deleted.push(id);
    });

    await purgeDueTrashedItems();
    // c (leaf) before b before a (root)
    expect(deleted).toEqual(["c", "b", "a"]);
  });

  it("is a no-op when nothing is past the purge window (counts all zero)", async () => {
    const r = await purgeDueTrashedItems();
    expect(r).toEqual({ scanned: 0, workflowsPurged: 0, foldersPurged: 0, orphanThreadsPurged: 0 });
    expect(workflowsTrashRepo.hardDeleteWorkflowsServiceRole).not.toHaveBeenCalled();
    expect(foldersRepo.hardDeleteFolderServiceRole).not.toHaveBeenCalled();
  });

  it("is idempotent — a second sweep over an empty set does nothing", async () => {
    workflowsTrashRepo.listPurgeableWorkflowIdsServiceRole
      .mockResolvedValueOnce(["w1"])
      .mockResolvedValueOnce([]);
    foldersRepo.listPurgeableFoldersServiceRole
      .mockResolvedValueOnce([{ id: "a", parentFolderId: null }])
      .mockResolvedValueOnce([]);

    const first = await purgeDueTrashedItems();
    expect(first).toEqual({ scanned: 2, workflowsPurged: 1, foldersPurged: 1, orphanThreadsPurged: 0 });
    const second = await purgeDueTrashedItems();
    expect(second).toEqual({ scanned: 0, workflowsPurged: 0, foldersPurged: 0, orphanThreadsPurged: 0 });
  });

  it("passes the injected `now` through to the repos (window boundary)", async () => {
    const now = new Date("2026-06-04T00:00:00.000Z");
    await purgeDueTrashedItems(now);
    expect(workflowsTrashRepo.listPurgeableWorkflowIdsServiceRole).toHaveBeenCalledWith(now.toISOString());
    expect(foldersRepo.listPurgeableFoldersServiceRole).toHaveBeenCalledWith(now.toISOString());
  });
});

describe("orderFoldersForPurge", () => {
  it("orders leaves before their parents", () => {
    const ordered = orderFoldersForPurge([
      { id: "a", parentFolderId: null },
      { id: "b", parentFolderId: "a" },
      { id: "c", parentFolderId: "b" },
    ]).map((f) => f.id);
    // each parent appears after its child
    expect(ordered.indexOf("c")).toBeLessThan(ordered.indexOf("b"));
    expect(ordered.indexOf("b")).toBeLessThan(ordered.indexOf("a"));
  });

  it("handles a forest (multiple roots) without dropping any", () => {
    const ordered = orderFoldersForPurge([
      { id: "r1", parentFolderId: null },
      { id: "r2", parentFolderId: null },
      { id: "c1", parentFolderId: "r1" },
    ]);
    expect(ordered).toHaveLength(3);
    expect(ordered.map((f) => f.id).indexOf("c1")).toBeLessThan(
      ordered.map((f) => f.id).indexOf("r1"),
    );
  });
});
