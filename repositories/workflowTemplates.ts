import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import type {
  WorkflowTemplateRecord,
  MarketplaceTemplateSummary,
  WorkflowTemplateUsageEventRecord,
  TemplateDefinition,
  TemplateSource,
  TemplateVisibility,
  TemplateUsageEventType,
} from "@/contracts/workflowTemplate";

/**
 * Repository for `workflow_templates` + `workflow_template_usage_events`
 * (Slice 4.WORKFLOW-PORTABILITY-TEMPLATES-TIER-POLICY-4 / CS-XT-4;
 * marketplace + ledger in 4.WORKFLOW-TEMPLATES-MARKETPLACE-2 / CS-XT-4B).
 *
 * Service-role WRITES (no authenticated write GRANT exists — future create/publish/use
 * routes go through here after validating role + tier limit + sanitizing). Reads here are
 * service-role; the membership + marketplace SELECT policies additionally let future
 * routes read via the RLS client.
 *
 * NO-LEAK: the INTERNAL record carries `accountId` / `createdByUserId`; the PUBLIC
 * {@link MarketplaceTemplateSummary} projection OMITS both and exposes only the safe
 * display-name snapshot + the official badge. The usage ledger is service-role only and
 * never client-reachable. NO integrations / workflow_node_credentials lookups anywhere.
 *
 * CS-XT-4B wires no caller; this repository changes no runtime behavior.
 */

interface WorkflowTemplatesRow {
  id: string;
  account_id: string | null;
  created_by_user_id: string | null;
  name: string;
  description: string | null;
  source: TemplateSource;
  visibility: TemplateVisibility;
  definition: unknown;
  schema_version: number;
  published_at: string | null;
  unpublished_at: string | null;
  forked_from_template_id: string | null;
  creator_display_name_snapshot: string | null;
  usage_count: number;
  fork_count: number;
  created_at: string;
  updated_at: string;
}

/** Full (internal) column list. */
const TEMPLATE_COLUMNS =
  "id, account_id, created_by_user_id, name, description, source, visibility, definition, schema_version, published_at, unpublished_at, forked_from_template_id, creator_display_name_snapshot, usage_count, fork_count, created_at, updated_at";

function rowToRecord(row: WorkflowTemplatesRow): WorkflowTemplateRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    createdByUserId: row.created_by_user_id,
    name: row.name,
    description: row.description,
    source: row.source,
    visibility: row.visibility,
    definition: (row.definition ?? { nodes: [], edges: [] }) as TemplateDefinition,
    schemaVersion: row.schema_version,
    publishedAt: row.published_at,
    unpublishedAt: row.unpublished_at,
    forkedFromTemplateId: row.forked_from_template_id,
    creatorDisplayNameSnapshot: row.creator_display_name_snapshot,
    usageCount: row.usage_count,
    forkCount: row.fork_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** PUBLIC-safe projection — OMITS account_id + created_by_user_id (no tenant/identity leak). */
function rowToMarketplaceSummary(row: WorkflowTemplatesRow): MarketplaceTemplateSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    source: row.source,
    isOfficial: row.source === "official",
    visibility: row.visibility,
    creatorDisplayName: row.creator_display_name_snapshot,
    usageCount: row.usage_count,
    forkCount: row.fork_count,
    forkedFromTemplateId: row.forked_from_template_id,
    publishedAt: row.published_at,
    schemaVersion: row.schema_version,
    createdAt: row.created_at,
  };
}

/** Marketplace columns — the public-safe subset (no account_id / created_by_user_id). */
const MARKETPLACE_COLUMNS =
  "id, name, description, source, visibility, creator_display_name_snapshot, usage_count, fork_count, forked_from_template_id, published_at, schema_version, created_at";

export interface CreateWorkflowTemplateInput {
  /** Required for `source: 'user'`; MUST be null for `source: 'official'` (DB invariant). */
  accountId: string | null;
  createdByUserId: string | null;
  name: string;
  description?: string | null;
  /** MUST be sanitized (credential-free) — callers go through the create service. */
  definition: TemplateDefinition;
  schemaVersion: number;
  /** Defaults to 'user'. */
  source?: TemplateSource;
  /** Defaults to 'private'. */
  visibility?: TemplateVisibility;
  forkedFromTemplateId?: string | null;
  /** SAFE display-name snapshot (never email / id). */
  creatorDisplayNameSnapshot?: string | null;
  publishedAt?: string | null;
}

/**
 * Insert a template. Service-role. `definition` MUST already be sanitized (the enforcing
 * helper is `services/workflows/createTemplateFromWorkflow.ts`). For an OFFICIAL template
 * pass `accountId: null, source: 'official'`; the DB invariant rejects mismatches.
 */
export async function createTemplateServiceRole(
  input: CreateWorkflowTemplateInput,
): Promise<WorkflowTemplateRecord> {
  const supabase = getServiceRoleClient(`workflow_templates: create ${input.accountId ?? "official"}`);
  const { data, error } = await supabase
    .from("workflow_templates")
    .insert({
      account_id: input.accountId,
      created_by_user_id: input.createdByUserId,
      name: input.name,
      description: input.description ?? null,
      source: input.source ?? "user",
      visibility: input.visibility ?? "private",
      definition: input.definition,
      schema_version: input.schemaVersion,
      forked_from_template_id: input.forkedFromTemplateId ?? null,
      creator_display_name_snapshot: input.creatorDisplayNameSnapshot ?? null,
      published_at: input.publishedAt ?? null,
    })
    .select(TEMPLATE_COLUMNS)
    .single<WorkflowTemplatesRow>();
  if (error || !data) {
    throw new Error(
      `workflow_templates.createTemplateServiceRole failed: ${error?.message ?? "no row"}`,
    );
  }
  return rowToRecord(data);
}

/** All templates for an account (private + public alike), newest first. Internal record. */
export async function listTemplatesByAccountServiceRole(
  accountId: string,
): Promise<readonly WorkflowTemplateRecord[]> {
  const supabase = getServiceRoleClient(`workflow_templates: listByAccount ${accountId}`);
  const { data, error } = await supabase
    .from("workflow_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(`workflow_templates.listTemplatesByAccountServiceRole failed: ${error.message}`);
  }
  return (data ?? []).map((r) => rowToRecord(r as WorkflowTemplatesRow));
}

/**
 * List the MARKETPLACE catalog — official templates + public user templates — as the
 * public-safe summary (no account_id / user id). Newest published first. Unlisted
 * templates are intentionally EXCLUDED from listings (they are link-access only).
 */
export async function listMarketplaceTemplatesServiceRole(): Promise<
  readonly MarketplaceTemplateSummary[]
> {
  const supabase = getServiceRoleClient("workflow_templates: listMarketplace");
  const { data, error } = await supabase
    .from("workflow_templates")
    .select(MARKETPLACE_COLUMNS)
    .or("source.eq.official,visibility.eq.public")
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(`workflow_templates.listMarketplaceTemplatesServiceRole failed: ${error.message}`);
  }
  return (data ?? []).map((r) => rowToMarketplaceSummary(r as WorkflowTemplatesRow));
}

/**
 * Fetch a single template scoped to its account (no cross-account existence leak). Internal
 * record (includes the definition for the owner's edit/use path).
 */
export async function getTemplateByIdServiceRole(
  accountId: string,
  templateId: string,
): Promise<WorkflowTemplateRecord | null> {
  const supabase = getServiceRoleClient(`workflow_templates: getById ${accountId}/${templateId}`);
  const { data, error } = await supabase
    .from("workflow_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("id", templateId)
    .eq("account_id", accountId)
    .maybeSingle<WorkflowTemplatesRow>();
  if (error) {
    throw new Error(`workflow_templates.getTemplateByIdServiceRole failed: ${error.message}`);
  }
  return data ? rowToRecord(data) : null;
}

/**
 * Fetch a single MARKETPLACE-reachable template by id (official, or public/unlisted) as
 * the INTERNAL record (callers needing the definition to instantiate). Returns null when
 * the id is private/non-existent — so a private template never leaks through this path.
 */
export async function getMarketplaceTemplateByIdServiceRole(
  templateId: string,
): Promise<WorkflowTemplateRecord | null> {
  const supabase = getServiceRoleClient(`workflow_templates: getMarketplaceById ${templateId}`);
  const { data, error } = await supabase
    .from("workflow_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("id", templateId)
    .or("source.eq.official,visibility.eq.public,visibility.eq.unlisted")
    .maybeSingle<WorkflowTemplatesRow>();
  if (error) {
    throw new Error(`workflow_templates.getMarketplaceTemplateByIdServiceRole failed: ${error.message}`);
  }
  return data ? rowToRecord(data) : null;
}

/**
 * Count an account's USER templates — the input to the tier-limit gate (CS-XT-5).
 * Service-role, exact head count.
 */
export async function countTemplatesByAccountServiceRole(accountId: string): Promise<number> {
  const supabase = getServiceRoleClient(`workflow_templates: countByAccount ${accountId}`);
  const { count, error } = await supabase
    .from("workflow_templates")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("source", "user");
  if (error) {
    throw new Error(
      `workflow_templates.countTemplatesByAccountServiceRole failed: ${error.message}`,
    );
  }
  return count ?? 0;
}

/** Hard-delete a template scoped to its account. Idempotent (true if a row was removed). */
export async function deleteTemplateServiceRole(
  accountId: string,
  templateId: string,
): Promise<{ deleted: boolean }> {
  const supabase = getServiceRoleClient(`workflow_templates: delete ${accountId}/${templateId}`);
  const { data, error } = await supabase
    .from("workflow_templates")
    .delete()
    .eq("id", templateId)
    .eq("account_id", accountId)
    .select("id");
  if (error) {
    throw new Error(`workflow_templates.deleteTemplateServiceRole failed: ${error.message}`);
  }
  return { deleted: (data ?? []).length > 0 };
}

// ── Usage ledger (service-role only) ─────────────────────────────────────────

interface UsageEventRow {
  id: string;
  template_id: string;
  actor_user_id: string | null;
  target_account_id: string | null;
  event_type: TemplateUsageEventType;
  created_workflow_id: string | null;
  created_template_id: string | null;
  created_at: string;
}

function rowToUsageEvent(row: UsageEventRow): WorkflowTemplateUsageEventRecord {
  return {
    id: row.id,
    templateId: row.template_id,
    actorUserId: row.actor_user_id,
    targetAccountId: row.target_account_id,
    eventType: row.event_type,
    createdWorkflowId: row.created_workflow_id,
    createdTemplateId: row.created_template_id,
    createdAt: row.created_at,
  };
}

export interface RecordTemplateUsageEventInput {
  templateId: string;
  actorUserId: string | null;
  targetAccountId: string | null;
  eventType: TemplateUsageEventType;
  createdWorkflowId?: string | null;
  createdTemplateId?: string | null;
}

/**
 * Record one usage-ledger event (service-role). The DB AFTER-INSERT trigger bumps the
 * template's denormalized usage_count / fork_count, so callers never touch the counters.
 * This is the future contributor-reward source of truth.
 */
export async function recordTemplateUsageEventServiceRole(
  input: RecordTemplateUsageEventInput,
): Promise<WorkflowTemplateUsageEventRecord> {
  const supabase = getServiceRoleClient(`workflow_template_usage_events: record ${input.templateId}`);
  const { data, error } = await supabase
    .from("workflow_template_usage_events")
    .insert({
      template_id: input.templateId,
      actor_user_id: input.actorUserId,
      target_account_id: input.targetAccountId,
      event_type: input.eventType,
      created_workflow_id: input.createdWorkflowId ?? null,
      created_template_id: input.createdTemplateId ?? null,
    })
    .select("id, template_id, actor_user_id, target_account_id, event_type, created_workflow_id, created_template_id, created_at")
    .single<UsageEventRow>();
  if (error || !data) {
    throw new Error(
      `workflow_template_usage_events.recordTemplateUsageEventServiceRole failed: ${error?.message ?? "no row"}`,
    );
  }
  return rowToUsageEvent(data);
}

/** Count usage events for a template (optionally filtered by type). Service-role. */
export async function countUsageEventsByTemplateServiceRole(
  templateId: string,
  eventType?: TemplateUsageEventType,
): Promise<number> {
  const supabase = getServiceRoleClient(`workflow_template_usage_events: count ${templateId}`);
  let query = supabase
    .from("workflow_template_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("template_id", templateId);
  if (eventType) query = query.eq("event_type", eventType);
  const { count, error } = await query;
  if (error) {
    throw new Error(
      `workflow_template_usage_events.countUsageEventsByTemplateServiceRole failed: ${error.message}`,
    );
  }
  return count ?? 0;
}
