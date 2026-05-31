import type { RunListItem } from "@/contracts/workflow";

/**
 * Typed client for `/api/runs` (Slice 4.RUNS-PAGE-1).
 *
 * Per project-structure-and-module-boundaries.md §5: client code calls
 * this module, never `fetch()` directly. The wire shape matches the
 * route handler's `{ runs: RunListItem[] }` envelope; failures surface
 * as `RunApiError` so the `RunsDashboard` can render its retry banner
 * with a friendly message.
 */

export type RunApiErrorCode =
  | "UNAUTHENTICATED"
  | "SERVER_ERROR"
  | "UNKNOWN";

export class RunApiError extends Error {
  readonly code: RunApiErrorCode;
  readonly status: number;
  constructor(message: string, code: RunApiErrorCode, status: number) {
    super(message);
    this.name = "RunApiError";
    this.code = code;
    this.status = status;
  }
}

export interface ListRunsOptions {
  /** Server-default 50; server caps at 200. */
  limit?: number;
}

export async function listRuns(
  opts: ListRunsOptions = {},
): Promise<readonly RunListItem[]> {
  const params = new URLSearchParams();
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  const qs = params.toString();
  const url = `/api/runs${qs ? `?${qs}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { runs: RunListItem[] };
  return body.runs;
}

async function parseError(res: Response): Promise<RunApiError> {
  let message = `Request failed (${res.status})`;
  try {
    const body = (await res.json()) as { error?: string };
    if (typeof body.error === "string" && body.error.length > 0) {
      message = body.error;
    }
  } catch {
    // Non-JSON body — keep the default message.
  }
  if (res.status === 401) {
    return new RunApiError(message, "UNAUTHENTICATED", res.status);
  }
  if (res.status >= 500) {
    return new RunApiError(message, "SERVER_ERROR", res.status);
  }
  return new RunApiError(message, "UNKNOWN", res.status);
}
