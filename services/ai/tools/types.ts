/**
 * Shared result + error contract for the AI metadata/context tool layer
 * (Slice 4.AI-2).
 *
 * Plan reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §5.
 *
 * These tools are the deterministic, read-only grounding layer the future
 * React Agent (Slice 4.AI-3+) will call. THIS SLICE SHIPS NO MODEL CALLS,
 * NO PATCH ENGINE, NO UI. Every tool:
 *   - is server-side only (composes services/ + repositories/);
 *   - returns a compact, redacted, deterministic, model-shaped result;
 *   - returns a TYPED error (never null/undefined ambiguity) on failure;
 *   - never returns tokens, secrets, PII, or raw run-data values.
 *
 * The discriminated `AiToolResult<T>` mirrors the V2 options-route
 * convention (`{ ok: true | false }`) so callers branch on `ok` + `code`
 * without guessing.
 */

/**
 * Finite, closed set of failure codes. New codes are added here so every
 * tool caller can exhaustively switch.
 *
 *   - `NOT_FOUND`               — unknown provider / action / trigger /
 *                                 options source / workflow / node, OR a
 *                                 workflow the caller may not see (RLS).
 *                                 Existence is never leaked — "not yours"
 *                                 and "doesn't exist" collapse to NOT_FOUND.
 *   - `INVALID_INPUT`           — malformed argument (e.g. a key with no
 *                                 `provider:type` shape).
 *   - `INTEGRATION_DISCONNECTED`— the resolver/action needs an active
 *                                 integration the caller hasn't connected.
 *   - `MISSING_DEPENDENCY`      — a required cascading `dependsOn` value is
 *                                 absent (carries `missingDependency`).
 *   - `PROVIDER_ERROR`          — a downstream provider call failed
 *                                 (sanitized; no raw body / token).
 *   - `SERVER_ERROR`            — an unexpected internal failure (sanitized).
 *   - `NOT_WORKFLOW_OWNER`      — (Slice 4.ACCOUNT-MODEL-22D-2) a non-creator
 *                                 editor requested options for a PERSONAL
 *                                 provider on a team workflow. Execution runs
 *                                 under the owner's connection (22B); no
 *                                 resolver runs, no resource labels fetched.
 *   - `OWNER_MUST_CONNECT`      — (22D-2) the workflow CREATOR is editing but
 *                                 has no active connection for this PERSONAL
 *                                 provider (mirrors 22B's execution failure).
 */
export type AiToolErrorCode =
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "INTEGRATION_DISCONNECTED"
  | "MISSING_DEPENDENCY"
  | "PROVIDER_ERROR"
  | "SERVER_ERROR"
  | "NOT_WORKFLOW_OWNER"
  | "OWNER_MUST_CONNECT";

export interface AiToolError {
  readonly ok: false;
  readonly code: AiToolErrorCode;
  /** Caller-safe message. MUST NOT contain tokens, secrets, PII, or raw provider bodies. */
  readonly message: string;
  /** Only set when `code === "MISSING_DEPENDENCY"` — names the missing parent field. */
  readonly missingDependency?: string;
}

export interface AiToolSuccess<T> {
  readonly ok: true;
  readonly data: T;
}

export type AiToolResult<T> = AiToolSuccess<T> | AiToolError;

/** Build a success result. */
export function aiToolOk<T>(data: T): AiToolSuccess<T> {
  return { ok: true, data };
}

/** Build a typed error result. */
export function aiToolErr(
  code: AiToolErrorCode,
  message: string,
  extra?: { missingDependency?: string },
): AiToolError {
  return {
    ok: false,
    code,
    message,
    ...(extra?.missingDependency !== undefined
      ? { missingDependency: extra.missingDependency }
      : {}),
  };
}

// ─── Shared caps ─────────────────────────────────────────────────────────────
// The tools are "compact by default" — large catalogs / option lists / variable
// trees are bounded so a single tool result never blows the model's context.

/** Max search-query length forwarded to an options resolver (mirrors the route). */
export const MAX_OPTIONS_QUERY_LENGTH = 256;

/** Max option items a single `resolveOptionsSourceForAI` call returns. */
export const MAX_OPTIONS_ITEMS = 100;

/** Max available-variable entries a single `getAvailableVariablesForAI` call returns. */
export const MAX_AVAILABLE_VARIABLES = 200;

/** Max depth to flatten nested object outputs into dotted variable paths. */
export const MAX_OUTPUT_FLATTEN_DEPTH = 3;
