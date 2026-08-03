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

/* ────────────────────────────────────────────────────────────────────────────
 * Workbook conflicts (EXCEL-UPDATE-ROW-CONCURRENCY-4)
 * ──────────────────────────────────────────────────────────────────────────*/

/**
 * The diagnostic fields worth keeping from a Graph error body.
 *
 * `surfaceGraphError` above reads only the TOP-LEVEL code, which is where the
 * generic HTTP-shaped code lives (`conflict`, `badRequest`). Microsoft puts
 * the code that actually says what happened one level DOWN, and instructs
 * clients to read it first:
 *
 *   "the client should first parse required second-level error codes and
 *    handle them according to the instructions. Optionally, the client can
 *    also handle other second-level error codes, or choose to fall back to
 *    top-level error codes or status codes."
 *   — https://learn.microsoft.com/en-us/graph/workbook-error-handling
 *
 * `innerError` may nest recursively, so the walk descends until it runs out
 * of levels, keeping the DEEPEST code it finds — that is the most specific
 * statement of the cause.
 *
 * The two identifiers are Graph's own correlation ids, documented on the same
 * page inside `innerError`. They are opaque request handles, not customer
 * data, and they are what Microsoft support asks for.
 */
export interface GraphErrorDetail {
  /** `error.code` — generally the HTTP-shaped code. */
  readonly code: string | undefined;
  /** The deepest `innerError.code` — the specific cause. */
  readonly innerCode: string | undefined;
  readonly requestId: string | undefined;
  readonly clientRequestId: string | undefined;
}

interface RawInnerError {
  code?: unknown;
  innerError?: unknown;
  "request-id"?: unknown;
  "client-request-id"?: unknown;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Parse a Graph error body into its diagnostic fields. Never throws: a
 * non-JSON body, an empty body or a body with no error envelope all answer
 * an all-`undefined` detail, so callers can classify on status alone.
 */
export function parseGraphErrorDetail(text: string): GraphErrorDetail {
  let parsed: GraphErrorPayload | undefined;
  try {
    parsed = JSON.parse(text) as GraphErrorPayload;
  } catch {
    return {
      code: undefined,
      innerCode: undefined,
      requestId: undefined,
      clientRequestId: undefined,
    };
  }

  const top = parsed?.error;
  let innerCode: string | undefined;
  let requestId: string | undefined;
  let clientRequestId: string | undefined;

  // Descend the innerError chain. `depth` is a cycle/runaway guard — the body
  // is attacker-adjacent input from a remote service, and a self-referential
  // object would otherwise spin forever.
  let current: unknown = top?.innerError;
  for (let depth = 0; depth < 8 && current !== null && typeof current === "object"; depth++) {
    const level = current as RawInnerError;
    innerCode = readString(level.code) ?? innerCode;
    requestId = readString(level["request-id"]) ?? requestId;
    clientRequestId = readString(level["client-request-id"]) ?? clientRequestId;
    current = level.innerError;
  }

  return {
    code: readString(top?.code),
    innerCode,
    requestId,
    clientRequestId,
  };
}

/**
 * Second-level codes Microsoft documents as CONFLICTS on the workbook.
 *
 * Deliberately an explicit list of documented codes rather than a substring
 * match on "conflict": a broad match would sweep in codes Microsoft adds
 * later with different handling instructions, and the whole point of this
 * classification is that it tells the user *not to retry*. An unrecognized
 * code must keep falling through to the generic path.
 *
 * Required codes (the client is expected to handle these):
 *   - `accessConflict` — "conflicts with other clients accessing the workbook
 *     (for example, another client has locked the workbook for edit)"
 *   - `conflictUncategorized` — "conflicts with certain server state"
 *   - `invalidSessionAccessConflict` — session invalidated by such a conflict
 *
 * Optional codes (documented examples):
 *   - `insertDeleteConflict` — "The insert or delete operation attempted
 *     resulted in a conflict."
 *   - `filteredRangeConflict` — "conflicts with a filtered range"
 *
 * All five carry the same instruction: do not resend until the conflict is
 * resolved. Source:
 * https://learn.microsoft.com/en-us/graph/workbook-error-handling
 *
 * Compared case-INSENSITIVELY, because that page states "The error codes are
 * case insensitive."
 */
const WORKBOOK_CONFLICT_CODES: ReadonlySet<string> = new Set([
  "accessconflict",
  "conflictuncategorized",
  "invalidsessionaccessconflict",
  "insertdeleteconflict",
  "filteredrangeconflict",
]);

/**
 * Thrown when Microsoft Graph refused a workbook operation because the
 * workbook is contended — most often because a person has it open for
 * editing in Excel.
 *
 * A first-class error because its correct next step is unlike every other
 * failure's: not reconnect, not fix the configuration, and specifically NOT
 * an automatic retry. Microsoft's instruction for every code in
 * `WORKBOOK_CONFLICT_CODES` is that the client "is not expected to resend the
 * failed request until the conflict is resolved", and a resend loop against a
 * locked workbook is exactly the behavior that earns throttling.
 *
 * `name` is set explicitly and must stay stable: `classifyHandlerError` maps
 * on `err.name` rather than `instanceof` to avoid an import cycle back into
 * `services/execution`.
 *
 * Nothing on this class carries workbook content. The codes are Graph's own
 * enum values and the ids are opaque correlation handles.
 */
export class WorkbookConflictError extends Error {
  readonly httpStatus: number;
  readonly graphCode: string | undefined;
  readonly graphInnerCode: string | undefined;
  readonly requestId: string | undefined;
  readonly clientRequestId: string | undefined;

  constructor(input: {
    readonly operation: string;
    readonly httpStatus: number;
    readonly detail: GraphErrorDetail;
  }) {
    super(
      `Microsoft Graph ${input.operation} refused: the workbook is in use by another client (HTTP ${input.httpStatus}${
        input.detail.innerCode ? `, ${input.detail.innerCode}` : ""
      }).`,
    );
    this.name = "WorkbookConflictError";
    this.httpStatus = input.httpStatus;
    this.graphCode = input.detail.code;
    this.graphInnerCode = input.detail.innerCode;
    this.requestId = input.detail.requestId;
    this.clientRequestId = input.detail.clientRequestId;
  }
}

/**
 * Decide whether a failed Graph response is a workbook conflict.
 *
 * The order matters, and it is the order Microsoft prescribes:
 *
 *   1. A documented conflict code in the body → conflict, whatever the status.
 *   2. A second-level code that is present but NOT a conflict code → NOT a
 *      conflict, even on 409. This is the case the brief calls out: a 409 is
 *      not automatically this failure, and classifying it as one would tell
 *      the user to wait for an edit that was never happening.
 *   3. No second-level code at all, and the status is 409 or 412 → conflict.
 *      The status is the only evidence available, and both of those statuses
 *      mean contention by definition.
 *   4. Anything else → not a conflict; the caller's existing handling stands.
 */
export function isWorkbookConflict(
  httpStatus: number,
  detail: GraphErrorDetail,
): boolean {
  const inner = detail.innerCode?.toLowerCase();
  if (inner !== undefined) return WORKBOOK_CONFLICT_CODES.has(inner);

  const top = detail.code?.toLowerCase();
  if (top !== undefined && WORKBOOK_CONFLICT_CODES.has(top)) return true;

  return httpStatus === 409 || httpStatus === 412;
}

/**
 * Throw `WorkbookConflictError` when a failed response is a workbook
 * conflict; otherwise return so the caller can apply its own handling.
 *
 * Shared by every Excel wrapper on a contended path so the classification —
 * and therefore the run-history message — cannot drift between the read and
 * the write.
 */
export function throwIfWorkbookConflict(input: {
  readonly operation: string;
  readonly httpStatus: number;
  readonly body: string;
}): void {
  const detail = parseGraphErrorDetail(input.body);
  if (!isWorkbookConflict(input.httpStatus, detail)) return;
  throw new WorkbookConflictError({
    operation: input.operation,
    httpStatus: input.httpStatus,
    detail,
  });
}
