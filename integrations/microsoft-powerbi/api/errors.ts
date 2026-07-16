/**
 * Power BI-specific typed errors + error-surface helper.
 *
 * `Unauthorized401Error` (the refreshAndRetry contract) lives in
 * `services/oauth/refreshAndRetry.ts` — wrappers import that one directly.
 * This file mirrors `_shared/microsoft/api/errors.ts` for the Power BI
 * error envelope (`{ error: { code, message } }`, occasionally nested
 * `pbi.error` detail objects). Messages surfaced here are sanitized —
 * never the raw response body, never tokens.
 */

/**
 * Thrown by wrappers on HTTP 404 when the caller identified the resource
 * (`notFoundResource` in `powerbiFetch`). Power BI returns 404 both for
 * missing resources and for resources the user cannot access — both
 * surface as NotFoundError so handlers/options give the same UX.
 * Shape mirrors the Graph/Sheets NotFoundError for cross-provider
 * consistency (options resolvers map it to an empty picker).
 */
export class NotFoundError extends Error {
  readonly resource: string;
  constructor(resource: string, detail?: string) {
    super(
      `Power BI resource '${resource}' not found${detail ? `: ${detail}` : ""}.`,
    );
    this.name = "NotFoundError";
    this.resource = resource;
  }
}

export interface PowerBiErrorPayload {
  error?: {
    code?: string;
    message?: string;
    ["pbi.error"]?: {
      code?: string;
      details?: Array<{ detail?: { value?: string } }>;
    };
  };
}

/**
 * Extract a human-readable, token-free error string from a Power BI
 * 4xx/5xx body. Falls back to `HTTP <status>` when the body isn't the
 * canonical envelope.
 */
export function surfacePowerBiError(text: string, status: number): string {
  let detail = `HTTP ${status}`;
  try {
    const parsed = JSON.parse(text) as PowerBiErrorPayload;
    if (parsed?.error?.message) detail = parsed.error.message;
    else if (parsed?.error?.["pbi.error"]?.code)
      detail = parsed.error["pbi.error"].code!;
    else if (parsed?.error?.code) detail = parsed.error.code;
  } catch {
    // not JSON
  }
  return detail;
}
