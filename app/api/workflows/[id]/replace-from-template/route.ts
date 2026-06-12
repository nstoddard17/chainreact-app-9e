import { NextResponse } from "next/server";
import { z } from "zod";
import { replaceWorkflowWithTemplate } from "@/services/workflows/templateManagement";
import { parseJsonBody, requireUser, toWorkflowDetail } from "../../_shared";

/**
 * POST /api/workflows/[id]/replace-from-template — in-builder "Replace the current
 * workflow with this template" (CS-XT-IN-BUILDER).
 *
 * Overwrites ONLY the current workflow's draft definition with the selected template's
 * sanitized (credential-free) graph. Authorization is the SAME membership gate the
 * edit/save path uses — enforced inside `replaceWorkflowWithTemplate` (a missing workflow
 * OR a non-member → the same `WORKFLOW_NOT_FOUND`, no existence leak). The workflow's
 * account ownership / id / name are unchanged, and the TEMPLATE ROW IS NEVER MUTATED.
 * Returns the updated WorkflowDetail (incl. the new draftDefinition + updatedAt) so the
 * builder can re-hydrate the canvas to the template at a clean, saved baseline.
 */

const BodySchema = z.object({ templateId: z.string().uuid("templateId is required.") }).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody(request, BodySchema);
  if (!body.ok) return body.response;

  const { id } = await params;
  const result = await replaceWorkflowWithTemplate({
    workflowId: id,
    templateId: body.data.templateId,
    actorUserId: auth.userId,
  });

  if (!result.ok) {
    switch (result.reason) {
      case "workflow_not_found":
        return NextResponse.json({ error: "Workflow not found.", code: "WORKFLOW_NOT_FOUND" }, { status: 404 });
      case "template_not_found":
        return NextResponse.json({ error: "No such template.", code: "TEMPLATE_NOT_FOUND" }, { status: 404 });
      case "invalid_template":
        return NextResponse.json(
          { error: "This template can't be applied to a workflow.", code: "INVALID_TEMPLATE" },
          { status: 422 },
        );
    }
  }

  return NextResponse.json(toWorkflowDetail(result.workflow, auth.userId));
}
