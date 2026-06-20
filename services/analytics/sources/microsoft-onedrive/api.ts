import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import { NotFoundError, surfaceGraphError } from "@/integrations/_shared/microsoft/api/errors";

/**
 * Bounded, READ-ONLY, METADATA-ONLY OneDrive (Microsoft Graph) reader for the
 * analytics source (Slice ANALYTICS-SOURCES-ONEDRIVE-1).
 *
 * PRIVACY: deliberately does NOT reuse the workflow `driveItemsList` wrapper — that
 * fetches the full DriveItem (name, webUrl, size, createdBy, …). This reader requests
 * `$select=id,folder,file,lastModifiedDateTime,name` so Graph returns ONLY those
 * fields, and projects each item to a transient {@link FileFact}
 * `{ isFile, modifiedMs, ext }`. The `id` is read ONLY to traverse into subfolders
 * (transient); a file's `name` is read ONLY to derive its lowercase extension and is
 * then discarded. No webUrl, downloadUrl, thumbnails, createdBy, lastModifiedBy,
 * permissions, sharing links, content, size, path, or raw payload is ever read into a
 * fact, returned, or cached.
 *
 * SAFETY — bounded recursive traversal to prevent an unbounded drive scan: a HARD cap
 * on the total number of Graph `children` list calls ({@link MAX_CALLS}). Graph lists
 * one folder level per call (no cheap recursive query), so the reader walks the
 * folder tree breadth-first within the call budget and reports `truncated: true` when
 * the budget is exhausted rather than walking the whole drive.
 *
 * No raw Graph query comes from widget config — the folder is a validated DriveItem id
 * (or root) and `$select`/`$top` are server-side constants.
 */

export const PAGE_SIZE = 200; // Graph $top default; max 1000.
/** ≤ 25 Graph children-list calls per scan before truncation. */
export const MAX_CALLS = 25;

const SELECT = "id,folder,file,lastModifiedDateTime,name";

/** Thrown on HTTP 429 so the adapter can map it to RATE_LIMITED. */
export class OneDriveRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OneDriveRateLimitError";
  }
}

/** Transient, non-identifying projection of one drive item. Never cached/returned to client. */
export interface FileFact {
  /** True for a file, false for a folder. */
  isFile: boolean;
  /** lastModifiedDateTime epoch ms (files only; null for folders / unparseable). */
  modifiedMs: number | null;
  /** Lowercase file extension WITHOUT the dot ("" when none). Derived from name, then discarded. */
  ext: string;
}

export interface DriveScanResult {
  facts: FileFact[];
  /** True when the call budget was exhausted before the tree finished. */
  truncated: boolean;
}

interface RawItem {
  id?: unknown;
  name?: unknown;
  folder?: unknown;
  file?: unknown;
  lastModifiedDateTime?: unknown;
}

function parseMs(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/** Lowercase extension (no dot) of a file name, or "" when there is none. */
export function fileExtension(name: unknown): string {
  if (typeof name !== "string") return "";
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return ""; // no ext, or leading-dot/dotfile
  return name.slice(dot + 1).toLowerCase();
}

/** Initial children URL for a folder ("" = drive root). */
function childrenUrl(folderId: string): string {
  const base = graphApiBase();
  const path =
    folderId.length === 0
      ? "/v1.0/me/drive/root/children"
      : `/v1.0/me/drive/items/${encodeURIComponent(folderId)}/children`;
  const url = new URL(`${base}${path}`);
  url.searchParams.set("$select", SELECT);
  url.searchParams.set("$top", String(PAGE_SIZE));
  return url.toString();
}

async function fetchPage(
  url: string,
  accessToken: string,
): Promise<{ items: RawItem[]; nextLink: string | null }> {
  const res = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 401) {
    throw new Unauthorized401Error("Microsoft Graph me/drive children GET returned HTTP 401");
  }
  if (res.status === 429) {
    throw new OneDriveRateLimitError("Microsoft Graph me/drive children GET rate-limited (HTTP 429)");
  }
  if (res.status === 404) {
    const text = await res.text().catch(() => "");
    throw new NotFoundError("drive folder", surfaceGraphError(text, 404));
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Microsoft Graph me/drive children GET failed: ${surfaceGraphError(text, res.status)}`);
  }
  const body = (await res.json()) as { value?: RawItem[]; "@odata.nextLink"?: string };
  return { items: Array.isArray(body.value) ? body.value : [], nextLink: body["@odata.nextLink"] ?? null };
}

/**
 * Breadth-first traverse the drive subtree rooted at `rootFolderId` ("" = drive root),
 * projecting each item to a {@link FileFact}. Bounded by {@link MAX_CALLS} total
 * children-list calls; `truncated: true` when the budget is exhausted. Throws
 * `Unauthorized401Error` (→ refreshAndRetry) / `OneDriveRateLimitError` /
 * `NotFoundError` / generic `Error`; the adapter classifies them.
 */
export async function scanDrive(
  accessToken: string,
  rootFolderId: string,
  input: { maxCalls?: number } = {},
): Promise<DriveScanResult> {
  const maxCalls = input.maxCalls ?? MAX_CALLS;
  const facts: FileFact[] = [];
  const queue: string[] = [rootFolderId];
  let calls = 0;

  while (queue.length > 0) {
    const folderId = queue.shift()!;
    let url: string | null = childrenUrl(folderId);
    while (url) {
      if (calls >= maxCalls) return { facts, truncated: true };
      const page: { items: RawItem[]; nextLink: string | null } = await fetchPage(url, accessToken);
      calls++;
      for (const raw of page.items) {
        const isFolder = raw.folder !== undefined && raw.folder !== null;
        const isFile = raw.file !== undefined && raw.file !== null;
        if (isFolder) {
          facts.push({ isFile: false, modifiedMs: null, ext: "" });
          if (typeof raw.id === "string" && raw.id.length > 0) queue.push(raw.id);
        } else if (isFile) {
          facts.push({ isFile: true, modifiedMs: parseMs(raw.lastModifiedDateTime), ext: fileExtension(raw.name) });
        }
      }
      url = page.nextLink;
    }
  }

  return { facts, truncated: false };
}
