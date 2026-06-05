/**
 * Unit tests for the pure folder-hierarchy helpers (WF-5 nested-tree pass).
 * No DOM — exercises childrenOf ordering, depth, path, descendants,
 * subtreeHeight, canCreateChildAt (depth-3 cap) and eligibleMoveParents
 * (cycle + depth exclusion).
 */
import type { WorkflowFolder } from "@/contracts/folders";
import {
  MAX_FOLDER_DEPTH,
  canCreateChildAt,
  childrenOf,
  descendantIds,
  eligibleMoveParents,
  flattenForDisplay,
  folderDepth,
  folderPath,
  indexById,
  subfolderCount,
  subtreeHeight,
} from "@/features/workflows/folders/folderTree";

function folder(
  id: string,
  parentFolderId: string | null,
  position = 0,
  name = id,
): WorkflowFolder {
  return {
    id,
    accountId: "acct",
    parentFolderId,
    name,
    position,
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
  };
}

// Tree:  root1 (pos1) ── child1a ── grand1a1
//        root0 (pos0)
const TREE: WorkflowFolder[] = [
  folder("root1", null, 1, "Root One"),
  folder("root0", null, 0, "Root Zero"),
  folder("child1a", "root1", 0, "Child A"),
  folder("grand1a1", "child1a", 0, "Grandchild"),
];

describe("childrenOf", () => {
  it("returns direct children of a parent ordered by position then name", () => {
    expect(childrenOf(TREE, null).map((f) => f.id)).toEqual(["root0", "root1"]);
    expect(childrenOf(TREE, "root1").map((f) => f.id)).toEqual(["child1a"]);
    expect(childrenOf(TREE, "grand1a1")).toEqual([]);
  });

  it("breaks position ties by name", () => {
    const tied = [
      folder("b", null, 0, "Bravo"),
      folder("a", null, 0, "Alpha"),
    ];
    expect(childrenOf(tied, null).map((f) => f.id)).toEqual(["a", "b"]);
  });
});

describe("subfolderCount", () => {
  it("counts direct subfolders", () => {
    expect(subfolderCount(TREE, "root1")).toBe(1);
    expect(subfolderCount(TREE, "child1a")).toBe(1);
    expect(subfolderCount(TREE, "grand1a1")).toBe(0);
  });
});

describe("folderDepth", () => {
  it("treats top-level folders as depth 1 and counts down the chain", () => {
    const byId = indexById(TREE);
    expect(folderDepth("root1", byId)).toBe(1);
    expect(folderDepth("child1a", byId)).toBe(2);
    expect(folderDepth("grand1a1", byId)).toBe(MAX_FOLDER_DEPTH);
  });
});

describe("folderPath", () => {
  it("returns the root→target chain for breadcrumbs", () => {
    const byId = indexById(TREE);
    expect(folderPath("grand1a1", byId).map((f) => f.id)).toEqual([
      "root1",
      "child1a",
      "grand1a1",
    ]);
    expect(folderPath("root1", byId).map((f) => f.id)).toEqual(["root1"]);
  });
});

describe("descendantIds + subtreeHeight", () => {
  it("collects all descendants and measures subtree height", () => {
    expect([...descendantIds("root1", TREE)].sort()).toEqual([
      "child1a",
      "grand1a1",
    ]);
    expect(descendantIds("grand1a1", TREE).size).toBe(0);
    expect(subtreeHeight("root1", TREE)).toBe(3);
    expect(subtreeHeight("child1a", TREE)).toBe(2);
    expect(subtreeHeight("grand1a1", TREE)).toBe(1);
  });
});

describe("canCreateChildAt", () => {
  it("allows creating at root and under shallow folders, blocks at the depth cap", () => {
    const byId = indexById(TREE);
    expect(canCreateChildAt(null, byId)).toBe(true); // new top-level (depth 1)
    expect(canCreateChildAt("root1", byId)).toBe(true); // child would be depth 2
    expect(canCreateChildAt("child1a", byId)).toBe(true); // child would be depth 3
    expect(canCreateChildAt("grand1a1", byId)).toBe(false); // child would be depth 4
  });
});

describe("eligibleMoveParents", () => {
  it("excludes self, descendants, the current parent, and depth-overflow targets", () => {
    const byId = indexById(TREE);
    // Moving child1a (subtree height 2): valid parents must satisfy
    // depth(parent) + 2 <= 3 → only depth-1 folders, excluding root1 (current
    // parent) and itself/descendants. root0 (depth 1) qualifies.
    const forChild = eligibleMoveParents("child1a", TREE, byId).map((f) => f.id);
    expect(forChild).toEqual(["root0"]);

    // Moving a leaf grandchild (height 1): depth(parent)+1<=3 → depth ≤2.
    // Excludes its current parent child1a; root0/root1 (depth 1) qualify, but
    // not grand-depth folders. child1a is the current parent so excluded.
    const forGrand = eligibleMoveParents("grand1a1", TREE, byId)
      .map((f) => f.id)
      .sort();
    expect(forGrand).toEqual(["root0", "root1"]);
  });

  it("never offers a folder its own descendant as a destination (cycle guard)", () => {
    const byId = indexById(TREE);
    const targets = eligibleMoveParents("root1", TREE, byId).map((f) => f.id);
    expect(targets).not.toContain("child1a");
    expect(targets).not.toContain("grand1a1");
    expect(targets).not.toContain("root1");
  });
});

describe("flattenForDisplay", () => {
  it("lists folders in tree order with a 1-based depth for indentation", () => {
    expect(flattenForDisplay(TREE).map((x) => [x.folder.id, x.depth])).toEqual([
      ["root0", 1],
      ["root1", 1],
      ["child1a", 2],
      ["grand1a1", 3],
    ]);
  });
});
