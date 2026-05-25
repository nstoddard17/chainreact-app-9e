/**
 * GitHub-specific error types + helpers.
 *
 * Slice 14b Commit 3. Mirrors `_shared/shopify/errors.ts` and
 * `_shared/hubspot/errors.ts` shapes — per-provider error classes for
 * the same generic categories so handler-level error mapping stays
 * provider-symmetric.
 *
 *   - `NotFoundError` — thrown by `_request.ts` on HTTP 404. Lets
 *     `create_pull_request` distinguish "the repo itself doesn't
 *     exist" from "the head/base branch is missing", and lets the
 *     `create_branch` flow surface "source branch missing" cleanly.
 *   - `ValidationError` — thrown on HTTP 422 (GitHub's "Validation
 *     Failed" status, returned for things like "branch already
 *     exists", "title can't be blank", etc.). Distinct from generic
 *     5xx so handlers can recover or report differently.
 */

export class NotFoundError extends Error {
  readonly resource: string;
  constructor(resource: string, detail?: string) {
    super(`GitHub ${resource} not found${detail ? `: ${detail}` : ""}.`);
    this.name = "NotFoundError";
    this.resource = resource;
  }
}

export class ValidationError extends Error {
  readonly resource: string;
  constructor(resource: string, detail?: string) {
    super(
      `GitHub ${resource} validation failed${detail ? `: ${detail}` : ""}.`,
    );
    this.name = "ValidationError";
    this.resource = resource;
  }
}

/**
 * Extract a useful error string from a GitHub REST error response.
 * GitHub's REST error envelope is well-defined per docs:
 *
 *   {
 *     "message": "Validation Failed",
 *     "errors": [
 *       { "resource": "Issue", "code": "missing_field", "field": "title" }
 *     ],
 *     "documentation_url": "..."
 *   }
 *
 * Returns the `message` (most useful for UX), augmented with the first
 * `errors[i]` entry if present (e.g. "Validation Failed: missing_field
 * on title"). Falls back to the raw HTTP status on parse failure.
 *
 * Pure — no logging side effects.
 */
export function surfaceGitHubError(text: string, status: number): string {
  if (!text) return `HTTP ${status}`;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return `HTTP ${status}`;
  }
  if (parsed === null || typeof parsed !== "object") {
    return `HTTP ${status}`;
  }
  const obj = parsed as Record<string, unknown>;
  const message = typeof obj.message === "string" ? obj.message : null;
  const errors = obj.errors;

  // If we have an errors[] array, surface the first entry's most useful
  // human-readable detail alongside the top-level message.
  if (Array.isArray(errors) && errors.length > 0) {
    const first = errors[0];
    if (first !== null && typeof first === "object") {
      const e = first as Record<string, unknown>;
      const code = typeof e.code === "string" ? e.code : null;
      const field = typeof e.field === "string" ? e.field : null;
      const detail = typeof e.message === "string" ? e.message : null;

      // Prefer the per-error `message` field when GitHub supplies it
      // (more specific than the code/field combo).
      if (detail) {
        return message ? `${message}: ${detail}` : detail;
      }
      if (code && field) {
        return message ? `${message}: ${code} on ${field}` : `${code} on ${field}`;
      }
      if (code) {
        return message ? `${message}: ${code}` : code;
      }
    }
    // Errors array carries strings directly (rare but seen in some
    // older GitHub error responses).
    if (typeof first === "string") {
      return message ? `${message}: ${first}` : first;
    }
  }

  if (message) return message;
  return `HTTP ${status}`;
}
