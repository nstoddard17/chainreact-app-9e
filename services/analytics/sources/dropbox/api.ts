import { filesListFolder } from "@/integrations/_shared/dropbox/api/filesListFolder";
import type { DropboxEntry } from "@/integrations/_shared/dropbox/api/_types";

/**
 * Bounded, READ-ONLY, METADATA-ONLY Dropbox folder scanner for the analytics source
 * (Slice ANALYTICS-SOURCES-DROPBOX-1). Reuses the shared `filesListFolder` wrapper
 * (recursive list + cursor pagination, same Bearer auth + 401→Unauthorized401Error
 * mapping as the Dropbox handlers).
 *
 * PRIVACY: each entry is projected to a transient {@link FileFact}
 * `{ isFile, modifiedMs, ext }` — the minimum needed to count files/folders, bucket
 * files by modified time, and group by extension. A file's `name` is read ONLY to
 * derive its lowercase extension (a type category) and is then discarded — the name
 * itself, the path, id, size, content hash, content, previews, and sharing links are
 * never read into a fact, returned, or cached. The facts are transient (one query);
 * the adapter reduces them to numeric aggregates + extension labels, and ONLY those
 * are cached.
 *
 * SAFETY — bounded to prevent an unbounded full-account scan: a HARD page cap
 * ({@link MAX_PAGES} × {@link PAGE_SIZE}). Past the cap we stop and report
 * `truncated: true` rather than walking the whole Dropbox.
 *
 * No raw Dropbox query comes from widget config — the folder path is a validated
 * value (root `""` or a `dropbox:folders` path) and recursion/limit are server-side
 * constants.
 */

export const PAGE_SIZE = 2000; // Dropbox list_folder max page size.
/** ≤ 5 pages = 10000 entries per scan before truncation. */
export const MAX_PAGES = 5;

/** Transient, non-identifying projection of one entry. Never cached/returned to client. */
export interface FileFact {
  /** True for a file entry, false for a folder. */
  isFile: boolean;
  /** server_modified epoch ms (files only; null for folders / unparseable). */
  modifiedMs: number | null;
  /** Lowercase file extension WITHOUT the dot ("" when none). Derived from name, then discarded. */
  ext: string;
}

export interface FolderScanResult {
  facts: FileFact[];
  /** True when there were more entries than the page cap. */
  truncated: boolean;
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

function project(e: DropboxEntry): FileFact {
  const isFile = e[".tag"] === "file";
  return {
    isFile,
    modifiedMs: isFile ? parseMs(e.server_modified) : null,
    ext: isFile ? fileExtension(e.name) : "",
  };
}

/**
 * Recursively list `path` (root = `""`), projecting each entry to a {@link FileFact}.
 * Exact under the cap; `truncated: true` beyond it. Throws `Unauthorized401Error`
 * (→ refreshAndRetry) / `RateLimitError` / `NotFoundError` / `DropboxApiError`; the
 * adapter classifies them.
 */
export async function scanFolder(
  accessToken: string,
  path: string,
  input: { maxPages?: number } = {},
): Promise<FolderScanResult> {
  const maxPages = input.maxPages ?? MAX_PAGES;
  const facts: FileFact[] = [];

  let res = await filesListFolder({ accessToken, path, recursive: true, limit: PAGE_SIZE });
  for (const e of res.entries) facts.push(project(e));
  if (!res.has_more) return { facts, truncated: false };

  for (let page = 1; page < maxPages; page++) {
    res = await filesListFolder({ accessToken, cursor: res.cursor });
    for (const e of res.entries) facts.push(project(e));
    if (!res.has_more) return { facts, truncated: false };
  }

  return { facts, truncated: true };
}
