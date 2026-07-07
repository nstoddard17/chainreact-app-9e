import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { driveApiBase } from "./_base";
import { PageTokenExpiredError } from "./errors";
import type { DriveFileResource } from "./filesCreate";

/**
 * Wrapper for Google Drive `changes.list`.
 *
 * Endpoint: GET {base}/drive/v3/changes?pageToken=<token>
 * Response: { kind, changes: [...], newStartPageToken?, nextPageToken? }
 *
 * Drive's response semantics:
 *   - `nextPageToken` present → MORE pages available; pass it back as
 *     `pageToken` to fetch the next page.
 *   - `newStartPageToken` present → terminal page reached; persist this
 *     as the next baseline cursor and stop paginating.
 *
 * Each `changes[]` entry has shape:
 *   {
 *     kind: "drive#change",
 *     changeType: "file" | "drive",
 *     time: ISO 8601 timestamp,
 *     removed: boolean,
 *     fileId: string,
 *     file?: DriveFileResource (omitted when removed),
 *     ...
 *   }
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `PageTokenExpiredError` on HTTP 410 — caller re-baselines via
 *     `changes.getStartPageToken`.
 *   - generic `Error` on other failures.
 */
export interface ChangesListInput {
  accessToken: string;
  pageToken: string;
  pageSize?: number;
  /** Defaults to a Drive-list shape Slice 4 normalize.ts consumes. */
  fields?: string;
  supportsAllDrives?: boolean;
  /**
   * Whether to include items removed via direct delete or trashing. Default
   * true so the trigger emits `removed` change events; workflow authors who
   * don't want them filter downstream.
   */
  includeRemoved?: boolean;
  /**
   * Spaces to inspect. Drive default is "drive"; "appDataFolder" is a
   * separate space we don't watch. Caller can override if a future feature
   * needs it.
   */
  spaces?: string;
}

export interface DriveChangeEntry {
  kind?: string;
  changeType?: "file" | "drive";
  time?: string;
  removed?: boolean;
  fileId?: string;
  file?: DriveFileResource;
  [k: string]: unknown;
}

export interface ChangesListResult {
  kind?: string;
  changes?: ReadonlyArray<DriveChangeEntry>;
  /** When present, more pages exist for the same starting cursor. */
  nextPageToken?: string;
  /** When present, this is the new baseline; pageToken sequence is done. */
  newStartPageToken?: string;
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

export async function changesList(
  input: ChangesListInput,
): Promise<ChangesListResult> {
  const url = new URL(`${driveApiBase()}/drive/v3/changes`);
  url.searchParams.set("pageToken", input.pageToken);
  url.searchParams.set("pageSize", String(input.pageSize ?? 100));
  url.searchParams.set(
    "supportsAllDrives",
    String(input.supportsAllDrives ?? true),
  );
  url.searchParams.set(
    "includeItemsFromAllDrives",
    String(input.supportsAllDrives ?? true),
  );
  url.searchParams.set(
    "includeRemoved",
    String(input.includeRemoved ?? true),
  );
  if (input.spaces) url.searchParams.set("spaces", input.spaces);
  url.searchParams.set(
    "fields",
    // createdTime must ride along: fileChanged's classifyChangeKind detects
    // "created" via createdTime === modifiedTime; omitting it made the
    // created branch unreachable (every insert classified as "updated").
    input.fields ??
      "kind,nextPageToken,newStartPageToken,changes(kind,changeType,time,removed,fileId,file(id,name,mimeType,parents,createdTime,modifiedTime,trashed,webViewLink))",
  );

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Google Drive changes.list returned HTTP 401",
    );
  }
  if (res.status === 410) {
    // Page token expired — caller re-baselines.
    throw new PageTokenExpiredError();
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Google Drive changes.list failed: ${surfaceErrorDetail(text, res.status)}`,
    );
  }

  return (await res.json()) as ChangesListResult;
}
