/**
 * Google Docs API errors.
 *
 * `Unauthorized401Error` (for the refreshAndRetry contract) lives in
 * `services/oauth/refreshAndRetry.ts` — wrappers import that one directly.
 * This file holds Docs-shape-specific errors that handlers catch.
 *
 * Mirrors `integrations/google-drive/api/errors.ts` shape — distinct
 * provider, distinct error types, same taxonomy convention.
 */

export class DocsNotFoundError extends Error {
  readonly resource: string;
  constructor(resource: string, detail?: string) {
    super(
      `Google Docs resource '${resource}' not found${detail ? `: ${detail}` : ""}.`,
    );
    this.name = "DocsNotFoundError";
    this.resource = resource;
  }
}

export interface DocsApiErrorPayload {
  error?: { code?: number; message?: string; status?: string };
}

/**
 * Parse a Docs/Drive error envelope into a single user-meaningful
 * string. Falls back to `HTTP <status>` when the body isn't JSON or
 * doesn't carry an `error.message` / `error.status`.
 */
export function surfaceDocsErrorDetail(
  text: string,
  status: number,
): string {
  let detail = `HTTP ${status}`;
  try {
    const parsed = JSON.parse(text) as DocsApiErrorPayload;
    if (parsed?.error?.message) detail = parsed.error.message;
    else if (parsed?.error?.status) detail = parsed.error.status;
  } catch {
    // not JSON — keep HTTP status
  }
  return detail;
}
