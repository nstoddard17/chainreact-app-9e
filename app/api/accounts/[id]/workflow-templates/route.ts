import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthedUserId, parseAccountBody } from "@/app/api/account/_shared";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import {
  listAccountTemplates,
  createAccountTemplate,
} from "@/services/workflows/templateManagement";

/**
 * /api/accounts/[id]/workflow-templates (Slice 4.WORKFLOW-TEMPLATES-MARKETPLACE-3 / CS-XT-5A).
 *   GET  — list this account's own templates (any member; summaries only, no definition).
 *   POST — create a template FROM an existing same-account workflow (owner/admin). Tier-gated
 *          (Free blocked; Pro/Team/Business capped by templateLimit); the definition is always
 *          run through the export sanitizer; the client can never set source/counters/snapshot.
 *
 * Non-member → 403 NOT_ACCOUNT_MEMBER (no existence oracle). No credentials / Stripe ids / raw
 * draftDefinition ever appear.
 */

function roleGateFailure(reason: "not_member" | "forbidden"): NextResponse {
  return NextResponse.json(
    reason === "not_member"
      ? { error: "You are not a member of this account.", code: "NOT_ACCOUNT_MEMBER" }
      : { error: "Insufficient permissions.", code: "FORBIDDEN" },
    { status: 403 },
  );
}

// .strict() → a client cannot set source / visibility='official' / usage_count / fork_count /
// account_id / creator snapshot / published_at. Only these fields are accepted.
const CreateTemplateBodySchema = z
  .object({
    workflowId: z.string().uuid("workflowId must be a workflow id."),
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    visibility: z.enum(["private", "public", "unlisted"]).optional(),
  })
  .strict();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;
  const { id: accountId } = await params;

  // Any member may LIST the account's templates.
  const role = await requireAccountRole(auth.userId, accountId, ["owner", "admin", "member"]);
  if (!role.ok) return roleGateFailure(role.reason);

  const templates = await listAccountTemplates(accountId);
  return NextResponse.json({ templates });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;
  const { id: accountId } = await params;

  // Authoring is owner/admin-only (personal owner is "owner"); a member cannot create.
  const role = await requireAccountRole(auth.userId, accountId, ["owner", "admin"]);
  if (!role.ok) return roleGateFailure(role.reason);

  const body = await parseAccountBody(request, CreateTemplateBodySchema);
  if (!body.ok) return body.response;

  const result = await createAccountTemplate({
    accountId,
    actorUserId: auth.userId,
    workflowId: body.data.workflowId,
    name: body.data.name,
    description: body.data.description ?? null,
    visibility: body.data.visibility,
  });

  if (!result.ok) {
    switch (result.reason) {
      case "tier_forbidden":
        return NextResponse.json(
          { error: "Your plan can't create custom templates. Upgrade to Pro or higher.", code: "TEMPLATES_REQUIRE_UPGRADE" },
          { status: 403 },
        );
      case "limit_reached":
        return NextResponse.json(
          {
            error: "You've reached your template limit for this plan.",
            code: "TEMPLATE_LIMIT_REACHED",
            limit: result.limit,
            count: result.count,
          },
          { status: 403 },
        );
      case "workflow_not_found":
        // Same response for cross-account + nonexistent (no existence leak).
        return NextResponse.json(
          { error: "No such workflow in this account.", code: "WORKFLOW_NOT_FOUND" },
          { status: 404 },
        );
    }
  }

  return NextResponse.json({ template: result.template }, { status: 201 });
}
