import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthedUserId, parseAccountBody } from "@/app/api/account/_shared";
import { isWorkflowTemplatesEnabled } from "@/services/workflows/portabilityFlags";
import { createWorkflowFromTemplate } from "@/services/workflows/templateManagement";

/**
 * POST /api/workflow-templates/[templateId]/use (CS-XT-5B).
 *
 * Create a workflow in `targetAccountId` FROM a template. Template access: official/public/
 * unlisted → any authenticated user; private → owning-account members only (an inaccessible
 * id collapses to 404, no existence oracle). The caller must be a member of the TARGET
 * account. The new workflow gets the template's SANITIZED definition with `__REDACTED__`
 * markers (the user reconnects credentials); a `used_to_create_workflow` usage event is
 * recorded. Dark behind ENABLE_WORKFLOW_TEMPLATES → 404 when off. Editing the new workflow
 * never touches the template.
 */

const UseTemplateBodySchema = z
  .object({
    targetAccountId: z.string().uuid("targetAccountId is required."),
    workflowName: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ templateId: string }> },
): Promise<Response> {
  if (!isWorkflowTemplatesEnabled()) {
    return NextResponse.json({ error: "Not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;
  const { templateId } = await params;

  const body = await parseAccountBody(request, UseTemplateBodySchema);
  if (!body.ok) return body.response;

  const result = await createWorkflowFromTemplate({
    templateId,
    targetAccountId: body.data.targetAccountId,
    actorUserId: auth.userId,
    workflowName: body.data.workflowName,
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
      case "invalid_template":
        return NextResponse.json(
          { error: "This template can't be turned into a workflow.", code: "INVALID_TEMPLATE" },
          { status: 422 },
        );
    }
  }

  return NextResponse.json(
    { workflowId: result.workflowId, name: result.workflowName },
    { status: 201 },
  );
}
