/**
 * Pure humanizer for WorkflowPatch validation errors
 * (Slice 4.PROVIDER-CATALOG-INTEGRITY-1).
 *
 * The deterministic validator ([services/workflows/patch/checks.ts]) emits
 * technically-worded, backend-flavored messages — e.g.
 *   `'gmail:new_email' is not a registered trigger. The agent cannot use a
 *    trigger that V2 does not expose.`
 * That copy is fine for dev diagnostics but must NOT be the main text a normal
 * user sees: no raw provider/type keys, no "registered", no "V2".
 *
 * This maps the user-facing failure codes to friendly copy, returning both the
 * `message` to show and a `devDetail` (the raw message, which may carry the raw
 * key) for logs / dev surfaces. Codes we don't humanize pass through unchanged.
 *
 * Lives in core/ (zero I/O, no registry import) so the AI preview/apply
 * surfaces can humanize without coupling to services. Callers that can resolve
 * a friendly node label pass it as `ctx.subject` (e.g. `Gmail 'New Email'`);
 * otherwise a generic message is used.
 */

export interface HumanizedPatchError {
  /** Friendly, user-facing message. Never contains raw keys or "V2". */
  readonly message: string;
  /** Raw underlying message (may include the raw provider:type key) — dev only. */
  readonly devDetail: string;
}

export interface PatchErrorLike {
  readonly code: string;
  readonly message: string;
}

export interface HumanizePatchErrorContext {
  /**
   * Friendly subject for the failing node, e.g. `Gmail 'New Email'`. When
   * present it's woven into UNKNOWN_TRIGGER / UNKNOWN_ACTION copy; otherwise a
   * generic message is used. NEVER pass a raw `provider:type` key here.
   */
  readonly subject?: string;
}

export function humanizePatchError(
  error: PatchErrorLike,
  ctx: HumanizePatchErrorContext = {},
): HumanizedPatchError {
  const devDetail = error.message;
  const subject = ctx.subject?.trim();

  switch (error.code) {
    case "UNKNOWN_TRIGGER":
      return {
        message: subject
          ? `${subject} isn't available as a trigger yet. The agent can only use triggers the system currently supports.`
          : "This trigger isn't available yet. The agent can only use triggers the system currently supports.",
        devDetail,
      };
    case "UNKNOWN_ACTION":
      return {
        message: subject
          ? `${subject} isn't available as an action yet. The agent can only use actions the system currently supports.`
          : "This action isn't available yet. The agent can only use actions the system currently supports.",
        devDetail,
      };
    case "UNKNOWN_NODE":
      return {
        message:
          "The plan tried to update a node that's no longer in this workflow. Please try again.",
        devDetail,
      };
    default:
      return { message: error.message, devDetail };
  }
}
