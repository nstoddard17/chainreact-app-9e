import { createClient } from "@/utils/supabase/server";
import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import type {
  WorkflowState,
  WorkflowDisabledReason,
  WorkflowDefinition,
} from "@/contracts/workflow";

/**
 * Repository for workflows + workflow_revisions.
 *
 * Per docs/rules/database-security.md: server-side only. Lifecycle transition
 * logic lives in core/workflows/lifecycle.ts and services/workflows/lifecycleOrchestrator.ts;
 * this layer only persists what those decide.
 */

export interface WorkflowRecord {
  id: string;
  /**
   * V2 account that owns this workflow — the authoritative owner
   * (4.ACCOUNT-MODEL-7 cutover). NOT NULL per the 4.ACCOUNT-MODEL-5
   * foundation. Handlers must use this for integration lookups; ownership
   * checks compare against the caller's account. Cross-account integration
   * use is rejected at the integrations.getActiveForExecution boundary
   * because integrations are keyed on `account_id`.
   */
  accountId: string;
  /**
   * Provenance only — the human who first created this workflow. NOT
   * authorization (any account member with sufficient role may edit / run /
   * delete it). The DB column is `ON DELETE SET NULL`, but for Phase B
   * (single-user personal accounts) it is always populated: create() sets
   * it from the authenticated user, the foundation backfill set it from the
   * pre-cutover user_id, and the owning user cannot be deleted while they
   * own the personal account (accounts.owner_user_id is ON DELETE RESTRICT).
   * It can only become null once Phase D introduces team-member deletion —
   * which lands with the Phase C billing rescope that ends the engine's
   * dependence on this field for billing attribution. Typed non-null here
   * to keep that engine path a clean rename.
   */
  createdByUserId: string;
  name: string;
  state: WorkflowState;
  disabledReason: WorkflowDisabledReason | null;
  disabledContext: string | null;
  activeRevisionId: string | null;
  draftDefinition: WorkflowDefinition;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRevisionRecord {
  id: string;
  workflowId: string;
  definition: WorkflowDefinition;
  createdAt: string;
}

interface WorkflowsRow {
  id: string;
  account_id: string;
  created_by_user_id: string;
  name: string;
  state: WorkflowState;
  disabled_reason: WorkflowDisabledReason | null;
  disabled_context: string | null;
  active_revision_id: string | null;
  draft_definition: unknown;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface WorkflowRevisionsRow {
  id: string;
  workflow_id: string;
  definition: unknown;
  created_at: string;
}

function rowToRecord(row: WorkflowsRow): WorkflowRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    createdByUserId: row.created_by_user_id,
    name: row.name,
    state: row.state,
    disabledReason: row.disabled_reason,
    disabledContext: row.disabled_context,
    activeRevisionId: row.active_revision_id,
    draftDefinition: (row.draft_definition ?? {}) as WorkflowDefinition,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function revisionRowToRecord(row: WorkflowRevisionsRow): WorkflowRevisionRecord {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    definition: (row.definition ?? {}) as WorkflowDefinition,
    createdAt: row.created_at,
  };
}

// ── workflows ──────────────────────────────────────────────────────────────

export interface CreateWorkflowInput {
  /** V2 account that will own the workflow (the caller's resolved account). */
  accountId: string;
  /** Provenance — the human creating it. Stored as created_by_user_id. */
  createdByUserId: string;
  name: string;
  draftDefinition?: WorkflowDefinition;
}

export async function create(input: CreateWorkflowInput): Promise<WorkflowRecord> {
  const supabase = await createClient();
  // 4.ACCOUNT-MODEL-7: supply account_id + created_by_user_id directly. The
  // foundation compat trigger that used to derive these from user_id is
  // dropped in this slice's migration. The INSERT must satisfy the
  // workflows_insert_account_member RLS policy — the caller must be a member
  // of input.accountId (true for the personal-account resolver path).
  const { data, error } = await supabase
    .from("workflows")
    .insert({
      account_id: input.accountId,
      created_by_user_id: input.createdByUserId,
      name: input.name,
      draft_definition: input.draftDefinition ?? { nodes: [], edges: [] },
    })
    .select()
    .single<WorkflowsRow>();
  if (error || !data) {
    throw new Error(`workflows.create failed: ${error?.message ?? "no row returned"}`);
  }
  return rowToRecord(data);
}

export async function getById(workflowId: string): Promise<WorkflowRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflows")
    .select("*")
    .eq("id", workflowId)
    .maybeSingle<WorkflowsRow>();
  if (error) throw new Error(`workflows.getById failed: ${error.message}`);
  return data ? rowToRecord(data) : null;
}

/**
 * List the workflows owned by an account (4.ACCOUNT-MODEL-7 — replaces the
 * former `listByUser`). Callers resolve the account at route entry via the
 * personal-account resolver (until the switcher slice ships). RLS
 * (workflows_select_account_member) gates visibility to account members;
 * the explicit `.eq("account_id", …)` scopes the result set.
 */
export async function listByAccount(
  accountId: string,
  opts: { includeDeleted?: boolean } = {},
): Promise<readonly WorkflowRecord[]> {
  const supabase = await createClient();
  let query = supabase.from("workflows").select("*").eq("account_id", accountId);
  if (!opts.includeDeleted) {
    query = query.neq("state", "deleted");
  }
  const { data, error } = await query.order("updated_at", { ascending: false });
  if (error) throw new Error(`workflows.listByAccount failed: ${error.message}`);
  return (data ?? []).map((r) => rowToRecord(r as WorkflowsRow));
}

/**
 * Fetch `(id, name)` for an explicit set of workflow ids (Slice
 * 4.RUNS-PAGE-1). Used by the Runs page to populate the workflow-name
 * column without pulling each row's `draft_definition` (a potentially
 * large JSONB blob) through `listByUser`. RLS gates per-user access,
 * so an attacker who guesses another user's workflow id still gets
 * zero rows back. Includes soft-deleted rows on purpose — a deleted
 * workflow's prior runs still exist in `workflow_runs` and the run-
 * history surface should still show its name (better truth than
 * "Untitled").
 *
 * Returns an empty array when `ids` is empty (no I/O).
 */
export async function listNamesByIds(
  ids: readonly string[],
): Promise<readonly { id: string; name: string }[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflows")
    .select("id,name")
    .in("id", ids as string[]);
  if (error) {
    throw new Error(`workflows.listNamesByIds failed: ${error.message}`);
  }
  return (data ?? []) as readonly { id: string; name: string }[];
}

export async function updateName(
  workflowId: string,
  name: string,
): Promise<WorkflowRecord> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflows")
    .update({ name })
    .eq("id", workflowId)
    .select()
    .single<WorkflowsRow>();
  if (error || !data) {
    throw new Error(`workflows.updateName failed: ${error?.message ?? "no row returned"}`);
  }
  return rowToRecord(data);
}

/**
 * Move a workflow into a folder, or to uncategorized (`folderId = null`).
 * Slice 4.WORKFLOW-FOLDERS-3 / WF-2 — the only writer of `workflows.folder_id`.
 * The service validates the folder is live + in the same account first; the
 * DB same-account trigger (workflows_enforce_same_account_folder) is the
 * backstop. RLS scopes the write to account members.
 */
export async function updateFolder(
  workflowId: string,
  folderId: string | null,
): Promise<WorkflowRecord> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflows")
    .update({ folder_id: folderId })
    .eq("id", workflowId)
    .select()
    .single<WorkflowsRow>();
  if (error || !data) {
    throw new Error(`workflows.updateFolder failed: ${error?.message ?? "no row returned"}`);
  }
  return rowToRecord(data);
}

export async function updateDraftDefinition(
  workflowId: string,
  definition: WorkflowDefinition,
): Promise<WorkflowRecord> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflows")
    .update({ draft_definition: definition })
    .eq("id", workflowId)
    .select()
    .single<WorkflowsRow>();
  if (error || !data) {
    throw new Error(`workflows.updateDraftDefinition failed: ${error?.message ?? "no row returned"}`);
  }
  return rowToRecord(data);
}

export interface UpdateDraftDefinitionGuardedInput {
  /** Owning account (the caller's resolved account) — the ownership guard. */
  accountId: string;
  workflowId: string;
  draftDefinition: WorkflowDefinition;
  /** The `updatedAt` the caller validated against — the optimistic-lock token. */
  expectedUpdatedAt: string;
}

/**
 * Write-time optimistic-concurrency variant of `updateDraftDefinition`. The
 * UPDATE only matches when (id, account_id, updated_at) all equal the caller's
 * expectation, so a workflow that changed after the caller read + validated it
 * is NOT overwritten, and a workflow in another account is never touched
 * (4.ACCOUNT-MODEL-7 — the guard is now account-scoped, not user-scoped).
 * Returns `null` when nothing matched (stale revision OR cross-account) —
 * mirrors `applyTransition`'s `.eq(state)` guard pattern.
 *
 * The `set_updated_at` trigger bumps `updated_at` on the matched row, so the
 * returned record carries the NEW revision token. Used by the AI patch apply
 * service (Slice 4.AI-6B); `updateDraftDefinition` stays unchanged for other
 * callers that don't need the guard.
 */
export async function updateDraftDefinitionIfRevisionMatches(
  input: UpdateDraftDefinitionGuardedInput,
): Promise<WorkflowRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflows")
    .update({ draft_definition: input.draftDefinition })
    .eq("id", input.workflowId)
    .eq("account_id", input.accountId)
    .eq("updated_at", input.expectedUpdatedAt)
    .select()
    .maybeSingle<WorkflowsRow>();
  if (error) {
    throw new Error(`workflows.updateDraftDefinitionIfRevisionMatches failed: ${error.message}`);
  }
  return data ? rowToRecord(data) : null;
}

// ── workflow_revisions ─────────────────────────────────────────────────────

export interface CreateRevisionInput {
  workflowId: string;
  definition: WorkflowDefinition;
}

export async function createRevision(
  input: CreateRevisionInput,
): Promise<WorkflowRevisionRecord> {
  const supabase = await createClient();
  // 4.ACCOUNT-MODEL-7: workflow_revisions.user_id is dropped. The row's
  // account scope is implicit via its workflow_id FK; RLS
  // (workflow_revisions_insert_account_member) gates the INSERT by joining
  // through workflows.account_id to the caller's membership.
  const { data, error } = await supabase
    .from("workflow_revisions")
    .insert({
      workflow_id: input.workflowId,
      definition: input.definition,
    })
    .select()
    .single<WorkflowRevisionsRow>();
  if (error || !data) {
    throw new Error(
      `workflow_revisions.create failed: ${error?.message ?? "no row returned"}`,
    );
  }
  return revisionRowToRecord(data);
}

export async function setActiveRevision(
  workflowId: string,
  revisionId: string,
): Promise<WorkflowRecord> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflows")
    .update({ active_revision_id: revisionId })
    .eq("id", workflowId)
    .select()
    .single<WorkflowsRow>();
  if (error || !data) {
    throw new Error(`workflows.setActiveRevision failed: ${error?.message ?? "no row returned"}`);
  }
  return rowToRecord(data);
}

// ── Lifecycle transitions ──────────────────────────────────────────────────
//
// applyTransition is the only writer for workflows.state. The orchestrator
// (services/workflows/lifecycleOrchestrator.ts) calls it after validating
// the transition against the state machine in core/workflows/lifecycle.ts.
//
// Concurrency model: the .eq("state", expectedFromState) predicate gives us
// optimistic concurrency without an explicit lock. If a concurrent transition
// already moved the row out of expectedFromState, the UPDATE matches zero
// rows and we return null; the orchestrator maps that to LIFECYCLE_CONFLICT.
//
// Pass-through semantics on optional columns: undefined means "do not write
// the column". Use `null` to explicitly clear it.

export interface ApplyTransitionInput {
  workflowId: string;
  expectedFromState: WorkflowState;
  toState: WorkflowState;
  /** `undefined` = leave column untouched. `null` = clear. */
  disabledReason?: WorkflowDisabledReason | null;
  /** `undefined` = leave column untouched. `null` = clear. */
  disabledContext?: string | null;
  /** When true, set deleted_at = now(). Used by the delete transition. */
  setDeletedAt?: boolean;
}

/**
 * Engine path: load the full workflow record without a user session. Used by
 * services/execution/engine.ts after a webhook dispatches a run — by then we
 * already verified state===active in the dispatcher, so the engine just
 * needs the full draftDefinition + name + createdByUserId (the billing
 * provenance key, threaded to the billing gate in Phase B) to walk the graph.
 */
export async function getByIdServiceRole(
  workflowId: string,
): Promise<WorkflowRecord | null> {
  const supabase = getServiceRoleClient(
    `workflow execution: getByIdServiceRole ${workflowId}`,
  );
  const { data, error } = await supabase
    .from("workflows")
    .select("*")
    .eq("id", workflowId)
    .maybeSingle<WorkflowsRow>();
  if (error) {
    throw new Error(`workflows.getByIdServiceRole failed: ${error.message}`);
  }
  return data ? rowToRecord(data) : null;
}

/**
 * Webhook-dispatcher path: look up just the lifecycle state for a workflow
 * without a user session. Used by core/triggers/dispatch.ts to drop events
 * for paused / disabled / deleted workflows even when the trigger_resources
 * row hasn't been removed yet (provider deregistration may lag).
 */
export async function getStateForDispatch(
  workflowId: string,
): Promise<WorkflowState | null> {
  const supabase = getServiceRoleClient(
    `webhook dispatcher: state lookup ${workflowId}`,
  );
  const { data, error } = await supabase
    .from("workflows")
    .select("state")
    .eq("id", workflowId)
    .maybeSingle<{ state: WorkflowState }>();
  if (error) {
    throw new Error(`workflows.getStateForDispatch failed: ${error.message}`);
  }
  return data?.state ?? null;
}

/**
 * Polling-scheduler path (Slice 4.ACCOUNT-MODEL-6): look up state +
 * V2 owner accountId in a single round trip. The cron's per-trigger
 * pre-filter needs both — `state` for the active-or-skip gate, and
 * `accountId` for threading into the polling handler context so the
 * handler's integration lookups (getActiveForExecution +
 * refreshAndRetry) scope correctly.
 *
 * Returns null when no workflow row matches; otherwise both fields
 * are populated (accountId is NOT NULL per the 4.ACCOUNT-MODEL-5
 * foundation).
 */
export interface WorkflowDispatchInfo {
  state: WorkflowState;
  accountId: string;
}

export async function getDispatchInfo(
  workflowId: string,
): Promise<WorkflowDispatchInfo | null> {
  const supabase = getServiceRoleClient(
    `polling scheduler: state+account lookup ${workflowId}`,
  );
  const { data, error } = await supabase
    .from("workflows")
    .select("state, account_id")
    .eq("id", workflowId)
    .maybeSingle<{ state: WorkflowState; account_id: string }>();
  if (error) {
    throw new Error(`workflows.getDispatchInfo failed: ${error.message}`);
  }
  if (!data) return null;
  return { state: data.state, accountId: data.account_id };
}

export async function applyTransition(
  input: ApplyTransitionInput,
): Promise<WorkflowRecord | null> {
  const supabase = await createClient();
  const update: Record<string, unknown> = { state: input.toState };
  if (input.disabledReason !== undefined) {
    update.disabled_reason = input.disabledReason;
  }
  if (input.disabledContext !== undefined) {
    update.disabled_context = input.disabledContext;
  }
  if (input.setDeletedAt) {
    update.deleted_at = new Date().toISOString();
  }
  const { data, error } = await supabase
    .from("workflows")
    .update(update)
    .eq("id", input.workflowId)
    .eq("state", input.expectedFromState)
    .select()
    .maybeSingle<WorkflowsRow>();
  if (error) {
    throw new Error(`workflows.applyTransition failed: ${error.message}`);
  }
  return data ? rowToRecord(data) : null;
}
