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

/**
 * Origin of a template (CS-XT-4B): 'user' = account-authored; 'official' =
 * platform/ChainReact-made ("official" badge). Official templates are platform-owned
 * (account-less).
 */
export const TemplateSourceSchema = z.enum(["user", "official"]);
export type TemplateSource = z.infer<typeof TemplateSourceSchema>;

/**
 * Marketplace visibility (CS-XT-4B): 'private' (members only — default), 'public' (listed
 * in the marketplace), 'unlisted' (link-accessible, not listed).
 */
export const TemplateVisibilitySchema = z.enum(["private", "public", "unlisted"]);
export type TemplateVisibility = z.infer<typeof TemplateVisibilitySchema>;

/** Usage-ledger event kinds (CS-XT-4B) — the contributor-reward source of truth. */
export const TemplateUsageEventTypeSchema = z.enum([
  "used_to_create_workflow",
  "forked",
  "saved_copy",
]);
export type TemplateUsageEventType = z.infer<typeof TemplateUsageEventTypeSchema>;

/**
 * A stored workflow template record (INTERNAL repository DTO). Carries template fields +
 * marketplace metadata — no credentials, no Stripe/integration ids, no per-node grants.
 * `accountId` / `createdByUserId` are INTERNAL (the platform's own ownership/provenance)
 * and MUST NOT be surfaced to marketplace viewers — use {@link MarketplaceTemplateSummary}
 * for cross-account/public surfaces.
 */
export interface WorkflowTemplateRecord {
  id: string;
  /** Owning account — null for OFFICIAL (platform-owned) templates. Internal-only. */
  accountId: string | null;
  /** Provenance only (nullable once the author is deleted). NOT authorization. Internal. */
  createdByUserId: string | null;
  name: string;
  description: string | null;
  source: TemplateSource;
  visibility: TemplateVisibility;
  /** The sanitized, credential-free graph. */
  definition: TemplateDefinition;
  /** Export schema version the definition was produced under. */
  schemaVersion: number;
  /** Marketplace publish/unpublish timestamps (null until published). */
  publishedAt: string | null;
  unpublishedAt: string | null;
  /** The template this was forked/copied from (null = original). Lineage, not authority. */
  forkedFromTemplateId: string | null;
  /** SAFE display-name snapshot of the creator (never email / user id). */
  creatorDisplayNameSnapshot: string | null;
  /** Denormalized caches maintained by the usage ledger trigger. */
  usageCount: number;
  forkCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Marketplace browse categories (CS-XT-MARKETPLACE-UX). DERIVED for display/filtering only —
 * NOT a stored column. The category is computed from a template's node providers + trigger kind
 * by {@link deriveTemplateCardMeta} (core/workflows/templateCardMeta.ts). It is a best-effort UI
 * bucket, never authoritative metadata, so no schema/migration is needed.
 */
export const TEMPLATE_CATEGORY_KEYS = [
  "sales-crm",
  "marketing",
  "ecommerce",
  "team-ops",
  "project-management",
  "dev-engineering",
  "files-docs",
  "reporting",
  "personal-productivity",
] as const;
export type TemplateCategoryKey = (typeof TEMPLATE_CATEGORY_KEYS)[number];

/** How a template is started — drives the trigger-type badge on the card. */
export type TemplateTriggerKind = "manual" | "scheduled" | "app";

/** One node in the at-a-glance preview chain. Carries NO config — only the public node identity. */
export interface TemplateStepSummary {
  kind: "trigger" | "action";
  /** Provider id (public catalog id, e.g. "slack"). Never an account / resource id. */
  provider: string;
  /** Action/trigger type (public catalog id, e.g. "send_channel_message"). */
  type: string;
}

/**
 * SAFE, DERIVED card metadata for marketplace browsing (CS-XT-MARKETPLACE-UX). Computed from
 * the (credential-free) template definition so users can understand a template before clicking
 * Use — WITHOUT shipping the raw definition/JSON or any config to the client. Contains ONLY
 * public catalog facts: provider ids, action/trigger types, counts, a derived category, and the
 * trigger kind. Never a token, email, account/user/credential id, or config VALUE.
 */
export interface TemplateCardMeta {
  /** Total nodes (trigger + actions). */
  nodeCount: number;
  /** Action nodes only (nodeCount minus the single trigger). */
  stepCount: number;
  triggerKind: TemplateTriggerKind;
  /** Distinct non-native provider ids, in graph order (the "required apps"). */
  providers: string[];
  category: TemplateCategoryKey;
  /** Ordered preview chain (trigger → action → …), capped for display. */
  steps: TemplateStepSummary[];
}

/**
 * PUBLIC-SAFE marketplace summary (CS-XT-4B). Deliberately OMITS `accountId` and
 * `createdByUserId` (which tenant owns it / which raw user authored it) — a marketplace
 * viewer sees only the safe display-name snapshot + the `isOfficial` badge. Never exposes
 * credentials, emails, account membership, or internal ids.
 */
export interface MarketplaceTemplateSummary {
  id: string;
  name: string;
  description: string | null;
  source: TemplateSource;
  /** Convenience flag for the "official" badge (source === 'official'). */
  isOfficial: boolean;
  visibility: TemplateVisibility;
  /** Safe creator attribution — display-name snapshot only (no email / id). */
  creatorDisplayName: string | null;
  usageCount: number;
  forkCount: number;
  forkedFromTemplateId: string | null;
  publishedAt: string | null;
  schemaVersion: number;
  createdAt: string;
  /**
   * DERIVED, credential-free card metadata for browsing (CS-XT-MARKETPLACE-UX). Optional so
   * older callers / fixtures that don't compute it still typecheck and the card degrades
   * gracefully. The server (repository projection) always populates it; it carries only public
   * catalog facts — never the raw definition, config, or any id. See {@link TemplateCardMeta}.
   */
  card?: TemplateCardMeta;
}

/**
 * ACCOUNT-INTERNAL listing summary (CS-XT-5A) — what an account member sees on the
 * account's own Templates list. The raw `createdByUserId` is NEVER surfaced; the
 * server resolves the management affordance into a `canManage` boolean against the
 * authenticated viewer instead (data minimization — no internal user id reaches the
 * client). OMITS the `definition` (not needed for a list). Never carries credentials.
 */
export interface AccountTemplateSummary {
  id: string;
  name: string;
  description: string | null;
  source: TemplateSource;
  visibility: TemplateVisibility;
  /**
   * Server-computed: true when the authenticated viewer may manage (edit / publish /
   * delete) this template. Today that is creator-only — matching the service's
   * creator-edit gate. Replaces the raw `createdByUserId` so no internal id leaks.
   */
  canManage: boolean;
  forkedFromTemplateId: string | null;
  usageCount: number;
  forkCount: number;
  publishedAt: string | null;
  unpublishedAt: string | null;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
}

/** A usage-ledger row (INTERNAL — service-role only; never client-facing). */
export interface WorkflowTemplateUsageEventRecord {
  id: string;
  templateId: string;
  actorUserId: string | null;
  targetAccountId: string | null;
  eventType: TemplateUsageEventType;
  createdWorkflowId: string | null;
  createdTemplateId: string | null;
  createdAt: string;
}
