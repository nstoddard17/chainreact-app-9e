import type {
  CreateWorkflowRequest,
  DisableWorkflowRequest,
  UpdateWorkflowRequest,
  WorkflowDetail,
  WorkflowListItem,
  WorkflowRunDetail,
  WorkflowRunSummary,
  WorkflowSummary,
} from "@/contracts/workflow";

/**
 * Typed client for the workflows API.
 *
 * Per project-structure-and-module-boundaries.md §5: components and feature
 * hooks call this module, never `fetch()` directly. Errors carry the
 * lifecycle code (when present) so UIs can branch — `WorkflowApiError.code`
 * is one of LifecycleErrorCode plus the literal "BAD_REQUEST" / "HTTP_<status>"
 * for non-lifecycle failures.
 */

export type WorkflowApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHENTICATED"
  | "WORKFLOW_NOT_FOUND"
  | "INVALID_TRANSITION"
  | "MISSING_PRECONDITIONS"
  | "TRIGGER_REGISTRATION_FAILED"
  | "LIFECYCLE_CONFLICT"
  | "ACCOUNT_PENDING_DELETION"
  | "CONFIRMATION_REQUIRED"
  | "SERVER_ERROR"
  | "UNKNOWN";

export class WorkflowApiError extends Error {
  readonly code: WorkflowApiErrorCode;
  readonly status: number;
  constructor(message: string, code: WorkflowApiErrorCode, status: number) {
    super(message);
    this.name = "WorkflowApiError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Slice 3.POSTSEC-5 — descriptor of one action that requires typed
 * confirmation before activation / Run-now can proceed. Mirrors the
 * server-side `ConfirmationRequiredAction` (see
 * `services/workflows/riskConfirmation.ts`), which is intentionally
 * route-safe — no config, no resolved values, no IDs beyond the
 * provider/type/displayName triple + an optional risk description.
 */
export interface WorkflowConfirmationRequiredAction {
  readonly nodeId: string;
  readonly provider: string;
  readonly type: string;
  readonly displayName: string;
  readonly riskDescription?: string;
}

export interface WorkflowConfirmationRequiredDetail {
  /** Always true on a CONFIRMATION_REQUIRED response. */
  readonly requiresConfirmation: true;
  /**
   * The literal phrase the caller must echo verbatim (V1: `"CONFIRM"`).
   * Server-driven — UIs MUST NOT hardcode the phrase.
   */
  readonly confirmationText: string;
  /** Action nodes that flipped the workflow into confirmation-required mode. */
  readonly actions: readonly WorkflowConfirmationRequiredAction[];
}

/**
 * Slice 3.POSTSEC-5 — thrown by `activateWorkflow` / `runNowWorkflow`
 * (and any future SEC-4B-gated endpoint) when the server returns
 * `409 CONFIRMATION_REQUIRED`. Subclasses `WorkflowApiError` so existing
 * `instanceof WorkflowApiError` checks keep working; the `detail` carries
 * the structured payload UIs need to render a typed-confirmation modal.
 *
 * Use the `isConfirmationRequiredError` type guard rather than checking
 * `code === "CONFIRMATION_REQUIRED"` inline — the guard narrows the
 * type so TypeScript surfaces `error.detail` correctly.
 */
export class WorkflowConfirmationRequiredError extends WorkflowApiError {
  readonly detail: WorkflowConfirmationRequiredDetail;
  constructor(
    message: string,
    status: number,
    detail: WorkflowConfirmationRequiredDetail,
  ) {
    super(message, "CONFIRMATION_REQUIRED", status);
    this.name = "WorkflowConfirmationRequiredError";
    this.detail = detail;
  }
}

/**
 * Type guard — narrows a caught error to
 * `WorkflowConfirmationRequiredError` so callers can read `.detail`
 * without an extra cast. Prefer this over `instanceof` checks because
 * the guard ALSO accepts errors whose prototype was lost across module
 * boundaries (Jest mocks / iframe boundaries / serialization round-trips)
 * by falling back to a shape check.
 */
export function isConfirmationRequiredError(
  err: unknown,
): err is WorkflowConfirmationRequiredError {
  if (err instanceof WorkflowConfirmationRequiredError) return true;
  if (!(err instanceof Error)) return false;
  const candidate = err as { code?: unknown; detail?: unknown };
  if (candidate.code !== "CONFIRMATION_REQUIRED") return false;
  const detail = candidate.detail as
    | { requiresConfirmation?: unknown; confirmationText?: unknown; actions?: unknown }
    | undefined;
  if (!detail) return false;
  if (detail.requiresConfirmation !== true) return false;
  if (typeof detail.confirmationText !== "string") return false;
  if (!Array.isArray(detail.actions)) return false;
  return true;
}

interface ServerErrorBody {
  error?: string;
  code?: string;
  // Slice 3.POSTSEC-5 — CONFIRMATION_REQUIRED body shape (sibling fields,
  // not nested under `code`).
  requiresConfirmation?: boolean;
  confirmationText?: string;
  actions?: ReadonlyArray<{
    nodeId?: string;
    provider?: string;
    type?: string;
    displayName?: string;
    riskDescription?: string;
  }>;
}

async function parseError(res: Response): Promise<WorkflowApiError> {
  let body: ServerErrorBody = {};
  try {
    body = (await res.json()) as ServerErrorBody;
  } catch {
    /* not json */
  }
  const message = body.error ?? `Workflow request failed (HTTP ${res.status}).`;

  // Slice 3.POSTSEC-5 — server returns a structured 409 with
  // { error: "CONFIRMATION_REQUIRED", requiresConfirmation, confirmationText, actions }
  // when activation / Run-now is gated by SEC-4B + POSTSEC-3. Surface
  // that as a dedicated error subclass so UI callers can branch to the
  // typed-confirmation modal.
  if (
    body.error === "CONFIRMATION_REQUIRED" &&
    body.requiresConfirmation === true &&
    typeof body.confirmationText === "string" &&
    Array.isArray(body.actions)
  ) {
    const actions: WorkflowConfirmationRequiredAction[] = [];
    for (const raw of body.actions) {
      if (
        raw &&
        typeof raw.nodeId === "string" &&
        typeof raw.provider === "string" &&
        typeof raw.type === "string" &&
        typeof raw.displayName === "string"
      ) {
        const action: WorkflowConfirmationRequiredAction = {
          nodeId: raw.nodeId,
          provider: raw.provider,
          type: raw.type,
          displayName: raw.displayName,
          ...(typeof raw.riskDescription === "string"
            ? { riskDescription: raw.riskDescription }
            : {}),
        };
        actions.push(action);
      }
    }
    return new WorkflowConfirmationRequiredError(message, res.status, {
      requiresConfirmation: true,
      confirmationText: body.confirmationText,
      actions,
    });
  }

  const code = pickCode(body.code, res.status);
  return new WorkflowApiError(message, code, res.status);
}

function pickCode(serverCode: string | undefined, status: number): WorkflowApiErrorCode {
  if (serverCode) {
    switch (serverCode) {
      // Server-supplied lifecycle + account error codes are preserved verbatim so
      // callers can branch on them. ACCOUNT_PENDING_DELETION added V2-READY-24:
      // the server maps AccountFrozenError → 403 with this code (V2-READY-23);
      // without this it collapsed to UNKNOWN. Safe message + status 403 unchanged.
      case "WORKFLOW_NOT_FOUND":
      case "INVALID_TRANSITION":
      case "MISSING_PRECONDITIONS":
      case "TRIGGER_REGISTRATION_FAILED":
      case "LIFECYCLE_CONFLICT":
      case "ACCOUNT_PENDING_DELETION":
        return serverCode;
      default:
        return "UNKNOWN";
    }
  }
  if (status === 400) return "BAD_REQUEST";
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 404) return "WORKFLOW_NOT_FOUND";
  if (status >= 500) return "SERVER_ERROR";
  return "UNKNOWN";
}

async function postJson<TResp>(
  url: string,
  body: unknown,
): Promise<TResp> {
  const res = await fetch(url, {
    method: "POST",
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : null,
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as TResp;
}

async function patchJson<TResp>(url: string, body: unknown): Promise<TResp> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as TResp;
}

// ── operations ──────────────────────────────────────────────────────────────

export async function createWorkflow(
  input: CreateWorkflowRequest,
): Promise<WorkflowSummary> {
  return postJson<WorkflowSummary>("/api/workflows", input);
}

/**
 * Slice 4.WORKFLOWS-PAGE-1 — GET /api/workflows returns enriched list items
 * (provider chips + trigger/action counts + lifetime run aggregates) so the
 * workflows dashboard never has to do per-row detail/runs fetches. The shape
 * is a SUPERSET of WorkflowSummary, so any consumer reading only the summary
 * fields keeps working.
 */
export async function listWorkflows(): Promise<readonly WorkflowListItem[]> {
  const res = await fetch("/api/workflows");
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { workflows: WorkflowListItem[] };
  return body.workflows;
}

export async function getWorkflow(id: string): Promise<WorkflowDetail> {
  const res = await fetch(`/api/workflows/${encodeURIComponent(id)}`);
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as WorkflowDetail;
}

export async function updateWorkflow(
  id: string,
  input: UpdateWorkflowRequest,
): Promise<WorkflowDetail> {
  return patchJson<WorkflowDetail>(
    `/api/workflows/${encodeURIComponent(id)}`,
    input,
  );
}

export interface ListRunsOptions {
  /** Defaults to server-side default (25); server caps at 100. */
  limit?: number;
}

export async function listWorkflowRuns(
  id: string,
  opts: ListRunsOptions = {},
): Promise<readonly WorkflowRunSummary[]> {
  const params = new URLSearchParams();
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  const qs = params.toString();
  const url = `/api/workflows/${encodeURIComponent(id)}/runs${qs ? `?${qs}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { runs: WorkflowRunSummary[] };
  return body.runs;
}

/**
 * Slice 3.8 — fetch the detail of one run for the test-run output preview.
 *
 * Hits `GET /api/workflows/[id]/runs/[runId]`. Surfaces the steps[],
 * triggerEvent, and fatalError that the list endpoint intentionally
 * strips. The builder's RunResultsPanel polls this every 1s while the
 * run is in flight, then stops on terminal status (succeeded / failed)
 * or after a poll-count ceiling.
 *
 * A 404 surfaces as `WorkflowApiError(code: "WORKFLOW_NOT_FOUND")` —
 * the polling layer interprets that as "still enqueueing" for the
 * first few ticks (the engine writes the row only after run completes),
 * and after the ceiling treats it as a hard not-found.
 */
export async function getWorkflowRun(
  workflowId: string,
  runId: string,
): Promise<WorkflowRunDetail> {
  const res = await fetch(
    `/api/workflows/${encodeURIComponent(workflowId)}/runs/${encodeURIComponent(runId)}`,
  );
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as WorkflowRunDetail;
}

/**
 * Slice 3.POSTSEC-5 — typed confirmation payload accepted by `activate` /
 * `run-now` when retrying after a `WorkflowConfirmationRequiredError`.
 * `confirmationText` MUST equal the server-provided `detail.confirmationText`
 * (currently the literal `"CONFIRM"`); the server rejects anything else
 * with another 409.
 */
export interface ConfirmationOptions {
  confirmationText?: string;
}

/**
 * Slice 3.POSTSEC-6 — Run-Now-specific options. Extends `ConfirmationOptions`
 * with the SEC-2 `testMode` flag so the builder's Test-Run UI can opt into
 * the engine's test-mode short-circuit without silently promoting / demoting
 * the user's intent.
 *
 * Semantics:
 *   - `testMode === true`  → wire body includes `testMode: true`. Server
 *     skips external + high-risk handlers; run is marked `isTest: true`,
 *     `triggeredBy: "test"`. SEC-4B confirmation gate is bypassed (SEC-2
 *     already blocks the destructive handlers before they fire).
 *   - `testMode === false` → wire body includes `testMode: false`. Server
 *     executes for real; confirmation gate applies. Distinguishes "user
 *     explicitly chose Live" from "client forgot to set the flag".
 *   - `testMode` omitted → wire body omits the field. Server defaults to
 *     real execution (matches pre-POSTSEC-6 callers — back-compat).
 *
 * The client NEVER coerces between true / false / omitted. Test Run and
 * Live Run are user-driven; the client preserves whichever the panel
 * chose. This is the no-promotion / no-demotion invariant.
 */
export interface RunNowOptions extends ConfirmationOptions {
  testMode?: boolean;
}

export async function activateWorkflow(
  id: string,
  opts: ConfirmationOptions = {},
): Promise<WorkflowSummary> {
  // Send a JSON body only when there's something to send — keeps the
  // pre-POSTSEC-5 call shape (body: undefined) intact for low-risk
  // workflows so existing tests + routes that don't expect any body
  // still see exactly what they did before.
  const body =
    opts.confirmationText !== undefined
      ? { confirmationText: opts.confirmationText }
      : undefined;
  return postJson<WorkflowSummary>(
    `/api/workflows/${encodeURIComponent(id)}/activate`,
    body,
  );
}

export async function pauseWorkflow(id: string): Promise<WorkflowSummary> {
  return postJson<WorkflowSummary>(
    `/api/workflows/${encodeURIComponent(id)}/pause`,
    undefined,
  );
}

export async function resumeWorkflow(id: string): Promise<WorkflowSummary> {
  return postJson<WorkflowSummary>(
    `/api/workflows/${encodeURIComponent(id)}/resume`,
    undefined,
  );
}

export async function disableWorkflow(
  id: string,
  input: DisableWorkflowRequest,
): Promise<WorkflowSummary> {
  return postJson<WorkflowSummary>(
    `/api/workflows/${encodeURIComponent(id)}/disable`,
    input,
  );
}

/**
 * Recover a DISABLED workflow: `disabled -> eligible_to_resume` (the existing
 * `markEligibleToResume` transition). The caller then uses the normal Resume flow to go
 * live, which runs activation preconditions + re-registers triggers off the current draft.
 */
export async function reactivateWorkflow(id: string): Promise<WorkflowSummary> {
  return postJson<WorkflowSummary>(
    `/api/workflows/${encodeURIComponent(id)}/reactivate`,
    undefined,
  );
}

export interface RunNowRequest {
  /** Key/value bag delivered to the workflow as `{{trigger.inputs.*}}`. */
  inputs?: Record<string, unknown>;
}

export interface RunNowResponse {
  runId: string;
  enqueuedAt: string;
}

/**
 * Slice 3.3 — kick off a manual-trigger workflow.
 *
 * Wraps `POST /api/workflows/[id]/run-now`. The server route enforces
 * auth / ownership / state, validates the payload against
 * `ManualTriggerPayloadSchema`, and enqueues the run; it returns
 * 202 Accepted with `{ runId, enqueuedAt }`.
 *
 * The RunNowPanel uses this — and ONLY this — to dispatch. Modal Save
 * stays a pending-edit operation; toolbar Save persists the workflow;
 * Run Now enqueues an execution against the *already-saved* workflow.
 * The three paths must not share a code path.
 */
export async function runNowWorkflow(
  id: string,
  input: RunNowRequest = {},
  opts: RunNowOptions = {},
): Promise<RunNowResponse> {
  // Slice 3.POSTSEC-5 / POSTSEC-6 — envelope-level fields are siblings of
  // `inputs`, not inside it. We add each field conditionally on its
  // option being defined so the wire body stays minimal:
  //   - low-risk Live Run     → `{ inputs }`
  //   - low-risk Test Run     → `{ inputs, testMode: true }`
  //   - destructive Live Run  → first shot `{ inputs }`, retry adds
  //                              `confirmationText` (testMode stays absent
  //                              unless the caller explicitly passed it).
  // Callers control promotion / demotion — the client never injects
  // `testMode` or `confirmationText` on its own.
  const body: {
    inputs: Record<string, unknown>;
    confirmationText?: string;
    testMode?: boolean;
  } = {
    inputs: input.inputs ?? {},
  };
  if (opts.confirmationText !== undefined) {
    body.confirmationText = opts.confirmationText;
  }
  if (opts.testMode !== undefined) {
    body.testMode = opts.testMode;
  }
  return postJson<RunNowResponse>(
    `/api/workflows/${encodeURIComponent(id)}/run-now`,
    body,
  );
}
