import { createClient } from "@/utils/supabase/server";
import { getServiceRoleClient } from "./supabase/serviceRoleClient";

/**
 * react_agent_audit_events repository (REACT-AGENT-CS-5B-AUDIT-STORAGE).
 *
 * The data-access layer for the React Agent governance/audit ledger. Writes go
 * through the SERVICE-ROLE client (audit is logged server-side at the agent seam,
 * which has no user session, and the table is service-role-write-only). Member
 * reads go through the SSR-cookie client so RLS scopes them to the caller's own
 * accounts.
 *
 * STORAGE ONLY: nothing in the runtime emits these yet. The CS-5c recorder
 * (`services/ai/reactAgent/audit`) will sanitize + map + call `insertAuditEvent`,
 * injected into `runAuthorizedCapability` in CS-5d. This repo deliberately:
 *   - never stores raw prompts/answers/config/secrets — it persists only the safe
 *     enum-ish fields below (the DB CHECKs + the recorder's sanitizer enforce this);
 *   - defaults metadata to a plain object;
 *   - throws a generic, detail-free error (no raw DB text) so a caller's fail-open
 *     wrapper never surfaces DB internals.
 */

export type ReactAgentAuditOutcome = "success" | "denied" | "failed";
export type ReactAgentAuditMode =
  | "read_only"
  | "proposes_change"
  | "requires_approval";

export interface ReactAgentAuditEventInsert {
  readonly accountId: string;
  readonly actorUserId: string;
  readonly capabilityId: string;
  readonly intent: string;
  readonly mode: ReactAgentAuditMode;
  readonly auditKind: string;
  readonly outcome: ReactAgentAuditOutcome;
  readonly workflowId?: string | null;
  readonly conversationId?: string | null;
  readonly creditFeature?: string | null;
  readonly reason?: string | null;
  readonly proposedPatchRef?: string | null;
  readonly approvalId?: string | null;
  readonly aiCostEventId?: string | null;
  /** Sanitized aggregate-safe summary only (ids/enums/counts). Defaults to `{}`. */
  readonly metadata?: Record<string, unknown> | null;
}

export interface ReactAgentAuditEventRecord {
  readonly id: string;
  readonly accountId: string | null;
  readonly actorUserId: string | null;
  readonly workflowId: string | null;
  readonly conversationId: string | null;
  readonly capabilityId: string;
  readonly intent: string;
  readonly mode: string;
  readonly creditFeature: string | null;
  readonly auditKind: string;
  readonly outcome: string;
  readonly reason: string | null;
  readonly proposedPatchRef: string | null;
  readonly approvalId: string | null;
  readonly aiCostEventId: string | null;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string;
}

interface ReactAgentAuditEventRow {
  id: string;
  account_id: string | null;
  actor_user_id: string | null;
  workflow_id: string | null;
  conversation_id: string | null;
  capability_id: string;
  intent: string;
  mode: string;
  credit_feature: string | null;
  audit_kind: string;
  outcome: string;
  reason: string | null;
  proposed_patch_ref: string | null;
  approval_id: string | null;
  ai_cost_event_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Plain-object guard so a scalar/array can never reach the `jsonb_typeof = object` CHECK. */
function asMetadataObject(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function toInsertRow(e: ReactAgentAuditEventInsert): Record<string, unknown> {
  return {
    account_id: e.accountId,
    actor_user_id: e.actorUserId,
    workflow_id: e.workflowId ?? null,
    conversation_id: e.conversationId ?? null,
    capability_id: e.capabilityId,
    intent: e.intent,
    mode: e.mode,
    credit_feature: e.creditFeature ?? null,
    audit_kind: e.auditKind,
    outcome: e.outcome,
    reason: e.reason ?? null,
    proposed_patch_ref: e.proposedPatchRef ?? null,
    approval_id: e.approvalId ?? null,
    ai_cost_event_id: e.aiCostEventId ?? null,
    metadata: asMetadataObject(e.metadata),
  };
}

function rowToRecord(row: ReactAgentAuditEventRow): ReactAgentAuditEventRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    actorUserId: row.actor_user_id,
    workflowId: row.workflow_id,
    conversationId: row.conversation_id,
    capabilityId: row.capability_id,
    intent: row.intent,
    mode: row.mode,
    creditFeature: row.credit_feature,
    auditKind: row.audit_kind,
    outcome: row.outcome,
    reason: row.reason,
    proposedPatchRef: row.proposed_patch_ref,
    approvalId: row.approval_id,
    aiCostEventId: row.ai_cost_event_id,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

/** Append one React Agent audit event (service-role; table is write-only to it). */
export async function insertAuditEvent(
  event: ReactAgentAuditEventInsert,
): Promise<void> {
  const supabase = getServiceRoleClient(
    `react-agent: audit insert (${event.capabilityId}:${event.outcome})`,
  );
  const { error } = await supabase
    .from("react_agent_audit_events")
    .insert(toInsertRow(event));
  if (error) {
    // Generic, detail-free — never surface raw DB text to a caller.
    throw new Error("react_agent_audit_events.insertAuditEvent failed");
  }
}

export interface ListAuditEventsOptions {
  /** Inclusive lower bound on created_at (ISO timestamp). */
  from?: string;
  /** Inclusive upper bound on created_at (ISO timestamp). */
  to?: string;
  /** Row cap (defense against unbounded loads). Default 100. */
  limit?: number;
}

/**
 * List an ACCOUNT's React Agent audit events (most recent first).
 *
 * Uses the SSR-cookie client, so RLS scopes the read to accounts the caller is a
 * member of — a caller can NEVER read another account's audit trail through this
 * path. The explicit `account_id` filter is belt-and-suspenders on top of the
 * membership RLS.
 */
export async function listAuditEventsForAccount(
  accountId: string,
  opts: ListAuditEventsOptions = {},
): Promise<readonly ReactAgentAuditEventRecord[]> {
  const supabase = await createClient();
  let query = supabase
    .from("react_agent_audit_events")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.from) query = query.gte("created_at", opts.from);
  if (opts.to) query = query.lte("created_at", opts.to);
  const { data, error } = await query;
  if (error) {
    throw new Error("react_agent_audit_events.listAuditEventsForAccount failed");
  }
  return (data ?? []).map((r) => rowToRecord(r as ReactAgentAuditEventRow));
}
