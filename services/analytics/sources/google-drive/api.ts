import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { driveApiBase } from "@/integrations/google-drive/api/_base";
import { NotFoundError } from "@/integrations/google-drive/api/errors";

/**
 * Bounded, READ-ONLY, METADATA-ONLY Google Drive reader for the analytics source
 * (Slice ANALYTICS-SOURCES-GDRIVE-1). Completes the file-storage trio after Dropbox
 * and OneDrive, porting the same pattern onto Drive v3 `files.list`.
 *
 * PRIVACY: deliberately does NOT reuse the workflow `filesList` wrapper's default
 * field mask — that returns `name,webViewLink,size,parents,…`. This reader requests
 * a minimal `fields=nextPageToken,files(id,mimeType,modifiedTime,name)` so Drive
 * returns ONLY those fields, and projects each item to a transient {@link FileFact}
 * `{ isFile, modifiedMs, ext }`. The `id` is read ONLY to traverse into subfolders
 * (transient); a file's `name` is read ONLY to derive its lowercase extension (when
 * it is not a Google-native type) and is then discarded. No webViewLink,
 * webContentLink, thumbnailLink, size, parents, owners, permissions, sharing links,
 * description, appProperties, content, or raw payload is ever read into a fact,
 * returned, or cached.
 *
 * SAFETY — bounded recursive traversal to prevent an unbounded drive scan: a HARD cap
 * on the total number of Drive `files.list` calls ({@link MAX_CALLS}). Drive's `q`
 * only supports a direct `'<id>' in parents` child query (no cheap recursive query),
 * so the reader walks the folder tree breadth-first within the call budget and
 * reports `truncated: true` when the budget is exhausted rather than walking the
 * whole drive.
 *
 * No raw Drive `q` comes from widget config — the folder is a validated Drive file id
 * (or the `root` alias) interpolated into the parent clause, and `fields`/`pageSize`/
 * `trashed=false` are server-side constants.
 */

export const PAGE_SIZE = 200; // Drive files.list pageSize; max 1000.
/** ≤ 25 Drive files.list calls per scan before truncation. */
export const MAX_CALLS = 25;

/** Drive's special root-folder alias usable as a `'<id>' in parents` parent. */
const ROOT_ALIAS = "root";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const FIELDS = "nextPageToken,files(id,mimeType,modifiedTime,name)";

/**
 * Google Workspace native MIME types → a short, NON-IDENTIFYING type label for the
 * files-by-type bar. These files carry no file extension in their name, so we surface
 * the document KIND (a category, like "gdoc") instead. This is metadata-only — a type
 * category, never the file name or content.
 */
const GOOGLE_TYPE_LABELS: Readonly<Record<string, string>> = {
  "application/vnd.google-apps.document": "gdoc",
  "application/vnd.google-apps.spreadsheet": "gsheet",
  "application/vnd.google-apps.presentation": "gslides",
  "application/vnd.google-apps.form": "gform",
  "application/vnd.google-apps.drawing": "gdrawing",
  "application/vnd.google-apps.script": "gscript",
  "application/vnd.google-apps.site": "gsite",
  "application/vnd.google-apps.jam": "gjamboard",
  "application/vnd.google-apps.map": "gmymaps",
};

/** Thrown on HTTP 429 so the adapter can map it to RATE_LIMITED. */
export class GoogleDriveRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleDriveRateLimitError";
  }
}

/** Transient, non-identifying projection of one drive item. Never cached/returned to client. */
export interface FileFact {
  /** True for a file, false for a folder. */
  isFile: boolean;
  /** modifiedTime epoch ms (files only; null for folders / unparseable). */
  modifiedMs: number | null;
  /**
   * Lowercase type label for files_by_type ("" when none). For an ordinary file this
   * is the name's extension WITHOUT the dot; for a Google-native file it is the
   * document-kind category (e.g. "gdoc"). Derived transiently, then the name is discarded.
   */
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
  mimeType?: unknown;
  modifiedTime?: unknown;
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

/**
 * Resolve a file's non-identifying type label: Google-native MIME → category label
 * (e.g. "gdoc"); otherwise the name's extension. Reads the name transiently only.
 */
export function fileTypeLabel(mimeType: unknown, name: unknown): string {
  if (typeof mimeType === "string") {
    const label = GOOGLE_TYPE_LABELS[mimeType];
    if (label) return label;
  }
  return fileExtension(name);
}

function surfaceErrorDetail(text: string, status: number): string {
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string; status?: string } };
    if (parsed?.error?.message) return parsed.error.message;
    if (parsed?.error?.status) return parsed.error.status;
  } catch {
    // not JSON
  }
  return `HTTP ${status}`;
}

/** files.list URL for the direct children of `folderId` ("" = drive root). */
function childrenUrl(folderId: string): string {
  const parent = folderId.length === 0 ? ROOT_ALIAS : folderId;
  const url = new URL(`${driveApiBase()}/drive/v3/files`);
  url.searchParams.set("q", `'${parent.replace(/'/g, "\\'")}' in parents and trashed=false`);
  url.searchParams.set("fields", FIELDS);
  url.searchParams.set("pageSize", String(PAGE_SIZE));
  return url.toString();
}

async function fetchPage(
  url: string,
  accessToken: string,
): Promise<{ items: RawItem[]; nextPageToken: string | null }> {
  const res = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 401) {
    throw new Unauthorized401Error("Google Drive files.list returned HTTP 401");
  }
  if (res.status === 429) {
    throw new GoogleDriveRateLimitError("Google Drive files.list rate-limited (HTTP 429)");
  }
  if (res.status === 400 || res.status === 404) {
    const text = await res.text().catch(() => "");
    throw new NotFoundError("drive folder", surfaceErrorDetail(text, res.status));
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google Drive files.list failed: ${surfaceErrorDetail(text, res.status)}`);
  }
  const body = (await res.json()) as { files?: RawItem[]; nextPageToken?: string };
  return {
    items: Array.isArray(body.files) ? body.files : [],
    nextPageToken: typeof body.nextPageToken === "string" ? body.nextPageToken : null,
  };
}

/**
 * Breadth-first traverse the My Drive subtree rooted at `rootFolderId` ("" = drive
 * root), projecting each item to a {@link FileFact}. Bounded by {@link MAX_CALLS}
 * total files.list calls; `truncated: true` when the budget is exhausted. Throws
 * `Unauthorized401Error` (→ refreshAndRetry) / `GoogleDriveRateLimitError` /
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
      const page: { items: RawItem[]; nextPageToken: string | null } = await fetchPage(url, accessToken);
      calls++;
      for (const raw of page.items) {
        const isFolder = raw.mimeType === FOLDER_MIME;
        if (isFolder) {
          facts.push({ isFile: false, modifiedMs: null, ext: "" });
          if (typeof raw.id === "string" && raw.id.length > 0) queue.push(raw.id);
        } else {
          facts.push({
            isFile: true,
            modifiedMs: parseMs(raw.modifiedTime),
            ext: fileTypeLabel(raw.mimeType, raw.name),
          });
        }
      }
      url = page.nextPageToken
        ? (() => {
            const next = new URL(childrenUrl(folderId));
            next.searchParams.set("pageToken", page.nextPageToken!);
            return next.toString();
          })()
        : null;
    }
  }

  return { facts, truncated: false };
}
