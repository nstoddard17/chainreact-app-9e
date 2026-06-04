/**
 * Pure folder-hierarchy helpers (Slice 4.WORKFLOW-FOLDERS-3 / WF-2).
 *
 * Adjacency-list model (workflow_folders.parent_folder_id). At max depth 3 a
 * bounded in-memory walk over the account's live folders is the simplest correct
 * model — no recursive CTE needed for these checks (the plan reserves the CTE for
 * the WF-3 delete-with-contents subtree selection). Every function is pure: it
 * operates on a `Map<id, FolderNode>` the service builds once per request.
 */

export interface FolderNode {
  id: string;
  parentFolderId: string | null;
}

/** Depth of a folder, counting from 1 at the root. Cycles are guarded against. */
export function depthOf(folderId: string, byId: ReadonlyMap<string, FolderNode>): number {
  let depth = 1;
  let current = byId.get(folderId);
  const seen = new Set<string>([folderId]);
  while (current?.parentFolderId != null) {
    const parentId = current.parentFolderId;
    if (seen.has(parentId)) break; // defensive: never loop on corrupt data
    seen.add(parentId);
    depth += 1;
    current = byId.get(parentId);
    if (!current) break; // parent outside the set (shouldn't happen for same-account live data)
  }
  return depth;
}

/** Depth a NEW child would have under `parentId` (null parent → top level = 1). */
export function depthForChildOf(
  parentId: string | null,
  byId: ReadonlyMap<string, FolderNode>,
): number {
  if (parentId == null) return 1;
  return depthOf(parentId, byId) + 1;
}

/** The set of every descendant id of `folderId` (excludes the folder itself). */
export function descendantIds(
  folderId: string,
  byId: ReadonlyMap<string, FolderNode>,
): Set<string> {
  // Build a children index once, then BFS.
  const childrenByParent = new Map<string, string[]>();
  for (const node of byId.values()) {
    if (node.parentFolderId == null) continue;
    const list = childrenByParent.get(node.parentFolderId) ?? [];
    list.push(node.id);
    childrenByParent.set(node.parentFolderId, list);
  }
  const out = new Set<string>();
  const queue = [...(childrenByParent.get(folderId) ?? [])];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (out.has(id)) continue; // defensive against cycles
    out.add(id);
    for (const child of childrenByParent.get(id) ?? []) queue.push(child);
  }
  return out;
}

/** Height of a folder's subtree (the folder alone = 1). */
export function subtreeHeight(
  folderId: string,
  byId: ReadonlyMap<string, FolderNode>,
): number {
  const baseDepth = depthOf(folderId, byId);
  let maxDepth = baseDepth;
  for (const id of descendantIds(folderId, byId)) {
    const d = depthOf(id, byId);
    if (d > maxDepth) maxDepth = d;
  }
  return maxDepth - baseDepth + 1;
}

/**
 * Would moving `folderId` under `newParentId` create a cycle? True when the new
 * parent IS the folder or one of its descendants. (A null parent → top level →
 * never a cycle.)
 */
export function moveCreatesCycle(
  folderId: string,
  newParentId: string | null,
  byId: ReadonlyMap<string, FolderNode>,
): boolean {
  if (newParentId == null) return false;
  if (newParentId === folderId) return true;
  return descendantIds(folderId, byId).has(newParentId);
}

/**
 * Deepest depth that results from moving `folderId` (with its whole subtree)
 * under `newParentId`. Compare against MAX_FOLDER_DEPTH.
 */
export function resultingDepthAfterMove(
  folderId: string,
  newParentId: string | null,
  byId: ReadonlyMap<string, FolderNode>,
): number {
  const parentDepth = newParentId == null ? 0 : depthOf(newParentId, byId);
  return parentDepth + subtreeHeight(folderId, byId);
}
