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
  /**
   * Optional Drive mimeType filter — appends `mimeType='<type>'` to the
   * `q` clause. Slice 3.GDOCS-3 added this so the
   * `google-docs:documents` and `google-drive:folders` options
   * resolvers can share this wrapper instead of duplicating Drive
   * list scaffolding per provider tree.
   *
   * The mimeType is treated as an opaque literal. Drive's `q` syntax
   * uses single-quoted literals; the resolvers ship hard-coded values
   * (`application/vnd.google-apps.document`,
   * `application/vnd.google-apps.folder`) which contain no quotes, so
   * the literal is interpolated without escaping. If a caller ever
   * needs to pass a user-controlled mimeType, that input MUST be
   * validated against the known Google Workspace mime types before
   * reaching this wrapper.
   */
  mimeType?: string;
  /**
   * Optional free-text name filter — appends `name contains '<value>'` to
   * the `q` clause (Slice 4.GDRIVE-READ-2, consumed by the `search_files`
   * action). Drive's `name contains` matches the file title only (NOT file
   * content — that would be `fullText contains`, deliberately not used so
   * search stays predictable and metadata-scoped). Single quotes in the
   * value are escaped the same way as `folderId` so a caller-supplied query
   * cannot break out of the `q` literal.
   */
  nameContains?: string;
  /**
   * Optional Drive `orderBy` query param (Drive v3 syntax —
   * `"modifiedTime desc"`, `"name"`, etc.). Slice 3.GDOCS-3 added this
   * so the options resolvers can sort their single-page results
   * server-side (Docs by recency, Folders alphabetically) rather than
   * resorting client-side.
   */
  orderBy?: string;
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

  // Build q from the structured inputs. Three clauses we ever set:
  //   - folder filter (`'<id>' in parents`)
  //   - trash filter (`trashed=false` unless includeTrashed)
  //   - mimeType filter (`mimeType='<type>'`) — Slice 3.GDOCS-3
  const qClauses: string[] = [];
  if (input.folderId) {
    qClauses.push(`'${input.folderId.replace(/'/g, "\\'")}' in parents`);
  }
  if (!input.includeTrashed) qClauses.push("trashed=false");
  if (input.mimeType) qClauses.push(`mimeType='${input.mimeType}'`);
  if (input.nameContains) {
    qClauses.push(`name contains '${input.nameContains.replace(/'/g, "\\'")}'`);
  }
  if (qClauses.length > 0) {
    url.searchParams.set("q", qClauses.join(" and "));
  }
  if (input.orderBy) {
    url.searchParams.set("orderBy", input.orderBy);
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
