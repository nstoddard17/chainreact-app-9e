import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthedUserId, parseAccountBody } from "@/app/api/account/_shared";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import {
  updateAccountTemplate,
  deleteAccountTemplate,
} from "@/services/workflows/templateManagement";

/**
 * /api/accounts/[id]/workflow-templates/[templateId] (CS-XT-5A).
 *   PATCH  — update SAFE metadata (name / description / visibility). CREATOR-only — a
 *            non-creator owner/admin cannot mutate someone else's original (public) template.
 *            Publishing (→ public/unlisted) stamps published_at + a safe display-name snapshot;
 *            unpublishing (→ private) stamps unpublished_at.
 *   DELETE — hard delete. Creator OR the account OWNER (moderation/account control).
 *
 * Owner/admin role gate at the route; creator-ownership enforced in the service. A template id
 * from another account → 404 (no cross-account leak). The client can never set
 * source/counters/snapshot (strict body).
 */

function notFound(code = "NOT_FOUND", error = "Not found."): NextResponse {
  return NextResponse.json({ error, code }, { status: 404 });
}

function roleGateFailure(reason: "not_member" | "forbidden"): NextResponse {
  return NextResponse.json(
    reason === "not_member"
      ? { error: "You are not a member of this account.", code: "NOT_ACCOUNT_MEMBER" }
      : { error: "Insufficient permissions.", code: "FORBIDDEN" },
    { status: 403 },
  );
}

function notCreator(): NextResponse {
  return NextResponse.json(
    { error: "Only the template's creator can change it.", code: "FORBIDDEN_NOT_CREATOR" },
    { status: 403 },
  );
}

const UpdateTemplateBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    visibility: z.enum(["private", "public", "unlisted"]).optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: "No fields to update." });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; templateId: string }> },
): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;
  const { id: accountId, templateId } = await params;

  const role = await requireAccountRole(auth.userId, accountId, ["owner", "admin"]);
  if (!role.ok) return roleGateFailure(role.reason);

  const body = await parseAccountBody(request, UpdateTemplateBodySchema);
  if (!body.ok) return body.response;

  const result = await updateAccountTemplate({
    accountId,
    actorUserId: auth.userId,
    templateId,
    name: body.data.name,
    description: body.data.description,
    visibility: body.data.visibility,
  });

  if (!result.ok) {
    if (result.reason === "not_found") return notFound("TEMPLATE_NOT_FOUND", "No such template.");
    return notCreator();
  }
  return NextResponse.json({ template: result.template });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; templateId: string }> },
): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;
  const { id: accountId, templateId } = await params;

  const role = await requireAccountRole(auth.userId, accountId, ["owner", "admin"]);
  if (!role.ok) return roleGateFailure(role.reason);

  const result = await deleteAccountTemplate({
    accountId,
    actorUserId: auth.userId,
    actorRole: role.role,
    templateId,
  });

  if (!result.ok) {
    if (result.reason === "not_found") return notFound("TEMPLATE_NOT_FOUND", "No such template.");
    return notCreator();
  }
  return NextResponse.json({ ok: true });
}
