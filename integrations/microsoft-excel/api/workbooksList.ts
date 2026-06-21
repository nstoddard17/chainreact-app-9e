import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

/**
 * Wrapper for Microsoft Graph `GET /v1.0/me/drive/root/children`, filtered to
 * `.xlsx` workbooks CLIENT-SIDE.
 *
 * Used by:  `microsoft_excel_action_get_workbooks` action.
 *
 * **Why no `$filter`:** OneDrive does NOT support `$filter` on the
 * `/drive/root/children` collection — Graph rejects
 * `?$filter=file/mimeType eq '…'` with HTTP 400 `notSupported`
 * ("Operation not supported"), so the prior implementation failed on every
 * OneDrive. We instead list the root page (requesting the `file` facet via
 * `$select`) and keep only `.xlsx` items in memory. `top` caps the number of
 * WORKBOOKS returned; the raw root scan is a single generous page (folders /
 * non-xlsx files are dropped, not counted against `top`).
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (drive missing — rare, surfaces clear).
 *   - generic `Error` on other failures with Graph error message surfaced.
 */

/** Generous single-page root scan (OneDrive forbids server-side $filter here). */
const ROOT_SCAN_TOP = 200;

export interface WorkbooksListInput {
  accessToken: string;
  /** Max WORKBOOKS to return after client-side .xlsx filtering (1..1000). */
  top?: number;
}

export interface WorkbookSummary {
  id: string;
  name: string;
  webUrl: string | null;
  size: number | null;
  lastModifiedDateTime: string | null;
}

export interface WorkbooksListResult {
  workbooks: WorkbookSummary[];
  nextLink: string | null;
}

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function workbooksList(
  input: WorkbooksListInput,
): Promise<WorkbooksListResult> {
  const url = new URL(`${graphApiBase()}/v1.0/me/drive/root/children`);
  // Request the `file` facet so we can identify .xlsx items client-side.
  url.searchParams.set("$select", "id,name,file,size,webUrl,lastModifiedDateTime");
  url.searchParams.set("$top", String(ROOT_SCAN_TOP));

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Microsoft Graph me/drive/root/children GET returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      "drive root",
      surfaceGraphError(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Microsoft Graph me/drive/root/children GET failed: ${surfaceGraphError(text, res.status)}`,
    );
  }

  const body = (await res.json()) as {
    value?: Array<{
      id: string;
      name?: string;
      webUrl?: string;
      size?: number;
      lastModifiedDateTime?: string;
      file?: { mimeType?: string };
    }>;
    "@odata.nextLink"?: string;
  };

  // Client-side .xlsx filter (OneDrive forbids the server-side $filter). An item
  // is a workbook when its `file` facet carries the xlsx mime type, or — as a
  // fallback when `$select` omits the facet — its name ends in `.xlsx`. Folders
  // (no `file` facet, no .xlsx name) are dropped.
  const isXlsx = (v: { name?: string; file?: { mimeType?: string } }): boolean =>
    v.file?.mimeType === XLSX_MIME || (v.name ?? "").toLowerCase().endsWith(".xlsx");

  const cap = input.top ?? ROOT_SCAN_TOP;
  const workbooks: WorkbookSummary[] = (body.value ?? [])
    .filter(isXlsx)
    .slice(0, cap)
    .map((v) => ({
      id: v.id,
      name: v.name ?? "",
      webUrl: v.webUrl ?? null,
      size: v.size ?? null,
      lastModifiedDateTime: v.lastModifiedDateTime ?? null,
    }));
  return {
    workbooks,
    nextLink: body["@odata.nextLink"] ?? null,
  };
}
