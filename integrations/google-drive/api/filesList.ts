import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { driveApiBase } from "./_base";
import type { DriveFileResource } from "./filesCreate";

/**
 * Wrapper for Google Drive `files.list`.
 *
 * Endpoint: GET {base}/drive/v3/files
 * Used by:  listFiles action handler.
 *
 * Slice 4 Batch 1 surface — V2's narrowed query model:
 *   - Optional `folderId` → builds `q=` with `'<id>' in parents and
 *     trashed=false`. When unset, lists everything (Drive default).
 *   - Optional `pageSize` (default 100, max 1000 per Google).
 *   - Optional `pageToken` for pagination.
 *
 * V1's full Drive query syntax (`q` passthrough, mimeType filters,
 * starred-only, etc.) is deferred. Workflow authors who need complex
 * queries today can post-filter in a downstream node; the action stays
 * deliberately simple for Batch 1.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - generic `Error` on other failures.
 */
export interface FilesListInput {
  accessToken: string;
  /** When set, restricts to direct children of this folder id. */
  folderId?: string;
  /** Default 100. Drive caps at 1000. */
  pageSize?: number;
  pageToken?: string;
  /** Comma-separated `fields` mask. Defaults to a sensible Drive-list shape. */
  fields?: string;
  supportsAllDrives?: boolean;
  /**
   * Whether to include trashed files. Default false — Slice 4 Batch 1
   * doesn't expose trash inspection, and including trashed files would
   * surprise users.
   */
  includeTrashed?: boolean;
}

export interface FilesListResult {
  kind?: string;
  files?: ReadonlyArray<DriveFileResource>;
  nextPageToken?: string;
  incompleteSearch?: boolean;
  [k: string]: unknown;
}

interface DriveErrorPayload {
  error?: { code?: number; message?: string; status?: string };
}

function surfaceErrorDetail(text: string, status: number): string {
  let detail = `HTTP ${status}`;
  try {
    const parsed = JSON.parse(text) as DriveErrorPayload;
    if (parsed?.error?.message) detail = parsed.error.message;
    else if (parsed?.error?.status) detail = parsed.error.status;
  } catch {
    // not JSON
  }
  return detail;
}

export async function filesList(
  input: FilesListInput,
): Promise<FilesListResult> {
  const url = new URL(`${driveApiBase()}/drive/v3/files`);
  url.searchParams.set(
    "fields",
    input.fields ??
      "kind,nextPageToken,incompleteSearch,files(id,name,mimeType,parents,modifiedTime,size,webViewLink,trashed)",
  );
  url.searchParams.set(
    "pageSize",
    String(input.pageSize ?? 100),
  );
  if (input.pageToken) url.searchParams.set("pageToken", input.pageToken);
  url.searchParams.set(
    "supportsAllDrives",
    String(input.supportsAllDrives ?? true),
  );
  url.searchParams.set(
    "includeItemsFromAllDrives",
    String(input.supportsAllDrives ?? true),
  );

  // Build q from the structured inputs. Two clauses we ever set:
  //   - folder filter (`'<id>' in parents`)
  //   - trash filter (`trashed=false` unless includeTrashed)
  const qClauses: string[] = [];
  if (input.folderId) {
    qClauses.push(`'${input.folderId.replace(/'/g, "\\'")}' in parents`);
  }
  if (!input.includeTrashed) qClauses.push("trashed=false");
  if (qClauses.length > 0) {
    url.searchParams.set("q", qClauses.join(" and "));
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Google Drive files.list returned HTTP 401",
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Google Drive files.list failed: ${surfaceErrorDetail(text, res.status)}`,
    );
  }

  return (await res.json()) as FilesListResult;
}
