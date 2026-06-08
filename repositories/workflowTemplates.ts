import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import type {
  WorkflowTemplateRecord,
  TemplateDefinition,
  TemplateSource,
} from "@/contracts/workflowTemplate";

/**
 * Repository for `workflow_templates`
 * (Slice 4.WORKFLOW-PORTABILITY-TEMPLATES-TIER-POLICY-4 / CS-XT-4).
 *
 * Service-role WRITES (no authenticated write GRANT exists — the future create route
 * goes through here after validating role + tier limit + sanitizing). Reads here are
 * also service-role for the foundation; the membership-gated SELECT policy additionally
 * lets a future list route read via the RLS client. All projections carry ONLY template
 * fields — never credentials, integration ids, Stripe ids, or per-node grants (none of
 * which exist in this table). NO integrations / workflow_node_credentials lookups.
 *
 * CS-XT-4 ships the data layer + helpers; no caller is wired yet, so this repository
 * changes no runtime behavior.
 */

interface WorkflowTemplatesRow {
  id: string;
  account_id: string;
  created_by_user_id: string | null;
  name: string;
  description: string | null;
  source: TemplateSource;
  definition: unknown;
  schema_version: number;
  created_at: string;
  updated_at: string;
}

/** Columns selected for the DTO — the full (non-secret) template row. */
const TEMPLATE_COLUMNS =
  "id, account_id, created_by_user_id, name, description, source, definition, schema_version, created_at, updated_at";

function rowToRecord(row: WorkflowTemplatesRow): WorkflowTemplateRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    createdByUserId: row.created_by_user_id,
    name: row.name,
    description: row.description,
    source: row.source,
    definition: (row.definition ?? { nodes: [], edges: [] }) as TemplateDefinition,
    schemaVersion: row.schema_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateWorkflowTemplateInput {
  accountId: string;
  createdByUserId: string | null;
  name: string;
  description?: string | null;
  /** MUST be sanitized (credential-free) — callers go through the create service. */
  definition: TemplateDefinition;
  schemaVersion: number;
}

/**
 * Insert a new (user) template. Service-role. The `definition` MUST already be sanitized
 * — the enforcing helper is `services/workflows/createTemplateFromWorkflow.ts`; do NOT
 * call this with a raw `workflows.draft_definition`. `source` is fixed to 'user'.
 */
export async function createTemplateServiceRole(
  input: CreateWorkflowTemplateInput,
): Promise<WorkflowTemplateRecord> {
  const supabase = getServiceRoleClient(`workflow_templates: create ${input.accountId}`);
  const { data, error } = await supabase
    .from("workflow_templates")
    .insert({
      account_id: input.accountId,
      created_by_user_id: input.createdByUserId,
      name: input.name,
      description: input.description ?? null,
      source: "user",
      definition: input.definition,
      schema_version: input.schemaVersion,
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

/** All templates for an account, newest first. Service-role. Template fields only. */
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
 * Fetch a single template scoped to its account, so a template id from another account
 * resolves to null (the caller maps that to a 404 with no cross-account existence leak).
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
 * Count an account's USER templates — the input to the tier-limit gate the future create
 * route enforces (count vs `templateLimitFor(plan)`; CS-XT-5). Service-role, exact head
 * count, no row payload.
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

/**
 * Hard-delete a template scoped to its account (templates have no trash/soft-delete —
 * simpler than workflows). Idempotent: returns true if a row was deleted, false if the
 * id was absent / belonged to another account.
 */
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
