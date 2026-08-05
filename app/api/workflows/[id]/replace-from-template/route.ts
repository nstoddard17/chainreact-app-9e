import { NextResponse } from "next/server";
import { z } from "zod";
import { replaceWorkflowWithTemplate } from "@/services/workflows/templateManagement";
import { planFeatureRequiredBody } from "@/services/workflows/planFeatureGate";
import {
  parseJsonBody,
  requireUser,
  toWorkflowDetail,
  workflowRevisionConflictResponse,
} from "../../_shared";

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

const BodySchema = z
  .object({
    templateId: z.string().uuid("templateId is required."),
    /**
     * WORKFLOW-CHANGED-ELSEWHERE-CONFLICT-PROTECTION-1 — the workflow revision
     * (`updatedAt`) the builder session loaded. Required: replacing a workflow
     * is an authoritative definition save, so it follows the same
     * compare-and-swap contract as PATCH; a stale session gets a typed 409
     * instead of clobbering a newer workflow.
     */
    expectedRevision: z.string().min(1, "expectedRevision is required."),
    /**
     * AI-TEMPLATE-APPLY-CURRENT — origin of the replace. `react_agent` (the "apply to current
     * workflow" choice on a React-Agent template suggestion) opts into a pre-replace checkpoint +
     * a History row so the change is undoable. Omitted by the in-builder Templates modal, which
     * keeps its existing "can't be undone" contract.
     */
    origin: z.literal("react_agent").optional(),
  })
  .strict();

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
    expectedRevision: body.data.expectedRevision,
    ...(body.data.origin === "react_agent" ? { recordHistory: true } : {}),
  });

  if (!result.ok) {
    switch (result.reason) {
      case "workflow_not_found":
        return NextResponse.json({ error: "Workflow not found.", code: "WORKFLOW_NOT_FOUND" }, { status: 404 });
      case "revision_conflict":
        // WORKFLOW-CHANGED-ELSEWHERE-CONFLICT-PROTECTION-1 — stale builder
        // session; nothing was replaced, no lifecycle side effect ran.
        return workflowRevisionConflictResponse({
          workflowId: id,
          actorUserId: auth.userId,
          latestRevision: result.latestRevision,
          savePath: "template_replace",
          expectedRevisionPresent: true,
        });
      case "template_not_found":
        return NextResponse.json({ error: "No such template.", code: "TEMPLATE_NOT_FOUND" }, { status: 404 });
      case "invalid_template":
        return NextResponse.json(
          { error: "This template can't be applied to a workflow.", code: "INVALID_TEMPLATE" },
          { status: 422 },
        );
      case "plan_feature_required":
        // BRANCH-ENT-1 C5 — branching template into a non-entitled account;
        // the current draft was left untouched.
        return NextResponse.json(planFeatureRequiredBody(result.error), { status: 403 });
    }
  }

  return NextResponse.json(await toWorkflowDetail(result.workflow, auth.userId));
}
