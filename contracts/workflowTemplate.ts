import { z } from "zod";

/**
 * Contracts for account-owned workflow templates
 * (Slice 4.WORKFLOW-PORTABILITY-TEMPLATES-TIER-POLICY-4 / CS-XT-4).
 *
 * A template's `definition` is the CREDENTIAL-FREE, SANITIZED workflow graph — the same
 * shape the export sanitizer (services/workflows/exportWorkflow.ts
 * `sanitizeWorkflowDefinitionForExport`) produces. It is defined HERE (contracts, the
 * lowest layer) rather than imported from the service so the repository can type the
 * stored value without a reverse layer dependency. The export service's
 * `ExportedWorkflowDefinition` is structurally identical, so its output is directly
 * assignable to / validatable against `TemplateDefinition` — the create helper validates
 * the sanitizer output against `TemplateDefinitionSchema` before persistence as a
 * no-leak safety net.
 *
 * NO-LEAK: node/edge fields are WHITELISTED (any extra field — e.g. a leaked owner id —
 * is stripped by the schema), and the credential-bearing sibling tables (integrations,
 * workflow_node_credentials) are never part of this shape.
 */

/** A single node in a sanitized template graph — whitelisted fields only. */
export const TemplateNodeSchema = z
  .object({
    id: z.string().min(1),
    kind: z.string().min(1),
    provider: z.string().min(1),
    type: z.string(),
    displayName: z.string().optional(),
    position: z.object({ x: z.number(), y: z.number() }),
    /** Opaque, already-sanitized config (secrets/emails/ids redacted upstream). */
    config: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type TemplateNode = z.infer<typeof TemplateNodeSchema>;

/** A single edge in a sanitized template graph — whitelisted fields only. */
export const TemplateEdgeSchema = z
  .object({
    id: z.string().min(1),
    from: z.string().min(1),
    to: z.string().min(1),
    label: z.string().optional(),
  })
  .strict();
export type TemplateEdge = z.infer<typeof TemplateEdgeSchema>;

/** The sanitized, credential-free template graph. Mirrors `ExportedWorkflowDefinition`. */
export const TemplateDefinitionSchema = z
  .object({
    nodes: z.array(TemplateNodeSchema).default([]),
    edges: z.array(TemplateEdgeSchema).default([]),
  })
  .strict();
export type TemplateDefinition = z.infer<typeof TemplateDefinitionSchema>;

/** Origin of a template. Only 'user' today; 'builtin' is deferred (static catalog). */
export const TemplateSourceSchema = z.enum(["user"]);
export type TemplateSource = z.infer<typeof TemplateSourceSchema>;

/**
 * A stored workflow template record (repository DTO). Carries ONLY template fields — no
 * credentials, no Stripe/integration ids, no per-node grants.
 */
export interface WorkflowTemplateRecord {
  id: string;
  /** Owning account — the authority root. */
  accountId: string;
  /** Provenance only (nullable once the author is deleted). NOT authorization. */
  createdByUserId: string | null;
  name: string;
  description: string | null;
  source: TemplateSource;
  /** The sanitized, credential-free graph. */
  definition: TemplateDefinition;
  /** Export schema version the definition was produced under. */
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
}
