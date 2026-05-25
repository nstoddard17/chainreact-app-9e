import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { driveApiBase } from "./_base";
import { NotFoundError } from "./errors";

/**
 * Wrapper for Google Drive `files.export`.
 *
 * Endpoint: GET {base}/drive/v3/files/{fileId}/export
 *           ?mimeType=<target-mime-type>
 * Response: raw file bytes (Content-Type matches the requested
 *           mimeType). Drive returns 200 with the exported file body.
 *
 * Used by `google-docs:export_document` action. The Google Docs Doc
 * itself is a Google-Workspace mimeType (`application/vnd.google-apps.document`)
 * that cannot be downloaded as-is — `files.export` does the conversion
 * to PDF / DOCX / TXT / HTML / RTF / EPUB / ODT on the Drive side.
 *
 * Returns the raw bytes plus the Content-Type Drive responded with —
 * the caller (action handler) stages them to V2 storage via
 * `stageFileToStorage` and returns a `FileRef(kind=v2_storage)` to the
 * downstream workflow.
 *
 * Drive's documented 10 MB cap on `files.export` is a service-side
 * constraint we surface as the failure path — for documents that
 * exceed it, Drive returns a 403 with a clear message. V2 doesn't
 * pre-check size (`documents.get` doesn't expose a size estimate for
 * Google Docs); we surface Drive's failure verbatim.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (file doesn't exist / no access).
 *   - generic `Error` on other failures (including 403 for size limit).
 */
export interface FilesExportInput {
  accessToken: string;
  fileId: string;
  /**
   * Target MIME type. Docs valid values:
   *   - `application/pdf`                               (PDF)
   *   - `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (DOCX)
   *   - `text/plain`                                    (TXT)
   *   - `text/html`                                     (HTML)
   *   - `application/rtf`                               (RTF)
   *   - `application/epub+zip`                          (EPUB)
   *   - `application/vnd.oasis.opendocument.text`       (ODT)
   */
  mimeType: string;
}

export interface FilesExportResult {
  /** Raw exported bytes. */
  bytes: Uint8Array;
  /** Content-Type Drive responded with (echoes requested mimeType). */
  contentType: string;
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
    // not JSON — keep HTTP status.
  }
  return detail;
}

export async function filesExport(
  input: FilesExportInput,
): Promise<FilesExportResult> {
  const url = new URL(
    `${driveApiBase()}/drive/v3/files/${encodeURIComponent(input.fileId)}/export`,
  );
  url.searchParams.set("mimeType", input.mimeType);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Google Drive files.export returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      `file ${input.fileId}`,
      surfaceErrorDetail(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Google Drive files.export failed: ${surfaceErrorDetail(text, res.status)}`,
    );
  }

  const buf = await res.arrayBuffer();
  return {
    bytes: new Uint8Array(buf),
    contentType: res.headers.get("content-type") ?? input.mimeType,
  };
}
