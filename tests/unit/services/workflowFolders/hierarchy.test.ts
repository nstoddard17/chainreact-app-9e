/**
 * @jest-environment node
 *
 * Pure hierarchy helpers (Slice 4.WORKFLOW-FOLDERS-3 / WF-2).
 */

import {
  depthOf,
  depthForChildOf,
  descendantIds,
  subtreeHeight,
  moveCreatesCycle,
  resultingDepthAfterMove,
  type FolderNode,
} from "@/services/workflowFolders/hierarchy";

// Tree:  root(r) → a → b ;  root has sibling s ; standalone top-level t
function tree(): Map<string, FolderNode> {
  return new Map<string, FolderNode>([
    ["r", { id: "r", parentFolderId: null }],
    ["a", { id: "a", parentFolderId: "r" }],
    ["b", { id: "b", parentFolderId: "a" }],
    ["s", { id: "s", parentFolderId: null }],
    ["t", { id: "t", parentFolderId: null }],
  ]);
}

describe("depthOf", () => {
  it("counts from 1 at the root", () => {
    const m = tree();
    expect(depthOf("r", m)).toBe(1);
    expect(depthOf("a", m)).toBe(2);
    expect(depthOf("b", m)).toBe(3);
  });
});

describe("depthForChildOf", () => {
  it("null parent → 1 (top level)", () => {
    expect(depthForChildOf(null, tree())).toBe(1);
  });
  it("child of a depth-2 folder → 3", () => {
    expect(depthForChildOf("a", tree())).toBe(3);
  });
  it("child of a depth-3 folder → 4 (would exceed max)", () => {
    expect(depthForChildOf("b", tree())).toBe(4);
  });
});

describe("descendantIds", () => {
  it("returns all transitive children, excluding self", () => {
    expect([...descendantIds("r", tree())].sort()).toEqual(["a", "b"]);
    expect([...descendantIds("a", tree())]).toEqual(["b"]);
    expect([...descendantIds("b", tree())]).toEqual([]);
  });
});

describe("subtreeHeight", () => {
  it("a leaf is height 1; a 3-level chain root is height 3", () => {
    expect(subtreeHeight("b", tree())).toBe(1);
    expect(subtreeHeight("a", tree())).toBe(2);
    expect(subtreeHeight("r", tree())).toBe(3);
  });
});

describe("moveCreatesCycle", () => {
  it("moving to null never cycles", () => {
    expect(moveCreatesCycle("r", null, tree())).toBe(false);
  });
  it("moving into self is a cycle", () => {
    expect(moveCreatesCycle("r", "r", tree())).toBe(true);
  });
  it("moving into a descendant is a cycle", () => {
    expect(moveCreatesCycle("r", "a", tree())).toBe(true);
    expect(moveCreatesCycle("r", "b", tree())).toBe(true);
  });
  it("moving into an unrelated folder is fine", () => {
    expect(moveCreatesCycle("a", "s", tree())).toBe(false);
  });
});

describe("resultingDepthAfterMove", () => {
  it("moving leaf 't' under 'a' (depth 2) → depth 3", () => {
    expect(resultingDepthAfterMove("t", "a", tree())).toBe(3);
  });
  it("moving the 'a→b' subtree (height 2) under 's' (depth 1) → deepest depth 3", () => {
    expect(resultingDepthAfterMove("a", "s", tree())).toBe(3);
  });
  it("moving 'a→b' under 'b'... is a cycle case but depth math still bounded by parent depth", () => {
    // 'r' subtree height 3 under top level (parent depth 0) → 3
    expect(resultingDepthAfterMove("r", null, tree())).toBe(3);
  });
  it("moving a 2-level subtree under a depth-2 folder → depth 4 (exceeds max)", () => {
    // move 'a' (height 2) under another depth-2 folder. Build a fresh node:
    const m = tree();
    m.set("a2", { id: "a2", parentFolderId: "s" }); // s(1) → a2(2)
    expect(resultingDepthAfterMove("a", "a2", m)).toBe(4);
  });
});
