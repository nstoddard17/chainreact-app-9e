import { NextResponse } from "next/server";
import { requireAuthedUserId } from "@/app/api/account/_shared";
import { isWorkflowTemplatesEnabled } from "@/services/workflows/portabilityFlags";
import { listMarketplaceTemplates } from "@/services/workflows/templateManagement";

/**
 * GET /api/workflow-templates/marketplace (CS-XT-5A).
 *
 * The public template catalog — OFFICIAL + PUBLIC templates as PUBLIC-SAFE summaries.
 * AUTHENTICATED users only (no anonymous web browsing at launch). The DTO carries NO
 * account_id / created_by_user_id / definition / credentials — only safe display attribution
 * (creatorDisplayName snapshot) + the official badge + counts. Private and unlisted templates
 * are NEVER listed here. Dark behind ENABLE_WORKFLOW_TEMPLATES → 404 when off.
 */
export async function GET(): Promise<Response> {
  if (!isWorkflowTemplatesEnabled()) {
    return NextResponse.json({ error: "Not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;

  const templates = await listMarketplaceTemplates();
  return NextResponse.json({ templates });
}
