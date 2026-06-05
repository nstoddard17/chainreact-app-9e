import type { WorkflowFolder } from "@/contracts/folders";

/**
 * Pure client-side folder-hierarchy helpers (Slice 4.WORKFLOW-FOLDERS-6 / WF-5
 * nested-tree pass).
 *
 * The WF-1..WF-4 backend already supports depth-3 nesting (create-with-parent,
 * reparent, per-sibling reorder, FOLDER_TOO_DEEP/FOLDER_CYCLE guards); the
 * original WF-5 dashboard rendered folders flat. These helpers let the dashboard
 * drill into subfolders, build breadcrumbs, gate "New folder"/move by depth, and
 * exclude cycle targets — all client-side from the live folder list. The server
 * remains the source of truth and re-validates every mutation; this is UX gating
 * only.
 *
 * Depth convention mirrors services/workflowFolders/folderLimits.ts: a top-level
 * folder is depth 1, so the deepest allowed folder (root → child → grandchild)
 * is depth 3.
 */
export const MAX_FOLDER_DEPTH = 3;

export type FolderId = string | null;

/** Index folders by id for O(1) parent walks. */
export function indexById(
  folders: readonly WorkflowFolder[],
): ReadonlyMap<string, WorkflowFolder> {
  return new Map(folders.map((f) => [f.id, f]));
}

/** Direct children of `parentId` (null = root), ordered by position then name. */
export function childrenOf(
  folders: readonly WorkflowFolder[],
  parentId: FolderId,
): WorkflowFolder[] {
  return folders
    .filter((f) => (f.parentFolderId ?? null) === parentId)
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

/** Number of direct subfolders under `parentId`. */
export function subfolderCount(
  folders: readonly WorkflowFolder[],
  parentId: FolderId,
): number {
  return folders.filter((f) => (f.parentFolderId ?? null) === parentId).length;
}

/** Depth of a folder (top-level = 1). Cycle-safe. */
export function folderDepth(
  id: string,
  byId: ReadonlyMap<string, WorkflowFolder>,
): number {
  let depth = 0;
  let cur: FolderId = id;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    depth++;
    cur = byId.get(cur)?.parentFolderId ?? null;
  }
  return depth;
}

/** Root → target chain (inclusive) for breadcrumbs. Cycle-safe. */
export function folderPath(
  id: string,
  byId: ReadonlyMap<string, WorkflowFolder>,
): WorkflowFolder[] {
  const out: WorkflowFolder[] = [];
  let cur: FolderId = id;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const f = byId.get(cur);
    if (!f) break;
    out.unshift(f);
    cur = f.parentFolderId ?? null;
  }
  return out;
}

/** Ids of every descendant of `id` (excludes `id` itself). */
export function descendantIds(
  id: string,
  folders: readonly WorkflowFolder[],
): Set<string> {
  const out = new Set<string>();
  const stack = [id];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const f of folders) {
      if ((f.parentFolderId ?? null) === cur && !out.has(f.id)) {
        out.add(f.id);
        stack.push(f.id);
      }
    }
  }
  return out;
}

/** Levels in the subtree rooted at `id`, including `id` (leaf = 1). */
export function subtreeHeight(
  id: string,
  folders: readonly WorkflowFolder[],
): number {
  const kids = folders.filter((f) => (f.parentFolderId ?? null) === id);
  if (kids.length === 0) return 1;
  return 1 + Math.max(...kids.map((k) => subtreeHeight(k.id, folders)));
}

/**
 * Can a new (empty) child folder be created under `parentId`? Root is always
 * allowed; otherwise the child's depth (parentDepth + 1) must not exceed the cap.
 */
export function canCreateChildAt(
  parentId: FolderId,
  byId: ReadonlyMap<string, WorkflowFolder>,
): boolean {
  if (parentId === null) return true;
  return folderDepth(parentId, byId) + 1 <= MAX_FOLDER_DEPTH;
}

/**
 * Folders that `folderId` (with its whole subtree) may be reparented INTO without
 * creating a cycle or exceeding the depth cap. Excludes the folder itself, its
 * descendants, and its current parent (a no-op move). The "Top level" target is
 * handled separately by the caller (always valid unless already at root).
 */
export function eligibleMoveParents(
  folderId: string,
  folders: readonly WorkflowFolder[],
  byId: ReadonlyMap<string, WorkflowFolder>,
): WorkflowFolder[] {
  const blocked = descendantIds(folderId, folders);
  blocked.add(folderId);
  const currentParent = byId.get(folderId)?.parentFolderId ?? null;
  const height = subtreeHeight(folderId, folders);
  return folders.filter((p) => {
    if (blocked.has(p.id)) return false;
    if (p.id === currentParent) return false;
    return folderDepth(p.id, byId) + height <= MAX_FOLDER_DEPTH;
  });
}

export interface FlatFolder {
  folder: WorkflowFolder;
  depth: number; // top-level = 1
}

/**
 * Folders flattened in tree order (parents before children, siblings by
 * position/name) with a depth for indentation. Used by the filters panel so its
 * folder facet reflects the hierarchy.
 */
export function flattenForDisplay(
  folders: readonly WorkflowFolder[],
): FlatFolder[] {
  const out: FlatFolder[] = [];
  const walk = (parentId: FolderId, depth: number) => {
    for (const f of childrenOf(folders, parentId)) {
      out.push({ folder: f, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 1);
  return out;
}
