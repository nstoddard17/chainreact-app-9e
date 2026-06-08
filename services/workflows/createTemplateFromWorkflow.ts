import type { WorkflowRecord } from "@/repositories/workflows";
import {
  EXPORT_SCHEMA_VERSION,
  sanitizeWorkflowDefinitionForExport,
} from "@/services/workflows/exportWorkflow";
import { createTemplateServiceRole } from "@/repositories/workflowTemplates";
import {
  TemplateDefinitionSchema,
  type TemplateDefinition,
  type TemplateVisibility,
  type WorkflowTemplateRecord,
} from "@/contracts/workflowTemplate";

/**
 * Create a workflow template FROM a workflow, enforcing the no-leak sanitizer at the
 * service boundary (Slice 4.WORKFLOW-PORTABILITY-TEMPLATES-TIER-POLICY-4 / CS-XT-4).
 *
 * This is the ONLY supported way to mint a `source='user'` template. It runs the
 * workflow's `draftDefinition` through the SAME export sanitizer
 * (`sanitizeWorkflowDefinitionForExport`) that the credential-free export uses — so a
 * template can NEVER carry a token, secret, provider account label/email, integration
 * id, credential-owner id, or per-node grant. The sanitizer output is additionally
 * validated against `TemplateDefinitionSchema` (whitelisted node/edge fields) as a
 * belt-and-braces no-leak net before it reaches the DB.
 *
 * It reads ONLY the workflow's `name` + `draftDefinition` — never `integrations` or
 * `workflow_node_credentials`, which are structurally excluded. Role + tier-limit
 * enforcement is NOT here — it belongs to the future create route (CS-XT-5), which calls
 * this after gating. CS-XT-4 wires no caller; this helper changes no runtime behavior.
 */

export interface CreateTemplateFromWorkflowInput {
  /** The source workflow — only `name` + `draftDefinition` are read. */
  workflow: WorkflowRecord;
  /** Optional template name override (defaults to the workflow's name). */
  name?: string;
  /** Optional human description. */
  description?: string | null;
  /** Provenance — the user authoring the template (nullable for system callers). */
  createdByUserId: string | null;
  /** Marketplace visibility (defaults to 'private' at the repo). */
  visibility?: TemplateVisibility;
  /** Publish timestamp — set by the management service when created non-private. */
  publishedAt?: string | null;
  /** SAFE creator display-name snapshot (never email / id) — set by the service. */
  creatorDisplayNameSnapshot?: string | null;
}

/** Build the sanitized, validated template definition from a workflow record. */
export function buildSanitizedTemplateDefinition(workflow: WorkflowRecord): TemplateDefinition {
  // Reuse the export sanitizer (redaction + field whitelist), then re-validate against
  // the strict template schema so any unexpected field is dropped before persistence.
  const sanitized = sanitizeWorkflowDefinitionForExport(workflow.draftDefinition);
  return TemplateDefinitionSchema.parse(sanitized);
}

export async function createTemplateFromWorkflow(
  input: CreateTemplateFromWorkflowInput,
): Promise<WorkflowTemplateRecord> {
  const definition = buildSanitizedTemplateDefinition(input.workflow);
  return createTemplateServiceRole({
    accountId: input.workflow.accountId,
    createdByUserId: input.createdByUserId,
    name: input.name ?? input.workflow.name,
    description: input.description ?? null,
    definition,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    // source stays 'user' (repo default); a client can never mint an 'official' template.
    visibility: input.visibility,
    publishedAt: input.publishedAt,
    creatorDisplayNameSnapshot: input.creatorDisplayNameSnapshot,
  });
}
