import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthedUserId, parseAccountBody } from "@/app/api/account/_shared";
import { forkTemplateToAccount } from "@/services/workflows/templateManagement";

/**
 * POST /api/workflow-templates/[templateId]/fork (CS-XT-5B).
 *
 * Fork/copy a template into `targetAccountId` as a NEW user template the caller owns. Source
 * access: official/public/unlisted → any authenticated user; private → owning-account members
 * (inaccessible → 404). Target requires owner/admin role + custom-template capability + tier
 * headroom (Free blocked; capped by templateLimit). The copy carries the SANITIZED definition
 * only, sets `forked_from_template_id`, is always `source='user'`, defaults `visibility`
 * private, and records a `forked` usage event. Editing the fork never touches the original.
 */

const ForkTemplateBodySchema = z
  .object({
    targetAccountId: z.string().uuid("targetAccountId is required."),
    name: z.string().trim().min(1).max(120).optional(),
    visibility: z.enum(["private", "public", "unlisted"]).optional(),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ templateId: string }> },
): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;
  const { templateId } = await params;
  // A malformed (non-uuid) id collapses to the same 404 as an unknown id — never a 500
  // from a failed Postgres uuid cast, and no malformed-vs-missing oracle.
  if (!z.string().uuid().safeParse(templateId).success) {
    return NextResponse.json({ error: "No such template.", code: "TEMPLATE_NOT_FOUND" }, { status: 404 });
  }

  const body = await parseAccountBody(request, ForkTemplateBodySchema);
  if (!body.ok) return body.response;

  const result = await forkTemplateToAccount({
    templateId,
    targetAccountId: body.data.targetAccountId,
    actorUserId: auth.userId,
    name: body.data.name,
    visibility: body.data.visibility,
  });

  if (!result.ok) {
    switch (result.reason) {
      case "template_not_found":
        return NextResponse.json({ error: "No such template.", code: "TEMPLATE_NOT_FOUND" }, { status: 404 });
      case "target_not_member":
        return NextResponse.json(
          { error: "You are not a member of the target account.", code: "NOT_ACCOUNT_MEMBER" },
          { status: 403 },
        );
      case "target_forbidden":
        return NextResponse.json(
          { error: "Only owners and admins can save templates to this account.", code: "FORBIDDEN" },
          { status: 403 },
        );
      case "tier_forbidden":
        return NextResponse.json(
          { error: "Your plan can't save custom templates. Upgrade to Pro or higher.", code: "TEMPLATES_REQUIRE_UPGRADE" },
          { status: 403 },
        );
      case "limit_reached":
        return NextResponse.json(
          { error: "You've reached your template limit for this plan.", code: "TEMPLATE_LIMIT_REACHED", limit: result.limit, count: result.count },
          { status: 403 },
        );
    }
  }

  return NextResponse.json({ template: result.template }, { status: 201 });
}
