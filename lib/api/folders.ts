import type { WorkflowFolder } from "@/contracts/folders";

/**
 * Typed client for the workflow-folders API (Slice 4.WORKFLOW-FOLDERS-6 / WF-5).
 *
 * Wraps the WF-2/WF-3 routes (/api/folders, /api/folders/[id], …/restore).
 * Components call this module, never fetch() directly
 * (project-structure-and-module-boundaries.md §5). Errors carry the server
 * `code` so the UI can branch (e.g. FOLDER_LIMIT_REACHED → limit messaging).
 */

export type FolderApiErrorCode =
  | "FOLDER_NOT_FOUND"
  | "FOLDER_NAME_TAKEN"
  | "FOLDER_TOO_DEEP"
  | "FOLDER_CYCLE"
  | "FOLDER_LIMIT_REACHED"
  | "FOLDER_CROSS_ACCOUNT"
  | "FOLDER_TRASHED"
  | "BAD_REQUEST"
  | "UNAUTHENTICATED"
  | "SERVER_ERROR"
  | "UNKNOWN";

export class FolderApiError extends Error {
  readonly code: FolderApiErrorCode;
  readonly status: number;
  constructor(message: string, code: FolderApiErrorCode, status: number) {
    super(message);
    this.name = "FolderApiError";
    this.code = code;
    this.status = status;
  }
}

interface ErrBody {
  error?: string;
  code?: string;
}

async function parseError(res: Response): Promise<FolderApiError> {
  let body: ErrBody = {};
  try {
    body = (await res.json()) as ErrBody;
  } catch {
    /* not json */
  }
  const message = body.error ?? `Folder request failed (HTTP ${res.status}).`;
  return new FolderApiError(message, pickCode(body.code, res.status), res.status);
}

function pickCode(code: string | undefined, status: number): FolderApiErrorCode {
  switch (code) {
    case "FOLDER_NOT_FOUND":
    case "FOLDER_NAME_TAKEN":
    case "FOLDER_TOO_DEEP":
    case "FOLDER_CYCLE":
    case "FOLDER_LIMIT_REACHED":
    case "FOLDER_CROSS_ACCOUNT":
    case "FOLDER_TRASHED":
      return code;
    default:
      break;
  }
  if (status === 400) return "BAD_REQUEST";
  if (status === 401) return "UNAUTHENTICATED";
  if (status >= 500) return "SERVER_ERROR";
  return "UNKNOWN";
}

export interface DeleteFolderResult {
  ok: true;
  deleteOperationId: string;
  mode: "folder_only" | "with_contents";
}

export async function listFolders(): Promise<readonly WorkflowFolder[]> {
  const res = await fetch("/api/folders");
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { folders: WorkflowFolder[] };
  return body.folders;
}

export async function createFolder(input: {
  name: string;
  parentFolderId?: string | null;
}): Promise<WorkflowFolder> {
  const res = await fetch("/api/folders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as WorkflowFolder;
}

export async function updateFolder(
  id: string,
  input: { name?: string; parentFolderId?: string | null },
): Promise<WorkflowFolder> {
  const res = await fetch(`/api/folders/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as WorkflowFolder;
}

export async function reorderFolders(input: {
  parentFolderId: string | null;
  orderedIds: readonly string[];
}): Promise<void> {
  const res = await fetch("/api/folders", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await parseError(res);
}

export async function deleteFolder(
  id: string,
  mode: "folder_only" | "with_contents",
): Promise<DeleteFolderResult> {
  const res = await fetch(
    `/api/folders/${encodeURIComponent(id)}?mode=${mode}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as DeleteFolderResult;
}

export async function restoreFolder(
  id: string,
): Promise<{ ok: true; deleteOperationId: string | null; restoredFolders: number; restoredWorkflows: number }> {
  const res = await fetch(`/api/folders/${encodeURIComponent(id)}/restore`, {
    method: "POST",
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as {
    ok: true;
    deleteOperationId: string | null;
    restoredFolders: number;
    restoredWorkflows: number;
  };
}
