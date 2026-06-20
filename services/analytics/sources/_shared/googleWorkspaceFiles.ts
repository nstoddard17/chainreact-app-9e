import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { driveApiBase } from "@/integrations/google-drive/api/_base";

/**
 * Bounded, READ-ONLY, METADATA-ONLY Google Workspace file reader shared by the Google
 * Docs + Google Sheets analytics sources (Slice ANALYTICS-SOURCES-GWORKSPACE-1).
 *
 * Reuses the Google Drive `files.list` metadata pattern, but instead of a folder-subtree
 * BFS (what the google-drive source does) this is a FLAT, MIME-FILTERED scan: it lists
 * all of the user's accessible files of ONE Workspace type
 * (`application/vnd.google-apps.document` for Docs, `…spreadsheet` for Sheets) via
 * `q=mimeType='<mime>' and trashed=false`. That answers "how many Docs/Sheets do I have
 * and when were they created/modified" without ever touching folder structure or file
 * content.
 *
 * PRIVACY: requests the absolute minimum field mask
 * `fields=nextPageToken,files(createdTime,modifiedTime)` — NO file name, id, mimeType,
 * webViewLink, webContentLink, thumbnailLink, owners, permissions, sharing settings,
 * description, appProperties, contentHints, export links, or content. Each file is
 * projected to a transient `{ createdMs, modifiedMs }` fact; nothing identifying is ever
 * returned or cached. Pagination uses Drive's opaque `nextPageToken` (a cursor token,
 * not a file id).
 *
 * SCOPES: google-docs holds `drive` and google-sheets holds `drive.metadata.readonly` —
 * both already granted and both sufficient for a metadata `files.list`. The
 * metadata-readonly scope literally cannot read content. No new scope is requested.
 *
 * SAFETY: bounded by {@link MAX_PAGES} × {@link PAGE_SIZE} flat-list calls; past the cap
 * the scan stops and reports `truncated: true` rather than walking an unbounded drive.
 * The MIME type is a server-side constant (never from widget config); the only `q`
 * clauses are the fixed mimeType + `trashed=false`.
 */

export const PAGE_SIZE = 200; // Drive files.list pageSize; max 1000.
/** ≤ 25 flat files.list calls per scan (≈ 5000 files) before truncation. */
export const MAX_PAGES = 25;

const FIELDS = "nextPageToken,files(createdTime,modifiedTime)";

/** Thrown on HTTP 429 so the adapter can map it to RATE_LIMITED. */
export class GoogleWorkspaceRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleWorkspaceRateLimitError";
  }
}

/** Transient, non-identifying projection of one Workspace file. Never cached/returned. */
export interface WorkspaceFileFact {
  /** createdTime epoch ms (null when absent/unparseable). */
  createdMs: number | null;
  /** modifiedTime epoch ms (null when absent/unparseable). */
  modifiedMs: number | null;
}

export interface WorkspaceScanResult {
  facts: WorkspaceFileFact[];
  /** True when the page budget was exhausted before the list finished. */
  truncated: boolean;
}

interface RawFile {
  createdTime?: unknown;
  modifiedTime?: unknown;
}

function parseMs(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
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

function listUrl(mimeType: string, pageToken: string | null): string {
  const url = new URL(`${driveApiBase()}/drive/v3/files`);
  url.searchParams.set("q", `mimeType='${mimeType}' and trashed=false`);
  url.searchParams.set("fields", FIELDS);
  url.searchParams.set("pageSize", String(PAGE_SIZE));
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  return url.toString();
}

/**
 * Flat-list all accessible files of `mimeType`, projecting each to a
 * {@link WorkspaceFileFact} (`createdMs` / `modifiedMs` only). Bounded by `maxPages`;
 * `truncated: true` when the budget is exhausted. Throws `Unauthorized401Error`
 * (→ refreshAndRetry) / `GoogleWorkspaceRateLimitError` / generic `Error`; the adapter
 * classifies them.
 */
export async function scanWorkspaceFiles(
  accessToken: string,
  mimeType: string,
  input: { maxPages?: number } = {},
): Promise<WorkspaceScanResult> {
  const maxPages = input.maxPages ?? MAX_PAGES;
  const facts: WorkspaceFileFact[] = [];
  let pageToken: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    const res = await fetch(listUrl(mimeType, pageToken), {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 401) {
      throw new Unauthorized401Error("Google Drive files.list returned HTTP 401");
    }
    if (res.status === 429) {
      throw new GoogleWorkspaceRateLimitError("Google Drive files.list rate-limited (HTTP 429)");
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Google Drive files.list failed: ${surfaceErrorDetail(text, res.status)}`);
    }
    const body = (await res.json()) as { files?: RawFile[]; nextPageToken?: string };
    for (const raw of body.files ?? []) {
      facts.push({ createdMs: parseMs(raw.createdTime), modifiedMs: parseMs(raw.modifiedTime) });
    }
    pageToken = typeof body.nextPageToken === "string" ? body.nextPageToken : null;
    if (!pageToken) return { facts, truncated: false };
  }

  return { facts, truncated: true };
}
