import type {
  LiveTestFailureCode,
  LiveTestSessionStatus,
} from "@/core/workflows/liveTest/liveTestSessionLifecycle";

/**
 * Typed client for the live-test API (WORKFLOW-LIVE-TEST-4).
 *
 * Per project-structure-and-module-boundaries.md §5: components and feature hooks call this
 * module, never `fetch()` directly. Every wire type here mirrors the SAFE server DTOs
 * (services/workflows/liveTest/types.ts + disclosure.ts) — the client sees status, timestamps,
 * disclosure metadata, the safe trigger preview, and typed codes only. The nonce is the one
 * secret: returned once by prepare, echoed once by start, held in component state (never
 * persisted client-side).
 *
 * Error contract: non-2xx responses throw `LiveTestApiError` whose `code` is the server's typed
 * refusal (stale_definition / session_in_progress / trigger_capture_unsupported / …), with
 * `sessionStatus` and provider extras where the server sent them, so the UI can branch to the
 * exact recovery: re-prepare, open validation, cancel-existing, or reconnect.
 */

// ── wire types (mirrors of server DTOs) ──────────────────────────────────────

export interface LiveTestDisclosureEffect {
  readonly nodeId: string;
  readonly provider: string;
  readonly providerLabel: string;
  readonly operation: string;
  readonly stepName: string | null;
  readonly kind: "reads" | "creates" | "sends" | "updates" | "deletes" | "changes";
  readonly destructive: boolean;
  readonly mayBeIrreversible: boolean;
  readonly requiresAttention: boolean;
  readonly riskDescription: string | null;
}

export interface LiveTestDisclosure {
  readonly effects: readonly LiveTestDisclosureEffect[];
  readonly internalSteps: readonly { nodeId: string; operation: string }[];
  readonly statements: readonly string[];
  readonly disclosureDigest: string;
}

export interface LiveTestSessionStatusDto {
  readonly sessionId: string;
  readonly workflowId: string;
  readonly status: LiveTestSessionStatus;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly consentedAt: string | null;
  readonly triggerCapturedAt: string | null;
  readonly triggerPreview: Readonly<Record<string, string | null>> | null;
  readonly workflowRunId: string | null;
  readonly failureCode: LiveTestFailureCode | null;
  readonly failureMessage: string | null;
  readonly canCancel: boolean;
}

export interface PrepareLiveTestResponse {
  readonly sessionId: string;
  /** Server-issued action secret — echo on start, keep in memory only. */
  readonly nonce: string;
  readonly expiresAt: string;
  readonly reused: boolean;
  readonly disclosure: LiveTestDisclosure;
  readonly trigger: { nodeId: string; provider: string; eventType: string };
}

export type LiveTestAdvisory = "usage_limit_reached" | "capture_error";

export interface LiveTestStatusResponse {
  readonly session: LiveTestSessionStatusDto;
  readonly advisory?: LiveTestAdvisory;
}

// ── errors ───────────────────────────────────────────────────────────────────

/** Typed server refusal codes the live-test routes emit. */
export type LiveTestApiErrorCode =
  | "session_not_found"
  | "not_ready"
  | "no_trigger"
  | "integration_unavailable"
  | "trigger_capture_unsupported"
  | "session_in_progress"
  | "invalid_nonce"
  | "stale_definition"
  | "stale_connections"
  | "baseline_failed"
  | "session_expired"
  | "session_cancelled"
  | "execution_already_started"
  | "conflict"
  | "invalid_body"
  | "unauthenticated"
  | "unknown";

export class LiveTestApiError extends Error {
  readonly code: LiveTestApiErrorCode;
  readonly status: number;
  /** For session_in_progress: the occupying session's id, so the UI can offer Cancel. */
  readonly sessionId: string | null;
  /** Session status included on conflict-shaped refusals, when the server sent one. */
  readonly sessionStatus: LiveTestSessionStatus | null;
  /** The provider named by integration_unavailable / trigger_capture_unsupported. */
  readonly provider: string | null;

  constructor(input: {
    message: string;
    code: LiveTestApiErrorCode;
    status: number;
    sessionId?: string | null;
    sessionStatus?: LiveTestSessionStatus | null;
    provider?: string | null;
  }) {
    super(input.message);
    this.name = "LiveTestApiError";
    this.code = input.code;
    this.status = input.status;
    this.sessionId = input.sessionId ?? null;
    this.sessionStatus = input.sessionStatus ?? null;
    this.provider = input.provider ?? null;
  }
}

const KNOWN_CODES: ReadonlySet<string> = new Set<LiveTestApiErrorCode>([
  "session_not_found",
  "not_ready",
  "no_trigger",
  "integration_unavailable",
  "trigger_capture_unsupported",
  "session_in_progress",
  "invalid_nonce",
  "stale_definition",
  "stale_connections",
  "baseline_failed",
  "session_expired",
  "session_cancelled",
  "execution_already_started",
  "conflict",
  "invalid_body",
]);

async function parseError(res: Response): Promise<LiveTestApiError> {
  let body: {
    error?: string;
    code?: string;
    sessionId?: string;
    status?: string;
    provider?: string;
  } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    /* not json */
  }
  const code: LiveTestApiErrorCode =
    body.code && KNOWN_CODES.has(body.code)
      ? (body.code as LiveTestApiErrorCode)
      : res.status === 401
        ? "unauthenticated"
        : res.status === 404
          ? "session_not_found"
          : "unknown";
  return new LiveTestApiError({
    message: body.error ?? `Live test request failed (HTTP ${res.status}).`,
    code,
    status: res.status,
    sessionId: body.sessionId ?? null,
    sessionStatus: (body.status as LiveTestSessionStatus | undefined) ?? null,
    provider: body.provider ?? null,
  });
}

async function requestJson<TResp>(
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<TResp> {
  const res = await fetch(url, init);
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as TResp;
}

// ── operations ───────────────────────────────────────────────────────────────

/** Prepare (or reuse) an awaiting-consent session + its side-effect disclosure. */
export async function prepareLiveTest(
  workflowId: string,
): Promise<PrepareLiveTestResponse> {
  return requestJson<PrepareLiveTestResponse>(
    `/api/workflows/${encodeURIComponent(workflowId)}/live-test`,
    { method: "POST" },
  );
}

/** The EXPLICIT consent action — begins the bounded listening window. */
export async function startLiveTest(
  workflowId: string,
  sessionId: string,
  nonce: string,
): Promise<{ session: LiveTestSessionStatusDto; alreadyListening: boolean }> {
  return requestJson(
    `/api/workflows/${encodeURIComponent(workflowId)}/live-test/${encodeURIComponent(sessionId)}/start`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nonce }),
    },
  );
}

/**
 * Safe status + one server-side advancement tick — polling this IS what drives capture and,
 * once captured, execution authorization (WORKFLOW-LIVE-TEST-4 §2).
 */
export async function getLiveTestStatus(
  workflowId: string,
  sessionId: string,
): Promise<LiveTestStatusResponse> {
  return requestJson<LiveTestStatusResponse>(
    `/api/workflows/${encodeURIComponent(workflowId)}/live-test/${encodeURIComponent(sessionId)}`,
    { method: "GET" },
  );
}

/** Cancel a pre-execution session. Typed 409 once execution has begun. */
export async function cancelLiveTest(
  workflowId: string,
  sessionId: string,
): Promise<{ session: LiveTestSessionStatusDto; alreadyCancelled: boolean }> {
  return requestJson(
    `/api/workflows/${encodeURIComponent(workflowId)}/live-test/${encodeURIComponent(sessionId)}`,
    { method: "DELETE" },
  );
}
