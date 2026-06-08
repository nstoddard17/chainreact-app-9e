import { NextResponse } from "next/server";
import { requireAuthedUserId } from "@/app/api/account/_shared";
import { listMarketplaceTemplates } from "@/services/workflows/templateManagement";

/**
 * GET /api/workflow-templates/marketplace (CS-XT-5A).
 *
 * The public template catalog — OFFICIAL + PUBLIC templates as PUBLIC-SAFE summaries.
 * AUTHENTICATED users only (no anonymous web browsing at launch). The DTO carries NO
 * account_id / created_by_user_id / definition / credentials — only safe display attribution
 * (creatorDisplayName snapshot) + the official badge + counts. Private and unlisted templates
 * are NEVER listed here.
 */
export async function GET(): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;

  const templates = await listMarketplaceTemplates();
  return NextResponse.json({ templates });
}
