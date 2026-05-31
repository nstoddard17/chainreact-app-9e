import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { resolveActiveAccount } from "@/services/accounts/activeAccount";
import { LifecycleError } from "@/core/workflows/lifecycle";
import { redactOutput } from "@/core/security/redactOutput";
import { getActionMeta } from "@/services/discovery/_registry";
import { getProvider, providerIconUrl } from "@/integrations/_registry";
import { summarizeDefinition } from "@/core/workflows/definitionSummary";
import { emptyRunStats } from "@/repositories/workflowRunStats";
import type { WorkflowRecord } from "@/repositories/workflows";
import type { WorkflowRunRecord } from "@/repositories/workflowRuns";
import type {
  WorkflowDetail,
  WorkflowListItem,
  WorkflowProviderChip,
  WorkflowRunStats,
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

export interface AuthWithAccountSuccess {
  ok: true;
  userId: string;
  /** The caller's owning account (their personal account until the switcher ships). */
  accountId: string;
}

/**
 * 4.ACCOUNT-MODEL-7 — auth gate that also resolves the caller's owning
 * account. Workflows are account-owned, so any route that creates, lists, or
 * authorizes against a workflow resolves the account ONCE here at route entry
 * (per the cutover plan: account resolution at the route, not in repositories)
 * and threads `accountId` downstream.
 *
 * 4.ACCOUNT-MODEL-11c — account selection now delegates to the active-account
 * resolver (`resolveActiveAccount`), the single chokepoint defined by the
 * account-switcher plan. Precedence: explicit account id → stored
 * `active_account_id` → personal-account fallback. Launch behavior is unchanged:
 * existing callers pass NO `explicitAccountId`, every user has a single personal
 * account with `active_account_id = NULL`, so the resolver returns the personal
 * account exactly as `ensurePersonalAccount` did before. The optional
 * `explicitAccountId` is the forward-compatible seam for Phase D (account-scoped
 * URLs); no route passes it today.
 *
 * Failure mapping (both 403, preserving the pre-11c freeze shape):
 *   - `account_frozen` → 403 `ACCOUNT_PENDING_DELETION` (10b freeze behavior —
 *     a pending_deletion account is non-operational; the owner can still read
 *     the account row to drive cancel).
 *   - `not_member` → 403 `NOT_ACCOUNT_MEMBER` (an explicit account the caller
 *     does not belong to NEVER silently downgrades to the personal account).
 */
export async function requireUserWithAccount(
  explicitAccountId?: string | null,
): Promise<AuthWithAccountSuccess | AuthFailure> {
  const auth = await requireUser();
  if (!auth.ok) return auth;

  const resolved = await resolveActiveAccount(auth.userId, { explicitAccountId });
  if (!resolved.ok) {
    if (resolved.reason === "account_frozen") {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: "This account is pending deletion.",
            code: "ACCOUNT_PENDING_DELETION",
          },
          { status: 403 },
        ),
      };
    }
    // not_member — explicit account the caller is not a member of.
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "You are not a member of this account.",
          code: "NOT_ACCOUNT_MEMBER",
        },
        { status: 403 },
      ),
    };
  }

  return { ok: true, userId: auth.userId, accountId: resolved.accountId };
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
  toResponse: (result: T) => NextResponse | Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    const result = await fn();
    // `toResponse` is permitted to be async — POSTSEC-8 uses this so
    // the activate route can emit a high-risk audit event in-band
    // before the HTTP response returns. Sync callers continue to work
    // because `await` on a non-thenable resolves to the value itself.
    return await toResponse(result);
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

/**
 * Slice 4.WORKFLOWS-PAGE-1 — enriched list item for the workflows dashboard.
 *
 * Derives provider chips + trigger/action counts from the draft definition
 * (via `summarizeDefinition`, which reads ONLY node.provider/node.kind — never
 * config/secrets) and merges the lifetime run aggregates the route fetched
 * once from the `workflow_run_stats` view. Workflows with no recorded real
 * runs get zeroed stats. Only provider id/label/iconUrl + counts + numeric
 * run stats leave the server — no raw definition, config, or values.
 */
export function toWorkflowListItem(
  record: WorkflowRecord,
  runStatsByWorkflow: ReadonlyMap<string, WorkflowRunStats>,
): WorkflowListItem {
  const summary = summarizeDefinition(record.draftDefinition);
  const providers: WorkflowProviderChip[] = summary.providerIds.map((id) => ({
    id,
    label: getProvider(id)?.displayName ?? id,
    iconUrl: providerIconUrl(id) ?? null,
  }));
  return {
    ...toWorkflowSummary(record),
    providers,
    triggerCount: summary.triggerCount,
    actionCount: summary.actionCount,
    runStats: runStatsByWorkflow.get(record.id) ?? emptyRunStats(),
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
