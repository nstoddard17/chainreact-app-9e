import { createClient } from "@/utils/supabase/server";
import { getServiceRoleClient } from "./supabase/serviceRoleClient";

/**
 * Repository for ai_cost_events (Slice 4.COST-6) — the AI cost / observability
 * ledger (separate from task_usage_events).
 *
 * 4.ACCOUNT-MODEL-9d: cost OWNER is `account_id`; `user_id` is retained as the
 * ACTOR (the user who drove the AI interaction — distinct from the owning
 * account). Writes go through the service-role client (AI events are logged
 * server-side with no user session); reads go through the SSR-cookie client so
 * RLS gates by account membership (owner/admin cross-account reads use the
 * service-role path, bypassing RLS).
 *
 * NEVER persist raw prompts / completions / chain-of-thought / secrets /
 * tokens / bodies / configs. Callers pass ids, types, counts, timings, model
 * names, cost amounts, codes, and a redacted `metadata` summary (the service
 * layer sanitizes `metadata` before it reaches here).
 */

/**
 * Allowed `ai_cost_events.feature` values, as a RUNTIME list.
 *
 * MUST stay in lockstep with the `ai_cost_events_feature_chk` CHECK constraint
 * — widening the set is a forward-only migration that drops + recreates the
 * constraint with the expanded list (latest:
 * `20260728000000_ai_cost_events_feature_add_ai_provider.sql`). A static test
 * parses that migration and compares it to this array, so drift fails CI
 * instead of failing an INSERT in production.
 */
export const AI_COST_FEATURES = [
  "workflow_creation",
  "workflow_editing",
  "workflow_repair",
  "workflow_explanation",
  "workflow_qa",
  "failed_run_analysis",
  "provider_discovery",
  "template_recommendation",
  "template_customization",
  "cost_preview",
  // AI-PROVIDER-3 (CS-3) — ChainReact AI provider capabilities. Names match
  // `AiFeature` (core/ai/modelTypes) exactly so one key drives model call,
  // credit charge, and ledger row.
  "document_analysis",
  "data_transform",
  "schema_suggestion",
  "other",
] as const;

export type AiCostFeature = (typeof AI_COST_FEATURES)[number];

export type AiCostEventType =
  | "ai_interaction_started"
  | "ai_model_call_completed"
  | "ai_model_call_failed"
  | "ai_tool_called"
  | "ai_tool_failed"
  | "ai_patch_proposed"
  | "ai_patch_validation_failed"
  | "ai_patch_previewed"
  | "ai_patch_applied"
  | "ai_patch_rejected"
  | "ai_safety_block_triggered"
  | "ai_user_feedback_submitted"
  | "ai_template_recommended"
  | "ai_template_instantiated"
  | "ai_cost_recorded";

export interface AiCostEventInsert {
  /** Cost owner (the account the AI usage is billed to). */
  accountId: string;
  /** Actor — the user who drove the AI interaction (provenance, not owner). */
  userId: string;
  workflowId?: string | null;
  workflowRunId?: string | null;
  patchId?: string | null;
  conversationId?: string | null;
  feature: AiCostFeature;
  eventType: AiCostEventType;
  modelName?: string | null;
  modelProvider?: string | null;
  promptVersion?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  /** USD millionths (micro-dollars). */
  estimatedCostMicros?: number | null;
  aiCreditsCharged?: number | null;
  latencyMs?: number | null;
  toolName?: string | null;
  toolStatus?: string | null;
  validationErrorCode?: string | null;
  safetyBlockReason?: string | null;
  accepted?: boolean | null;
  success?: boolean | null;
  /** Already-sanitized, redacted summary. */
  metadata?: Record<string, unknown>;
}

export interface AiCostEventRecord extends AiCostEventInsert {
  id: string;
  createdAt: string;
}

interface AiCostEventRow {
  id: string;
  account_id: string;
  user_id: string;
  workflow_id: string | null;
  workflow_run_id: string | null;
  patch_id: string | null;
  conversation_id: string | null;
  feature: AiCostFeature;
  event_type: AiCostEventType;
  model_name: string | null;
  model_provider: string | null;
  prompt_version: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  estimated_cost_micros: number | null;
  ai_credits_charged: number | null;
  latency_ms: number | null;
  tool_name: string | null;
  tool_status: string | null;
  validation_error_code: string | null;
  safety_block_reason: string | null;
  accepted: boolean | null;
  success: boolean | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

function toInsertRow(e: AiCostEventInsert): Record<string, unknown> {
  return {
    account_id: e.accountId,
    user_id: e.userId,
    workflow_id: e.workflowId ?? null,
    workflow_run_id: e.workflowRunId ?? null,
    patch_id: e.patchId ?? null,
    conversation_id: e.conversationId ?? null,
    feature: e.feature,
    event_type: e.eventType,
    model_name: e.modelName ?? null,
    model_provider: e.modelProvider ?? null,
    prompt_version: e.promptVersion ?? null,
    input_tokens: e.inputTokens ?? null,
    output_tokens: e.outputTokens ?? null,
    total_tokens: e.totalTokens ?? null,
    estimated_cost_micros: e.estimatedCostMicros ?? null,
    ai_credits_charged: e.aiCreditsCharged ?? null,
    latency_ms: e.latencyMs ?? null,
    tool_name: e.toolName ?? null,
    tool_status: e.toolStatus ?? null,
    validation_error_code: e.validationErrorCode ?? null,
    safety_block_reason: e.safetyBlockReason ?? null,
    accepted: e.accepted ?? null,
    success: e.success ?? null,
    metadata: e.metadata ?? {},
  };
}

function rowToRecord(row: AiCostEventRow): AiCostEventRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    userId: row.user_id,
    workflowId: row.workflow_id,
    workflowRunId: row.workflow_run_id,
    patchId: row.patch_id,
    conversationId: row.conversation_id,
    feature: row.feature,
    eventType: row.event_type,
    modelName: row.model_name,
    modelProvider: row.model_provider,
    promptVersion: row.prompt_version,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    totalTokens: row.total_tokens,
    estimatedCostMicros: row.estimated_cost_micros,
    aiCreditsCharged: row.ai_credits_charged,
    latencyMs: row.latency_ms,
    toolName: row.tool_name,
    toolStatus: row.tool_status,
    validationErrorCode: row.validation_error_code,
    safetyBlockReason: row.safety_block_reason,
    accepted: row.accepted,
    success: row.success,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

/** Append one AI cost/observability event; returns the inserted row id. */
export async function insertEvent(event: AiCostEventInsert): Promise<string> {
  const supabase = getServiceRoleClient(
    `ai: ai_cost_events insert (${event.eventType})`,
  );
  const { data, error } = await supabase
    .from("ai_cost_events")
    .insert(toInsertRow(event))
    .select("id")
    .single<{ id: string }>();
  if (error || !data) {
    throw new Error(
      `ai_cost_events.insertEvent failed: ${error?.message ?? "no row returned"}`,
    );
  }
  return data.id;
}

/** List a workflow's AI events (RLS-gated to the caller's own rows). */
export async function listByWorkflow(
  workflowId: string,
): Promise<readonly AiCostEventRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_cost_events")
    .select("*")
    .eq("workflow_id", workflowId)
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(`ai_cost_events.listByWorkflow failed: ${error.message}`);
  }
  return (data ?? []).map((r) => rowToRecord(r as AiCostEventRow));
}

export interface ListByUserOptions {
  /** Inclusive lower bound on created_at (ISO timestamp). */
  from?: string;
  /** Inclusive upper bound on created_at (ISO timestamp). */
  to?: string;
  /** Optional row cap (defense against unbounded loads). */
  limit?: number;
}

/**
 * List an ACCOUNT's AI events for account analytics (Slice 4.AI-12;
 * account-scoped in 4.ACCOUNT-MODEL-9d).
 *
 * Uses the SSR-cookie client, so RLS scopes the read to accounts the caller is a
 * member of — a caller can NEVER read another account's AI events through this
 * path (the explicit `account_id` filter is belt-and-suspenders on top of the
 * membership RLS). Owner/admin CROSS-account analytics still go through the
 * service-role `listEventsForAnalytics` and require an admin gate that does not
 * yet exist in V2.
 */
export async function listByAccount(
  accountId: string,
  opts: ListByUserOptions = {},
): Promise<readonly AiCostEventRecord[]> {
  const supabase = await createClient();
  let query = supabase
    .from("ai_cost_events")
    .select("*")
    .eq("account_id", accountId);
  if (opts.from) query = query.gte("created_at", opts.from);
  if (opts.to) query = query.lte("created_at", opts.to);
  query = query.order("created_at", { ascending: false });
  if (opts.limit !== undefined) query = query.limit(opts.limit);
  const { data, error } = await query;
  if (error) {
    throw new Error(`ai_cost_events.listByAccount failed: ${error.message}`);
  }
  return (data ?? []).map((r) => rowToRecord(r as AiCostEventRow));
}

/** Filters for an owner/admin AI analytics range read (COST-7). */
export interface AiCostAnalyticsQuery {
  /** Inclusive lower bound on created_at (ISO timestamp). */
  from?: string;
  /** Inclusive upper bound on created_at (ISO timestamp). */
  to?: string;
  /** Optional single-account scope (owner viewing one account). */
  accountId?: string;
  /** Optional single-feature scope. */
  feature?: AiCostFeature;
  /** Optional row cap (defense against unbounded loads). */
  limit?: number;
}

/**
 * Owner/admin cross-user range read for AI analytics (COST-7).
 *
 * Uses the SERVICE-ROLE client and therefore BYPASSES RLS — it is for
 * server-side owner/admin analytics ONLY. Never wire it into a normal-user
 * path; per-user surfaces use the RLS-gated `listByWorkflow` or pass an
 * explicit `userId` filter here behind an admin authorization check.
 */
export async function listEventsForAnalytics(
  q: AiCostAnalyticsQuery = {},
): Promise<readonly AiCostEventRecord[]> {
  const supabase = getServiceRoleClient(
    "analytics: ai_cost_events range read (owner/admin)",
  );
  let query = supabase.from("ai_cost_events").select("*");
  if (q.from) query = query.gte("created_at", q.from);
  if (q.to) query = query.lte("created_at", q.to);
  if (q.accountId) query = query.eq("account_id", q.accountId);
  if (q.feature) query = query.eq("feature", q.feature);
  query = query.order("created_at", { ascending: false });
  if (q.limit !== undefined) query = query.limit(q.limit);
  const { data, error } = await query;
  if (error) {
    throw new Error(
      `ai_cost_events.listEventsForAnalytics failed: ${error.message}`,
    );
  }
  return (data ?? []).map((r) => rowToRecord(r as AiCostEventRow));
}
