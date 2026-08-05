import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import { asTypedDb } from "./supabase/typedDb";
import { narrowColumn } from "@/core/database/columnNarrowing";
import { toJsonColumn } from "@/core/database/jsonColumn";
import type { TableColumns, TableInsert, TableUpdate } from "@/types/tables";
import {
  TEMPLATE_SOURCES,
  TEMPLATE_VISIBILITIES,
  TEMPLATE_USAGE_EVENT_TYPES,
  TemplateDefinitionSchema,
} from "@/contracts/workflowTemplate";
import type {
  WorkflowTemplateRecord,
  MarketplaceTemplateSummary,
  WorkflowTemplateUsageEventRecord,
  TemplateDefinition,
  TemplateSource,
  TemplateVisibility,
  TemplateUsageEventType,
} from "@/contracts/workflowTemplate";
import { deriveTemplateCardMeta } from "@/core/workflows/templateCardMeta";

/**
 * SUPABASE-TABLE-TYPING-1D — the persisted template graph.
 *
 * `definition` used to be `(row.definition ?? {nodes:[],edges:[]}) as
 * TemplateDefinition` in BOTH projections: an unchecked shape assertion plus a
 * silent empty-graph substitution. The apply path in
 * `services/workflows/templateManagement.ts` does re-validate before creating
 * or replacing a workflow, so the product was protected — but the marketplace
 * CARD is derived HERE, from this value, and a card derived from a fabricated
 * empty graph would advertise a template that has no nodes.
 *
 * The authoritative `TemplateDefinitionSchema` now decides. An invalid graph is
 * reported via `definitionInvalid` and yields an EMPTY definition — it is never
 * presented as a valid template the user can apply.
 */
function parseTemplateDefinition(
  templateId: string,
  raw: unknown,
): { definition: TemplateDefinition; invalid: boolean } {
  const parsed = TemplateDefinitionSchema.safeParse(raw ?? {});
  if (parsed.success) return { definition: parsed.data, invalid: false };
  // Id + outcome only — never the stored graph or any node config.
  console.warn(
    `[workflow_templates] definition for template ${templateId} failed schema validation — not applicable (definitionInvalid=true).`,
  );
  return { definition: { nodes: [], edges: [] }, invalid: true };
}

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

type WorkflowTemplatesRow = TableColumns<
  "workflow_templates",
  | "id"
  | "account_id"
  | "created_by_user_id"
  | "name"
  | "description"
  | "source"
  | "visibility"
  | "definition"
  | "schema_version"
  | "published_at"
  | "unpublished_at"
  | "forked_from_template_id"
  | "creator_display_name_snapshot"
  | "usage_count"
  | "fork_count"
  | "created_at"
  | "updated_at"
>;

/**
 * The PUBLIC-safe projection is genuinely narrower — `MARKETPLACE_COLUMNS`
 * omits `account_id` and `created_by_user_id` precisely so no tenant identity
 * can leak. It used to be typed as the full internal row, which meant the
 * no-leak guarantee rested on a comment rather than the type. Now a marketplace
 * query that started selecting `account_id` would not compile into this mapper.
 */
type MarketplaceTemplateRow = TableColumns<
  "workflow_templates",
  | "id"
  | "name"
  | "description"
  | "source"
  | "visibility"
  | "creator_display_name_snapshot"
  | "usage_count"
  | "fork_count"
  | "forked_from_template_id"
  | "published_at"
  | "schema_version"
  | "created_at"
  | "definition"
>;

function narrowSource(templateId: string, value: string): TemplateSource {
  return narrowColumn(`workflow_templates.source(${templateId})`, TEMPLATE_SOURCES, value);
}

function narrowVisibility(templateId: string, value: string): TemplateVisibility {
  return narrowColumn(
    `workflow_templates.visibility(${templateId})`,
    TEMPLATE_VISIBILITIES,
    value,
  );
}

/** Full (internal) column list. */
const TEMPLATE_COLUMNS =
  "id, account_id, created_by_user_id, name, description, source, visibility, definition, schema_version, published_at, unpublished_at, forked_from_template_id, creator_display_name_snapshot, usage_count, fork_count, created_at, updated_at";

function rowToRecord(row: WorkflowTemplatesRow): WorkflowTemplateRecord {
  const parsed = parseTemplateDefinition(row.id, row.definition);
  return {
    id: row.id,
    accountId: row.account_id,
    createdByUserId: row.created_by_user_id,
    name: row.name,
    description: row.description,
    source: narrowSource(row.id, row.source),
    visibility: narrowVisibility(row.id, row.visibility),
    definition: parsed.definition,
    definitionInvalid: parsed.invalid,
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

/**
 * PUBLIC-safe projection — OMITS account_id + created_by_user_id (no tenant/identity leak).
 *
 * `card` is DERIVED here from the definition (reads only node provider/type/kind — never config)
 * so the raw definition NEVER leaves this layer: the client gets the safe browse metadata
 * (providers, counts, category, trigger kind, preview chain) but not the JSON. See
 * {@link deriveTemplateCardMeta}.
 */
function rowToMarketplaceSummary(row: MarketplaceTemplateRow): MarketplaceTemplateSummary {
  const source = narrowSource(row.id, row.source);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    source,
    isOfficial: source === "official",
    visibility: narrowVisibility(row.id, row.visibility),
    creatorDisplayName: row.creator_display_name_snapshot,
    usageCount: row.usage_count,
    forkCount: row.fork_count,
    forkedFromTemplateId: row.forked_from_template_id,
    publishedAt: row.published_at,
    schemaVersion: row.schema_version,
    createdAt: row.created_at,
    // The card is DERIVED from the validated definition — an unparseable graph
    // yields an empty card rather than a card describing a fabricated graph.
    card: deriveTemplateCardMeta(parseTemplateDefinition(row.id, row.definition).definition),
  };
}

/**
 * Marketplace columns — the public-safe subset (no account_id / created_by_user_id). Includes
 * `definition` so the projection can DERIVE the safe `card` metadata; the raw definition itself
 * is consumed here and never returned to the client.
 */
const MARKETPLACE_COLUMNS =
  "id, name, description, source, visibility, creator_display_name_snapshot, usage_count, fork_count, forked_from_template_id, published_at, schema_version, created_at, definition";

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
  const supabase = asTypedDb(getServiceRoleClient(`workflow_templates: create ${input.accountId ?? "official"}`));
  const { data, error } = await supabase
    .from("workflow_templates")
    .insert({
      account_id: input.accountId,
      created_by_user_id: input.createdByUserId,
      name: input.name,
      description: input.description ?? null,
      source: input.source ?? "user",
      visibility: input.visibility ?? "private",
      definition: toJsonColumn("workflow_templates.definition", input.definition),
      schema_version: input.schemaVersion,
      forked_from_template_id: input.forkedFromTemplateId ?? null,
      creator_display_name_snapshot: input.creatorDisplayNameSnapshot ?? null,
      published_at: input.publishedAt ?? null,
    } satisfies TableInsert<"workflow_templates">)
    .select(TEMPLATE_COLUMNS)
    .single();
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
  const supabase = asTypedDb(getServiceRoleClient(`workflow_templates: listByAccount ${accountId}`));
  const { data, error } = await supabase
    .from("workflow_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(`workflow_templates.listTemplatesByAccountServiceRole failed: ${error.message}`);
  }
  return (data ?? []).map(rowToRecord);
}

/**
 * List the MARKETPLACE catalog — official templates + public user templates — as the
 * public-safe summary (no account_id / user id). Newest published first. Unlisted
 * templates are intentionally EXCLUDED from listings (they are link-access only).
 */
export async function listMarketplaceTemplatesServiceRole(): Promise<
  readonly MarketplaceTemplateSummary[]
> {
  const supabase = asTypedDb(getServiceRoleClient("workflow_templates: listMarketplace"));
  const { data, error } = await supabase
    .from("workflow_templates")
    .select(MARKETPLACE_COLUMNS)
    .or("source.eq.official,visibility.eq.public")
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(`workflow_templates.listMarketplaceTemplatesServiceRole failed: ${error.message}`);
  }
  return (data ?? []).map(rowToMarketplaceSummary);
}

/**
 * List ONLY the OFFICIAL (platform-owned) catalog as the public-safe summary — the input to the
 * deterministic official-template matcher (4.REACT-AGENT-TEMPLATE-MATCH-1). Filters
 * `source = 'official'` (which the DB invariant ties to `account_id IS NULL`), so NO user-created
 * or account-private template can ever enter the global matcher. Newest first. The raw definition
 * is consumed here only to derive the safe `card`; it never leaves this layer.
 */
export async function listOfficialTemplatesServiceRole(): Promise<
  readonly MarketplaceTemplateSummary[]
> {
  const supabase = asTypedDb(getServiceRoleClient("workflow_templates: listOfficial"));
  const { data, error } = await supabase
    .from("workflow_templates")
    .select(MARKETPLACE_COLUMNS)
    .eq("source", "official")
    .is("account_id", null)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(`workflow_templates.listOfficialTemplatesServiceRole failed: ${error.message}`);
  }
  return (data ?? []).map(rowToMarketplaceSummary);
}

/**
 * Fetch a single template scoped to its account (no cross-account existence leak). Internal
 * record (includes the definition for the owner's edit/use path).
 */
export async function getTemplateByIdServiceRole(
  accountId: string,
  templateId: string,
): Promise<WorkflowTemplateRecord | null> {
  const supabase = asTypedDb(getServiceRoleClient(`workflow_templates: getById ${accountId}/${templateId}`));
  const { data, error } = await supabase
    .from("workflow_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("id", templateId)
    .eq("account_id", accountId)
    .maybeSingle();
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
  const supabase = asTypedDb(getServiceRoleClient(`workflow_templates: getMarketplaceById ${templateId}`));
  const { data, error } = await supabase
    .from("workflow_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("id", templateId)
    .or("source.eq.official,visibility.eq.public,visibility.eq.unlisted")
    .maybeSingle();
  if (error) {
    throw new Error(`workflow_templates.getMarketplaceTemplateByIdServiceRole failed: ${error.message}`);
  }
  return data ? rowToRecord(data) : null;
}

/**
 * Fetch a single template by id ACROSS accounts (CS-XT-5B) — for the use/fork access
 * resolver, which must read the row's visibility/source/account_id to decide access
 * (public/official → any authed user; private → owning-account members only). The CALLER
 * (templateManagement.resolveTemplateForAccess) enforces that access rule; this raw read
 * is service-role and MUST NOT be returned to a client without that gate. Returns the full
 * internal record (so the caller sees `accountId` for the membership check) or null.
 */
export async function getTemplateByIdAnyAccountServiceRole(
  templateId: string,
): Promise<WorkflowTemplateRecord | null> {
  const supabase = asTypedDb(getServiceRoleClient(`workflow_templates: getByIdAnyAccount ${templateId}`));
  const { data, error } = await supabase
    .from("workflow_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("id", templateId)
    .maybeSingle();
  if (error) {
    throw new Error(`workflow_templates.getTemplateByIdAnyAccountServiceRole failed: ${error.message}`);
  }
  return data ? rowToRecord(data) : null;
}

/**
 * Count an account's USER templates — the input to the tier-limit gate (CS-XT-5).
 * Service-role, exact head count.
 */
export async function countTemplatesByAccountServiceRole(accountId: string): Promise<number> {
  const supabase = asTypedDb(getServiceRoleClient(`workflow_templates: countByAccount ${accountId}`));
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
  const supabase = asTypedDb(getServiceRoleClient(`workflow_templates: delete ${accountId}/${templateId}`));
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

/**
 * Update SAFE metadata on a template, scoped to its account (no cross-account write). Only
 * the provided fields are written — callers (the management service) decide name /
 * description / visibility / publish-timestamps / creator snapshot; the repo never invents
 * them. Returns the updated record, or null when the id is absent / belongs to another
 * account. NEVER writes source / account_id / counters / definition.
 */
export interface UpdateTemplateMetadataPatch {
  name?: string;
  description?: string | null;
  visibility?: TemplateVisibility;
  publishedAt?: string | null;
  unpublishedAt?: string | null;
  creatorDisplayNameSnapshot?: string | null;
}

export async function updateTemplateMetadataServiceRole(
  accountId: string,
  templateId: string,
  patch: UpdateTemplateMetadataPatch,
): Promise<WorkflowTemplateRecord | null> {
  const update: TableUpdate<"workflow_templates"> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.visibility !== undefined) update.visibility = patch.visibility;
  if (patch.publishedAt !== undefined) update.published_at = patch.publishedAt;
  if (patch.unpublishedAt !== undefined) update.unpublished_at = patch.unpublishedAt;
  if (patch.creatorDisplayNameSnapshot !== undefined) {
    update.creator_display_name_snapshot = patch.creatorDisplayNameSnapshot;
  }

  const supabase = asTypedDb(getServiceRoleClient(`workflow_templates: update ${accountId}/${templateId}`));
  const { data, error } = await supabase
    .from("workflow_templates")
    .update(update)
    .eq("id", templateId)
    .eq("account_id", accountId)
    .select(TEMPLATE_COLUMNS)
    .maybeSingle();
  if (error) {
    throw new Error(`workflow_templates.updateTemplateMetadataServiceRole failed: ${error.message}`);
  }
  return data ? rowToRecord(data) : null;
}

// ── Usage ledger (service-role only) ─────────────────────────────────────────

type UsageEventRow = TableColumns<
  "workflow_template_usage_events",
  | "id"
  | "template_id"
  | "actor_user_id"
  | "target_account_id"
  | "event_type"
  | "created_workflow_id"
  | "created_template_id"
  | "created_at"
>;

function rowToUsageEvent(row: UsageEventRow): WorkflowTemplateUsageEventRecord {
  return {
    id: row.id,
    templateId: row.template_id,
    actorUserId: row.actor_user_id,
    targetAccountId: row.target_account_id,
    // CHECK-constrained text, generated as `string` — narrowed fail-closed so
    // an unrecognised ledger event can never be counted as a known one.
    eventType: narrowColumn(
      `workflow_template_usage_events.event_type(${row.id})`,
      TEMPLATE_USAGE_EVENT_TYPES,
      row.event_type,
    ),
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
  const supabase = asTypedDb(getServiceRoleClient(`workflow_template_usage_events: record ${input.templateId}`));
  const { data, error } = await supabase
    .from("workflow_template_usage_events")
    .insert({
      template_id: input.templateId,
      actor_user_id: input.actorUserId,
      target_account_id: input.targetAccountId,
      event_type: input.eventType,
      created_workflow_id: input.createdWorkflowId ?? null,
      created_template_id: input.createdTemplateId ?? null,
    } satisfies TableInsert<"workflow_template_usage_events">)
    .select("id, template_id, actor_user_id, target_account_id, event_type, created_workflow_id, created_template_id, created_at")
    .single();
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
  const supabase = asTypedDb(getServiceRoleClient(`workflow_template_usage_events: count ${templateId}`));
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
