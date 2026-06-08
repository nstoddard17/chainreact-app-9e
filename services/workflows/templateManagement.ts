import type { MembershipRole } from "@/contracts/accounts";
import type {
  AccountTemplateSummary,
  MarketplaceTemplateSummary,
  TemplateVisibility,
  WorkflowTemplateRecord,
} from "@/contracts/workflowTemplate";
import * as templatesRepo from "@/repositories/workflowTemplates";
import * as workflowsRepo from "@/repositories/workflows";
import * as userProfilesRepo from "@/repositories/userProfiles";
import { createTemplateFromWorkflow } from "@/services/workflows/createTemplateFromWorkflow";
import { resolveAccountCapabilities } from "@/services/billing/planCapabilities";
import { templateLimitFor } from "@/core/billing/planPolicy";

/**
 * Workflow-template management service (Slice 4.WORKFLOW-TEMPLATES-MARKETPLACE-3 / CS-XT-5A).
 *
 * Holds the create/list/update/delete/publish business logic + the gates the routes are too
 * thin to own: TIER enforcement (Free can't author; Pro/Team/Business/Enterprise capped by
 * `templateLimit`), CREATOR ownership (only the original author edits the original; the
 * account owner may delete for moderation), same-account workflow binding, and the no-leak
 * publish-metadata handling (publish timestamps + a SAFE display-name snapshot). The route
 * owns auth + the membership ROLE gate; this service owns everything plan/ownership/content.
 *
 * SANITIZATION: create always goes through `createTemplateFromWorkflow` (export sanitizer),
 * so a template never holds a credential and the raw draftDefinition is never stored. A
 * client can never set source/account_id/counters/snapshot — those are server-decided here.
 */

function toAccountSummary(r: WorkflowTemplateRecord): AccountTemplateSummary {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    source: r.source,
    visibility: r.visibility,
    createdByUserId: r.createdByUserId,
    forkedFromTemplateId: r.forkedFromTemplateId,
    usageCount: r.usageCount,
    forkCount: r.forkCount,
    publishedAt: r.publishedAt,
    unpublishedAt: r.unpublishedAt,
    schemaVersion: r.schemaVersion,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** List the account's own templates (account-internal summaries; no definition). */
export async function listAccountTemplates(accountId: string): Promise<AccountTemplateSummary[]> {
  const records = await templatesRepo.listTemplatesByAccountServiceRole(accountId);
  return records.map(toAccountSummary);
}

/** The public marketplace catalog (official + public), safe summaries only. */
export async function listMarketplaceTemplates(): Promise<readonly MarketplaceTemplateSummary[]> {
  return templatesRepo.listMarketplaceTemplatesServiceRole();
}

// ── create ───────────────────────────────────────────────────────────────────

export type CreateTemplateReason = "tier_forbidden" | "limit_reached" | "workflow_not_found";

export type CreateTemplateResult =
  | { ok: true; template: AccountTemplateSummary }
  | { ok: false; reason: "tier_forbidden" }
  | { ok: false; reason: "limit_reached"; limit: number; count: number }
  | { ok: false; reason: "workflow_not_found" };

export interface CreateTemplateInput {
  accountId: string;
  actorUserId: string;
  workflowId: string;
  name?: string;
  description?: string | null;
  visibility?: TemplateVisibility;
  /** Injectable clock (deterministic in tests). */
  now?: () => string;
}

export async function createAccountTemplate(input: CreateTemplateInput): Promise<CreateTemplateResult> {
  const nowIso = (input.now ?? (() => new Date().toISOString()))();

  // 1. Tier: plan must permit custom templates (Free → blocked) + be under the cap.
  const { plan, capabilities } = await resolveAccountCapabilities(input.accountId);
  if (!capabilities.canCreateTemplates) return { ok: false, reason: "tier_forbidden" };
  const limit = templateLimitFor(plan); // null = unlimited (enterprise)
  if (limit !== null) {
    const count = await templatesRepo.countTemplatesByAccountServiceRole(input.accountId);
    if (count >= limit) return { ok: false, reason: "limit_reached", limit, count };
  }

  // 2. Source workflow must exist AND belong to THIS account (no cross-account templating).
  const workflow = await workflowsRepo.getById(input.workflowId);
  if (!workflow || workflow.state === "deleted" || workflow.accountId !== input.accountId) {
    return { ok: false, reason: "workflow_not_found" };
  }

  // 3. Publish metadata for a non-private create (server-decided, never client-supplied).
  const visibility = input.visibility ?? "private";
  const publishing = visibility !== "private";
  const creatorDisplayNameSnapshot = publishing
    ? await userProfilesRepo.getDisplayName(input.actorUserId)
    : null;

  const record = await createTemplateFromWorkflow({
    workflow,
    name: input.name,
    description: input.description ?? null,
    createdByUserId: input.actorUserId,
    visibility,
    publishedAt: publishing ? nowIso : null,
    creatorDisplayNameSnapshot,
  });
  return { ok: true, template: toAccountSummary(record) };
}

// ── update (creator-only) ──────────────────────────────────────────────────────

export type UpdateTemplateResult =
  | { ok: true; template: AccountTemplateSummary }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "forbidden_not_creator" };

export interface UpdateTemplateInput {
  accountId: string;
  actorUserId: string;
  templateId: string;
  name?: string;
  description?: string | null;
  visibility?: TemplateVisibility;
  now?: () => string;
}

export async function updateAccountTemplate(input: UpdateTemplateInput): Promise<UpdateTemplateResult> {
  const nowIso = (input.now ?? (() => new Date().toISOString()))();
  const existing = await templatesRepo.getTemplateByIdServiceRole(input.accountId, input.templateId);
  if (!existing) return { ok: false, reason: "not_found" };
  // Only the ORIGINAL creator may edit the original — a non-creator owner/admin cannot mutate
  // someone else's (possibly public) template. Forking/copying is a later slice.
  if (existing.createdByUserId !== input.actorUserId) {
    return { ok: false, reason: "forbidden_not_creator" };
  }

  const patch: templatesRepo.UpdateTemplateMetadataPatch = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;

  if (input.visibility !== undefined && input.visibility !== existing.visibility) {
    patch.visibility = input.visibility;
    if (input.visibility === "private") {
      // Unpublish — record when, keep published_at as history.
      patch.unpublishedAt = nowIso;
    } else {
      // Publish (public/unlisted) — first publish stamps published_at + a safe snapshot.
      patch.unpublishedAt = null;
      if (existing.publishedAt === null) patch.publishedAt = nowIso;
      if (existing.creatorDisplayNameSnapshot === null) {
        patch.creatorDisplayNameSnapshot = await userProfilesRepo.getDisplayName(input.actorUserId);
      }
    }
  }

  const updated = await templatesRepo.updateTemplateMetadataServiceRole(
    input.accountId,
    input.templateId,
    patch,
  );
  if (!updated) return { ok: false, reason: "not_found" };
  return { ok: true, template: toAccountSummary(updated) };
}

// ── delete (creator OR account owner) ──────────────────────────────────────────

export type DeleteTemplateResult =
  | { ok: true }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "forbidden_not_creator" };

export interface DeleteTemplateInput {
  accountId: string;
  actorUserId: string;
  /** The caller's resolved membership role (the route already gated owner/admin). */
  actorRole: MembershipRole;
  templateId: string;
}

export async function deleteAccountTemplate(input: DeleteTemplateInput): Promise<DeleteTemplateResult> {
  const existing = await templatesRepo.getTemplateByIdServiceRole(input.accountId, input.templateId);
  if (!existing) return { ok: false, reason: "not_found" };
  // Creator deletes their own; the account OWNER may delete any (moderation / account control).
  const allowed = existing.createdByUserId === input.actorUserId || input.actorRole === "owner";
  if (!allowed) return { ok: false, reason: "forbidden_not_creator" };

  await templatesRepo.deleteTemplateServiceRole(input.accountId, input.templateId);
  return { ok: true };
}
