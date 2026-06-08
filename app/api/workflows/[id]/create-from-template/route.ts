import { NextResponse } from "next/server";
import { z } from "zod";
import { createWorkflowFromTemplate } from "@/services/workflows/templateManagement";
import { loadWorkflowForMember, parseJsonBody, requireUser } from "../../_shared";

/**
 * POST /api/workflows/[id]/create-from-template — in-builder "Create a new workflow
 * from this template" (CS-XT-IN-BUILDER).
 *
 * Workflow-centric variant of the use-template path: the NEW workflow is created in the
 * SAME account as the CURRENT workflow (`[id]`), inferred SERVER-SIDE — the client never
 * supplies an account id. Authorization: the caller must be a member of the current
 * workflow's account (membership gate; a missing workflow / non-member → 404, no leak).
 * The current workflow is NOT mutated. Delegates to the existing
 * `createWorkflowFromTemplate` service (sanitized definition with `__REDACTED__` markers,
 * usage event recorded, template row untouched). Returns the new workflow id to open.
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
  // Membership gate on the CURRENT workflow + resolve its account (server-side) as the
  // create target — the client never names an account.
  const loaded = await loadWorkflowForMember(id, auth.userId);
  if (!loaded.ok) return loaded.response;

  const result = await createWorkflowFromTemplate({
    templateId: body.data.templateId,
    targetAccountId: loaded.record.accountId,
    actorUserId: auth.userId,
  });

  if (!result.ok) {
    switch (result.reason) {
      case "template_not_found":
        return NextResponse.json({ error: "No such template.", code: "TEMPLATE_NOT_FOUND" }, { status: 404 });
      case "target_not_member":
        return NextResponse.json(
          { error: "You can't create a workflow in this account.", code: "NOT_ACCOUNT_MEMBER" },
          { status: 403 },
        );
      case "invalid_template":
        return NextResponse.json(
          { error: "This template can't be turned into a workflow.", code: "INVALID_TEMPLATE" },
          { status: 422 },
        );
    }
  }

  return NextResponse.json({ workflowId: result.workflowId, name: result.workflowName }, { status: 201 });
}
