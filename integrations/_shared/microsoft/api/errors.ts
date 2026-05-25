/**
 * Microsoft Graph-specific typed errors thrown by API wrappers — shared
 * across every Microsoft provider.
 *
 * `Unauthorized401Error` (for the refreshAndRetry contract) lives in
 * `services/oauth/refreshAndRetry.ts` — wrappers import that one directly.
 * This file holds Graph-shape-specific errors that handlers (not the
 * refresh wrapper) catch.
 *
 * Slice 7: extracted from `integrations/microsoft-outlook/api/errors.ts`
 * so Outlook Calendar + Outlook Mail share one source of truth. Mirrors
 * the `_shared/google/` minimal-extraction principle.
 */

/**
 * Thrown by `getMessage` / `getEvent` / `deleteSubscription` (and future
 * resource-getters) on HTTP 404 — the resource doesn't exist or the user
 * lacks access. Graph commonly returns 404 to avoid leaking existence;
 * both cases surface as NotFoundError so handlers can give the same
 * "we couldn't find that" UX regardless of which sub-cause fired.
 *
 * Mirror shape of Sheets / Drive / Calendar NotFoundError so cross-
 * provider error handling stays consistent.
 */
export class NotFoundError extends Error {
  readonly resource: string;
  constructor(resource: string, detail?: string) {
    super(
      `Microsoft Graph resource '${resource}' not found${detail ? `: ${detail}` : ""}.`,
    );
    this.name = "NotFoundError";
    this.resource = resource;
  }
}

/**
 * Helper used by every Graph wrapper to extract a human-readable error
 * message from a Graph 4xx/5xx response body. Graph's error envelope is
 * always `{ error: { code, message, innerError? } }`.
 */
export interface GraphErrorPayload {
  error?: {
    code?: string;
    message?: string;
    innerError?: Record<string, unknown>;
  };
}

export function surfaceGraphError(text: string, status: number): string {
  let detail = `HTTP ${status}`;
  try {
    const parsed = JSON.parse(text) as GraphErrorPayload;
    if (parsed?.error?.message) detail = parsed.error.message;
    else if (parsed?.error?.code) detail = parsed.error.code;
  } catch {
    // not JSON
  }
  return detail;
}
