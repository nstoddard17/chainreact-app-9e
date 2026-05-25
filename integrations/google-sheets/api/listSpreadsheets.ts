import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

/**
 * Wrapper for Google Drive `files.list` filtered to Google Sheets
 * spreadsheets — Slice 3.GSHEETS-2.
 *
 * Endpoint: GET https://www.googleapis.com/drive/v3/files
 *
 * The Sheets API itself has no "list spreadsheets" endpoint. Spreadsheet
 * enumeration happens via Drive's `files.list` with a mimeType filter.
 * The `google-sheets:spreadsheets` options resolver wraps this helper.
 *
 * Why this lives under `integrations/google-sheets/api/` rather than
 * `integrations/google-drive/api/`:
 *   - The options resolver is owned by the Google Sheets provider tree.
 *     Co-locating the API wrapper keeps the resolver's dependency graph
 *     inside its own tree.
 *   - Cross-tree imports between integration trees are discouraged.
 *     `google-drive/api/filesList.ts` exists but is shaped for the
 *     Drive integration's own use (folder navigation, pagination,
 *     shared-drives surface). This helper is shaped specifically for
 *     spreadsheet enumeration.
 *
 * Scope requirement: `drive.metadata.readonly`. Added to the Google
 * Sheets manifest in this slice. Existing users must reconnect to grant
 * the new scope; the OAuth flow handles consent automatically.
 *
 * `pageSize: 200` matches the Slack channels resolver default; the
 * picker is a single-page UI today, so paginating beyond 200 isn't
 * useful. `hasMore: true` when Drive returns a `nextPageToken` signals
 * to the renderer "refine search to narrow."
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401 (refreshAndRetry contract).
 *   - generic `Error` on other 4xx/5xx with the surfaced Drive error
 *     message — caller sanitizes for user-visible surfaces.
 */

const DRIVE_API_BASE =
  process.env.GOOGLE_DRIVE_API_BASE ?? "https://www.googleapis.com";

const SPREADSHEET_MIME_TYPE = "application/vnd.google-apps.spreadsheet";

export interface ListSpreadsheetsInput {
  accessToken: string;
  /** Default 200. Drive caps at 1000. */
  pageSize?: number;
  /** Optional pagination cursor. v1 of the resolver doesn't plumb this through. */
  pageToken?: string;
}

export interface SpreadsheetSummary {
  id: string;
  name: string;
  /** ISO 8601 timestamp. May be omitted if Drive doesn't return it. */
  modifiedTime?: string;
}

export interface ListSpreadsheetsResult {
  spreadsheets: ReadonlyArray<SpreadsheetSummary>;
  hasMore: boolean;
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

interface RawDriveFile {
  id?: unknown;
  name?: unknown;
  modifiedTime?: unknown;
}

interface RawFilesListResponse {
  files?: ReadonlyArray<RawDriveFile>;
  nextPageToken?: unknown;
}

export async function listSpreadsheets(
  input: ListSpreadsheetsInput,
): Promise<ListSpreadsheetsResult> {
  const url = new URL(`${DRIVE_API_BASE}/drive/v3/files`);
  url.searchParams.set("fields", "files(id,name,modifiedTime),nextPageToken");
  url.searchParams.set(
    "pageSize",
    String(input.pageSize ?? 200),
  );
  if (input.pageToken) url.searchParams.set("pageToken", input.pageToken);
  // Filter: spreadsheet mimeType, not trashed. Drive's `q` syntax uses
  // single-quoted literals; the mimeType string contains no quotes so
  // no escaping is needed.
  url.searchParams.set(
    "q",
    `mimeType='${SPREADSHEET_MIME_TYPE}' and trashed=false`,
  );
  // Order by most-recently-modified so the picker's first page shows
  // the spreadsheets the user is most likely to want.
  url.searchParams.set("orderBy", "modifiedTime desc");

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
      `Google Drive files.list (spreadsheets) failed: ${surfaceErrorDetail(text, res.status)}`,
    );
  }

  const body = (await res.json()) as RawFilesListResponse;
  const rawFiles = Array.isArray(body.files) ? body.files : [];
  const spreadsheets: SpreadsheetSummary[] = [];
  for (const raw of rawFiles) {
    if (typeof raw.id !== "string" || raw.id.length === 0) continue;
    if (typeof raw.name !== "string" || raw.name.length === 0) continue;
    const out: SpreadsheetSummary = { id: raw.id, name: raw.name };
    if (typeof raw.modifiedTime === "string" && raw.modifiedTime.length > 0) {
      out.modifiedTime = raw.modifiedTime;
    }
    spreadsheets.push(out);
  }

  const hasMore =
    typeof body.nextPageToken === "string" && body.nextPageToken.length > 0;

  return { spreadsheets, hasMore };
}
