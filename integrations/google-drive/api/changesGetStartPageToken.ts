import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { driveApiBase } from "./_base";

/**
 * Wrapper for Google Drive `changes.getStartPageToken`.
 *
 * Endpoint: GET {base}/drive/v3/changes/startPageToken?supportsAllDrives=true
 * Response: { startPageToken: "<opaque-string>", kind: "drive#startPageToken" }
 *
 * Used by the watch trigger's `activate` (to capture the baseline cursor
 * BEFORE creating the watch — without this, the first push notification
 * arrives and we can't fetch a delta) and by `pull` when re-baselining
 * after a `PageTokenExpiredError`.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - generic `Error` on other failures.
 */
export interface ChangesGetStartPageTokenInput {
  accessToken: string;
  supportsAllDrives?: boolean;
}

export interface ChangesGetStartPageTokenResult {
  kind?: string;
  startPageToken: string;
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

export async function changesGetStartPageToken(
  input: ChangesGetStartPageTokenInput,
): Promise<ChangesGetStartPageTokenResult> {
  const url = new URL(`${driveApiBase()}/drive/v3/changes/startPageToken`);
  url.searchParams.set(
    "supportsAllDrives",
    String(input.supportsAllDrives ?? true),
  );

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Google Drive changes.getStartPageToken returned HTTP 401",
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Google Drive changes.getStartPageToken failed: ${surfaceErrorDetail(text, res.status)}`,
    );
  }

  return (await res.json()) as ChangesGetStartPageTokenResult;
}
