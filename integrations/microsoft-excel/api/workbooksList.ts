import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import {
  NotFoundError,
  surfaceGraphError,
} from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

/**
 * Wrapper for Microsoft Graph
 * `GET /v1.0/me/drive/root/children?$filter=file/mimeType eq '<xlsx>'`.
 *
 * Used by:  `microsoft_excel_action_get_workbooks` action.
 *
 * Lists `.xlsx` workbooks under the user's drive root. V1 used a
 * multi-strategy fetch (root + common folders parallel → search →
 * /recent fallback); Slice 15 ships the simplest path — drive root +
 * mime-type filter. Workflow authors who need cross-folder discovery
 * can chain a follow-up `list_items` node from OneDrive.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (drive missing — rare, surfaces clear).
 *   - generic `Error` on other failures with Graph error message surfaced.
 */

export interface WorkbooksListInput {
  accessToken: string;
  /** Graph $top page size (1..1000; default 200). */
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
  url.searchParams.set("$filter", `file/mimeType eq '${XLSX_MIME}'`);
  if (input.top !== undefined) {
    url.searchParams.set("$top", String(input.top));
  }

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
    }>;
    "@odata.nextLink"?: string;
  };
  const workbooks: WorkbookSummary[] = (body.value ?? []).map((v) => ({
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
