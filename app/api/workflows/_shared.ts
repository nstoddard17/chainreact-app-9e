import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { LifecycleError } from "@/core/workflows/lifecycle";
import { redactOutput } from "@/core/security/redactOutput";
import { getActionMeta } from "@/services/discovery/_registry";
import type { WorkflowRecord } from "@/repositories/workflows";
import type { WorkflowRunRecord } from "@/repositories/workflowRuns";
import type {
  WorkflowDetail,
  WorkflowRunDetail,
  WorkflowRunSummary,
  WorkflowSummary,
} from "@/contracts/workflow";
import type { WorkflowNode } from "@/contracts/workflowDefinition";

/**
 * Shared route-layer helpers for /api/workflows.
 *
 * Per project-structure-and-module-boundaries.md §5: route handlers stay
 * thin. This file owns the shape of cross-cutting concerns (auth gate,
 * LifecycleError → HTTP, summary mapping) so each route file is a 5–10 line
 * "validate input → call orchestrator → format response."
 *
 * Underscore-prefixed file: not a route. Importable from sibling route.ts
 * files only.
 */

export interface AuthSuccess {
  ok: true;
  userId: string;
}
export interface AuthFailure {
  ok: false;
  response: NextResponse;
}

export async function requireUser(): Promise<AuthSuccess | AuthFailure> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "unauthenticated" },
        { status: 401 },
      ),
    };
  }
  return { ok: true, userId: user.id };
}

/**
 * LifecycleError → HTTP. Code-stable for client UIs that branch on
 * `code`; status carries the user-actionable distinction (404 vs 409 vs 422).
 */
export function lifecycleErrorResponse(err: LifecycleError): NextResponse {
  const status = LIFECYCLE_HTTP_STATUS[err.code];
  return NextResponse.json(
    {
      error: err.message,
      code: err.code,
      details: err.details,
    },
    { status },
  );
}

const LIFECYCLE_HTTP_STATUS: Readonly<Record<LifecycleError["code"], number>> = {
  WORKFLOW_NOT_FOUND: 404,
  INVALID_TRANSITION: 409,
  LIFECYCLE_CONFLICT: 409,
  MISSING_PRECONDITIONS: 422,
  TRIGGER_REGISTRATION_FAILED: 502,
};

/** Wraps an orchestrator call and converts LifecycleError → JSON response. */
export async function runLifecycle<T>(
  fn: () => Promise<T>,
  toResponse: (result: T) => NextResponse,
): Promise<NextResponse> {
  try {
    const result = await fn();
    return toResponse(result);
  } catch (err) {
    if (err instanceof LifecycleError) {
      return lifecycleErrorResponse(err);
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 },
    );
  }
}

export function toWorkflowSummary(record: WorkflowRecord): WorkflowSummary {
  return {
    id: record.id,
    name: record.name,
    state: record.state,
    disabledReason: record.disabledReason,
    disabledContext: record.disabledContext,
    deletedAt: record.deletedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function toWorkflowDetail(record: WorkflowRecord): WorkflowDetail {
  return {
    ...toWorkflowSummary(record),
    activeRevisionId: record.activeRevisionId,
    draftDefinition: record.draftDefinition,
  };
}

export function toWorkflowRunSummary(
  record: WorkflowRunRecord,
): WorkflowRunSummary {
  return {
    id: record.id,
    workflowId: record.workflowId,
    status: record.status,
    triggerNodeId: record.triggerNodeId,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    errorClassification: record.errorClassification,
  };
}

/**
 * Slice 3.SEC-7 — when the optional `workflowNodes` argument is supplied
 * the serializer redacts `steps[].output` per the action's
 * `OutputMeta.sensitive` flags before returning to the client. The DB
 * row stays unmodified.
 *
 * Calling without `workflowNodes` preserves legacy behavior (no
 * redaction) — call sites that haven't been updated for SEC-7 keep
 * working. The new run-details route ALWAYS supplies the nodes; the
 * legacy summary path (`toWorkflowRunSummary` above) never returns
 * step outputs and so doesn't need this.
 *
 * Edge case — workflow edited since run: if a `step.nodeId` is no
 * longer present in `workflowNodes` (the node was deleted post-run),
 * the redactor sees no meta for that step and returns the output
 * unchanged. This is fail-open at the redactor layer. The trade-off is
 * documented in `core/security/redactOutput.ts` JSDoc. The mitigating
 * factor is RLS: only the workflow owner can edit nodes; only the
 * workflow owner can read the run; a malicious owner has direct DB
 * access to their own data already.
 */
export function toWorkflowRunDetail(
  record: WorkflowRunRecord,
  workflowNodes?: readonly WorkflowNode[],
): WorkflowRunDetail {
  const nodeMetaLookup = buildNodeMetaLookup(workflowNodes);
  return {
    ...toWorkflowRunSummary(record),
    triggerEvent: record.triggerEvent,
    steps: record.steps.map((s) => ({
      nodeId: s.nodeId,
      status: s.status,
      ...(s.output !== undefined
        ? { output: redactStepOutput(s.output, s.nodeId, nodeMetaLookup) }
        : {}),
      ...(s.error !== undefined ? { error: s.error } : {}),
    })),
    fatalError: record.fatalError,
  };
}

/**
 * Build `nodeId → OutputMeta[]` lookup once per detail-response. The
 * map is small (≤ ~50 nodes per workflow) and built only when the
 * route opted into redaction by supplying `workflowNodes`.
 */
function buildNodeMetaLookup(
  workflowNodes: readonly WorkflowNode[] | undefined,
): Map<string, readonly import("@/contracts/actionMeta").OutputMeta[]> {
  const out = new Map<string, readonly import("@/contracts/actionMeta").OutputMeta[]>();
  if (!workflowNodes) return out;
  for (const node of workflowNodes) {
    if (node.kind !== "action") continue;
    if (!node.provider || !node.type) continue;
    const meta = getActionMeta(`${node.provider}:${node.type}`);
    if (!meta) continue;
    out.set(node.id, meta.outputs);
  }
  return out;
}

function redactStepOutput(
  output: Readonly<Record<string, unknown>>,
  nodeId: string,
  nodeMetaLookup: Map<string, readonly import("@/contracts/actionMeta").OutputMeta[]>,
): Record<string, unknown> {
  const outputs = nodeMetaLookup.get(nodeId);
  if (!outputs) return output as Record<string, unknown>;
  // redactOutput preserves the top-level object shape (input is an
  // object → output is an object); the `unknown` return type is for
  // the general nested case. Safe to coerce back here.
  return redactOutput(output, outputs) as Record<string, unknown>;
}

/** Parses request body with the supplied Zod schema; returns a 400 response on failure. */
export async function parseJsonBody<T>(
  request: Request,
  schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: ReadonlyArray<{ message: string; path: ReadonlyArray<string | number> }> } } },
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Request body must be valid JSON." },
        { status: 400 },
      ),
    };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid request body.",
          issues: parsed.error.issues,
        },
        { status: 400 },
      ),
    };
  }
  return { ok: true, data: parsed.data };
}
