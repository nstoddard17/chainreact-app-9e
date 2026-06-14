import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { resolveActiveAccount } from "@/services/accounts/activeAccount";
import { isMember } from "@/repositories/accountMemberships";
import { LifecycleError } from "@/core/workflows/lifecycle";
import { redactOutput } from "@/core/security/redactOutput";
import {
  humanizeActionError,
  GENERIC_ACTION_ERROR_TITLE,
} from "@/core/errors/humanizeActionError";
import { getActionMeta } from "@/services/discovery/_registry";
import { getProvider, providerIconUrl } from "@/integrations/_registry";
import { summarizeDefinition } from "@/core/workflows/definitionSummary";
import {
  workflowUsesPrivateCredential,
  viewerMayRunEdit,
} from "@/core/integrations/workflowCredentialScope";
import { isConnectionSharingEnabled } from "@/services/integrations/connectionSharingFlags";
import {
  buildWorkflowCredentialPlan,
  buildWorkflowCredentialPlansBatch,
} from "@/services/integrations/connectionResolution";
import { emptyRunStats } from "@/repositories/workflowRunStats";
import * as workflowsRepo from "@/repositories/workflows";
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
 * 4.TEAM-WORKFLOWS-1 (TW-1) — the standard "workflow not found" response.
 * Non-members collapse to this SAME shape (never a 403 that reveals the
 * workflow exists in another account), matching the 404 RLS already produces
 * when `getById` returns null for a non-member.
 */
export function workflowNotFoundResponse(): NextResponse {
  return NextResponse.json(
    { error: "Workflow not found.", code: "WORKFLOW_NOT_FOUND" },
    { status: 404 },
  );
}

/**
 * 4.TEAM-WORKFLOWS-1 (TW-1) — explicit route-layer authorization for a
 * workflow's account. The detail + lifecycle routes load a workflow by id and
 * call this with the workflow's own `accountId`; a caller who is NOT a member
 * of that account gets the standard 404 (no existence leak).
 *
 * This is **membership-based, not active-account-based**: a member editing a
 * Team workflow while a different account is active is still authorized (the
 * workflow id is the anchor; see team-workflows-1-builder-plan.md §4). RLS
 * already gates `getById` to account members, so this is defense-in-depth that
 * makes the rule explicit + unit-testable without depending solely on RLS.
 *
 * **Roles are NOT consulted** — any member of the account is authorized.
 * Workflow access is membership-based, not role-gated (TW-1 launch decision).
 */
export async function requireWorkflowAccountMember(
  userId: string,
  accountId: string,
): Promise<{ ok: true } | AuthFailure> {
  const member = await isMember(userId, accountId);
  if (!member) {
    return { ok: false, response: workflowNotFoundResponse() };
  }
  return { ok: true };
}

/**
 * Load a workflow by id and authorize the caller as a member of its account.
 * A missing / soft-deleted workflow AND a non-member both collapse to the same
 * `WORKFLOW_NOT_FOUND` 404 (no existence leak) — the standard TW-1 shape. Shared
 * by routes that need the workflow RECORD after the membership gate (e.g. the
 * in-builder create-from-template route needs the workflow's `accountId`).
 */
export async function loadWorkflowForMember(
  workflowId: string,
  userId: string,
): Promise<{ ok: true; record: WorkflowRecord } | AuthFailure> {
  const record = await workflowsRepo.getById(workflowId);
  if (!record || record.state === "deleted") {
    return { ok: false, response: workflowNotFoundResponse() };
  }
  const authorized = await requireWorkflowAccountMember(userId, record.accountId);
  if (!authorized.ok) return authorized;
  return { ok: true, record };
}

/**
 * 4.TEAM-WORKFLOWS-1 (TW-1) — membership gate for the lifecycle routes
 * (activate / pause / resume / disable) that otherwise hand the id straight to
 * the orchestrator. Loads the workflow and, when it exists and is not deleted,
 * authorizes the caller against its account. A missing / deleted workflow
 * (including the RLS-null a non-member sees) is deferred to the orchestrator's
 * `WORKFLOW_NOT_FOUND` mapping — preserving the existing not-found shape.
 */
export async function authorizeWorkflowLifecycleAccess(
  workflowId: string,
  userId: string,
): Promise<{ ok: true } | AuthFailure> {
  const record = await workflowsRepo.getById(workflowId);
  if (!record || record.state === "deleted") return { ok: true };
  return requireWorkflowAccountMember(userId, record.accountId);
}

/**
 * V2-READY-20 — safe, identifier-free client message for a trigger-registration
 * failure. `TRIGGER_REGISTRATION_FAILED` is the ONE LifecycleError code whose
 * `message` + `details.cause` wrap a RAW provider / integration error: the
 * orchestrator builds it as `"...: ${(err as Error).message}"` with
 * `details: { cause: (err as Error).message }`, and that underlying message can
 * carry the provider account id (e.g. a Gmail mailbox / email), the internal V2
 * account id, scopes, or a raw provider error body — see the throw shapes in
 * services/oauth/refreshAndRetry.ts (`IntegrationActionRequiredError`,
 * `"...no active integration for account <id> provider <p> provider-account
 * <pa>."`), services/triggers/lifecycle.ts (`"...no active <p> integration for
 * account <id>."`), and the per-provider activate hooks (Google Calendar
 * events.watch/list bodies). None of that may reach the client, so the response
 * boundary surfaces only the stable `code` + this static message and DROPS
 * `details`. Mirrors the `toSafeStepError` / `redactStepOutput` boundary below.
 */
const TRIGGER_REGISTRATION_FAILED_SAFE_MESSAGE =
  "Couldn't register this workflow's trigger with the provider. Check the connection and try again.";

/**
 * LifecycleError → HTTP. Code-stable for client UIs that branch on
 * `code`; status carries the user-actionable distinction (404 vs 409 vs 422).
 */
export function lifecycleErrorResponse(err: LifecycleError): NextResponse {
  const status = LIFECYCLE_HTTP_STATUS[err.code];
  // No-leak boundary (V2-READY-20): redact the raw provider/integration cause
  // wrapped by TRIGGER_REGISTRATION_FAILED. Keep the raw error server-side for
  // diagnostics (structured log), but never echo message/details to the client.
  if (err.code === "TRIGGER_REGISTRATION_FAILED") {
    console.error(
      JSON.stringify({
        event: "workflow.lifecycle.trigger_registration_failed",
        message: err.message,
        details: err.details,
      }),
    );
    return NextResponse.json(
      { error: TRIGGER_REGISTRATION_FAILED_SAFE_MESSAGE, code: err.code },
      { status },
    );
  }
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
    // No-leak fallback (V2-READY-22). A non-LifecycleError reaching here is an
    // UNEXPECTED throw from the orchestrator / repository chain whose raw message
    // can carry internal detail: AccountFrozenError embeds the V2 account id
    // ("Account <id> is pending deletion..."), and Supabase / Postgres errors name
    // tables / columns / constraints. Collapse to a stable safe message and log
    // the raw error server-side only. Status 500 + the codeless body shape are
    // preserved so the client keeps mapping it to SERVER_ERROR (lib/api/workflows.ts
    // pickCode). Mirrors the lifecycleErrorResponse boundary above.
    console.error(
      JSON.stringify({
        event: "workflow.lifecycle.unexpected_error",
        message: err instanceof Error ? err.message : String(err),
      }),
    );
    return NextResponse.json({ error: "Workflow action failed." }, { status: 500 });
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

/**
 * The single async `viewerCanRunEdit` boolean (CS-4b/CS-5a) — the SAME decision
 * `assertWorkflowRunEditAllowed` enforces, so the DTO hint and the gate can never
 * drift. Flag OFF → exact `viewerMayRunEdit` (no DB). Flag ON → creator / no-
 * private short-circuit (no DB), else the shared `buildWorkflowCredentialPlan`
 * resolvability (`allTeamRunnable`).
 */
export async function computeViewerCanRunEdit(
  record: WorkflowRecord,
  callerUserId: string,
): Promise<boolean> {
  if (!isConnectionSharingEnabled()) {
    return viewerMayRunEdit(
      { createdByUserId: record.createdByUserId, definition: record.draftDefinition },
      callerUserId,
    );
  }
  if (!workflowUsesPrivateCredential(record.draftDefinition)) return true;
  if (record.createdByUserId === callerUserId) return true;
  const plan = await buildWorkflowCredentialPlan({
    workflowId: record.id,
    accountId: record.accountId,
    createdByUserId: record.createdByUserId,
    nodes: record.draftDefinition.nodes,
  });
  return plan.allTeamRunnable;
}

/**
 * Batched `viewerCanRunEdit` for a LIST of workflows (CS-5b) — the dashboard
 * counterpart to `computeViewerCanRunEdit`, producing the SAME decision but in
 * **bounded queries** instead of one `buildWorkflowCredentialPlan` per row.
 *
 * Flag OFF → pure `viewerMayRunEdit` per record, NO DB (byte-for-byte the old
 * conservative WF-RUNPERM list behavior). Flag ON → creator / no-private records
 * short-circuit to `true` with no query; the remaining "candidate" records (non-
 * creator, private-credential) are resolved by `buildWorkflowCredentialPlansBatch`
 * (≤3 reads total per account), and the row is runnable iff `allTeamRunnable` —
 * identical to the detail DTO + the run/edit gate, so the list can never over- or
 * under-permit relative to the chokepoint. Records are grouped by `accountId`
 * (defensive; the list is single-account today). Display only — the gate is still
 * the real enforcement.
 */
export async function computeViewerCanRunEditBatch(
  records: readonly WorkflowRecord[],
  callerUserId: string,
): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  if (!isConnectionSharingEnabled()) {
    for (const r of records) {
      out.set(
        r.id,
        viewerMayRunEdit({ createdByUserId: r.createdByUserId, definition: r.draftDefinition }, callerUserId),
      );
    }
    return out;
  }

  // Flag ON: short-circuit creator / no-private (no DB); batch the rest by account.
  const candidatesByAccount = new Map<string, WorkflowRecord[]>();
  for (const r of records) {
    if (!workflowUsesPrivateCredential(r.draftDefinition) || r.createdByUserId === callerUserId) {
      out.set(r.id, true);
      continue;
    }
    const bucket = candidatesByAccount.get(r.accountId) ?? [];
    bucket.push(r);
    candidatesByAccount.set(r.accountId, bucket);
  }

  for (const [accountId, candidates] of candidatesByAccount) {
    const plans = await buildWorkflowCredentialPlansBatch({
      accountId,
      records: candidates.map((r) => ({
        id: r.id,
        createdByUserId: r.createdByUserId,
        nodes: r.draftDefinition.nodes,
      })),
    });
    for (const r of candidates) out.set(r.id, plans.get(r.id)?.allTeamRunnable ?? false);
  }
  return out;
}

export async function toWorkflowDetail(
  record: WorkflowRecord,
  callerUserId: string,
): Promise<WorkflowDetail> {
  return {
    ...toWorkflowSummary(record),
    activeRevisionId: record.activeRevisionId,
    draftDefinition: record.draftDefinition,
    usesPrivateCredential: workflowUsesPrivateCredential(record.draftDefinition),
    // Accurate under the flag — shares the gate's exact computation.
    viewerCanRunEdit: await computeViewerCanRunEdit(record, callerUserId),
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
 *
 * `viewerCanRunEdit` is ACCURATE under the sharing flag (CS-5b): the caller passes
 * `viewerCanRunEditByWorkflow` — the result of `computeViewerCanRunEditBatch` over
 * all visible rows in BOUNDED queries — so a row reflects the SAME eligibility the
 * detail DTO + run/edit gate use (a team-runnable shared workflow is no longer shown
 * as a blocked "private connection"). When the map is omitted (or lacks the id), it
 * falls back to the CONSERVATIVE sync `viewerMayRunEdit` (creator-only) — safe
 * (never over-permits) and the exact flag-OFF behavior. The run/edit GATE is the
 * real enforcement regardless; this is display only.
 */
export function toWorkflowListItem(
  record: WorkflowRecord,
  runStatsByWorkflow: ReadonlyMap<string, WorkflowRunStats>,
  callerUserId: string,
  viewerCanRunEditByWorkflow?: ReadonlyMap<string, boolean>,
): WorkflowListItem {
  const summary = summarizeDefinition(record.draftDefinition);
  const providers: WorkflowProviderChip[] = summary.providerIds.map((id) => ({
    id,
    label: getProvider(id)?.displayName ?? id,
    iconUrl: providerIconUrl(id) ?? null,
  }));
  const viewerCanRunEdit =
    viewerCanRunEditByWorkflow?.get(record.id) ??
    viewerMayRunEdit(
      { createdByUserId: record.createdByUserId, definition: record.draftDefinition },
      callerUserId,
    );
  return {
    ...toWorkflowSummary(record),
    providers,
    triggerCount: summary.triggerCount,
    actionCount: summary.actionCount,
    runStats: runStatsByWorkflow.get(record.id) ?? emptyRunStats(),
    folderId: record.folderId,
    usesPrivateCredential: workflowUsesPrivateCredential(record.draftDefinition),
    viewerCanRunEdit,
  };
}

/**
 * WF-RUNPERM — 403 for a private-credential workflow the caller may not run/edit.
 * The caller is a member who CAN see the workflow (so this is a 403, not the
 * non-member 404). Safe copy only — no email / label / scope / token /
 * providerAccountId / raw provider error. The duplicate hint points members to
 * the supported path (fork → pick own connection).
 */
export function workflowUsesPrivateCredentialResponse(): NextResponse {
  return NextResponse.json(
    {
      error:
        "This workflow runs with the creator's private connection. Duplicate it to use your own connection.",
      code: "WORKFLOW_USES_PRIVATE_CREDENTIAL",
    },
    { status: 403 },
  );
}

/**
 * WF-RUNPERM (+ CS-4b sharing) — run/edit gate, applied AFTER the membership gate,
 * on an already-loaded (non-deleted, membership-authorized) record. Returns the
 * typed 403 when the workflow is private-credential and the caller may not run/
 * edit it; `null` when allowed. Role-agnostic.
 *
 * `ENABLE_CONNECTION_SHARING` OFF → EXACT WF-RUNPERM (`viewerMayRunEdit`, no DB).
 *
 * Flag ON → a non-creator is allowed only when EVERY personal-provider node
 * resolves to a specific shared connector under the shared
 * `buildWorkflowCredentialPlan` precedence (accepted grant → valid binding →
 * single-sharer). Any unshared or ambiguous-no-binding node keeps it creator-only.
 * The gate consumes the SAME plan the executor resolves owners from, so they can
 * never drift. Creator + no-private short-circuit with no DB read.
 */
export async function assertWorkflowRunEditAllowed(
  record: WorkflowRecord,
  callerUserId: string,
): Promise<NextResponse | null> {
  // Shares `computeViewerCanRunEdit` with the DTO hint — gate and UI can't drift.
  return (await computeViewerCanRunEdit(record, callerUserId))
    ? null
    : workflowUsesPrivateCredentialResponse();
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
      ...(s.error !== undefined ? { error: toSafeStepError(s.error) } : {}),
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

/**
 * V2-READY-2 — sanitize a persisted step error for the CLIENT. The stored step
 * error message is the RAW thrown text (the engine builds `HANDLER_FAILED` from
 * `(err as Error).message`), which can carry provider account ids, emails,
 * tokens, integration ids, account ids, scopes, or raw provider error bodies.
 * The run-detail endpoint feeds the builder's RunResultsPanel, so we surface only
 * the stable `code` + a HUMANIZED, identifier-free message — the same humanizer
 * the run-summary `errorClassification` uses. The raw message stays in the DB
 * `steps` jsonb for server-side diagnostics and is never returned to the client.
 * Mirrors the `redactStepOutput` boundary directly below; `details` is dropped
 * because the only useful detail (MISSING_VARIABLE's `{{path}}`) is already
 * folded into the humanized description, and details is the other free-form
 * vector that could carry raw provider data.
 *
 * The generic humanizer fallback (`title === GENERIC_ACTION_ERROR_TITLE`) is the
 * ONE branch whose description echoes the raw message — for it we emit the safe
 * generic title instead. Every other branch's description is code/details-derived.
 */
function toSafeStepError(error: {
  code: string;
  message: string;
  details?: Readonly<Record<string, unknown>>;
}): { code: string; message: string } {
  const humanized = humanizeActionError({
    code: error.code,
    message: error.message,
    ...(error.details !== undefined ? { details: error.details } : {}),
  });
  const message =
    humanized.title === GENERIC_ACTION_ERROR_TITLE
      ? humanized.title
      : humanized.description;
  return { code: error.code, message };
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
