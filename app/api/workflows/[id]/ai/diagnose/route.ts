import { NextResponse } from "next/server";
import { diagnoseWorkflowForAgent } from "@/services/ai/diagnostics/diagnoseWorkflowForAgent";
import { requireUser } from "../../../_shared";

/**
 * POST /api/workflows/[id]/ai/diagnose — read-only "Check this workflow" for the
 * React Agent (Slice 4.AI-DIAG-1). Thin shell: auth → delegate → JSON.
 *
 * The route owns ONLY the session-auth boundary + serialization. All data access,
 * membership authz, personal-provider provenance, the diagnostic composition, and
 * the deterministic rendering live in `diagnoseWorkflowForAgent`, which consumes
 * `services/diagnostics/*` DIRECTLY (never the MCP server). NO body is required.
 *
 * This is the INTERNAL consumer path: authentication is the user session
 * (`requireUser`), NOT the MCP machine bearer. The composition forwards only the
 * session `userId` as the subject; the diagnostic services apply the same
 * account-membership + provenance walls they apply for the MCP path.
 *
 * NEVER returned: tokens, refresh tokens, providerAccountId, account metadata,
 * integration display names, connectedByUserId, exact expiry, raw granted scopes,
 * external account labels, or workflow config values. The DTO is codes / node ids /
 * provider ids+public names / missing-field NAMES / public scope-gap names / the
 * stored humanized run classification / safe deterministic text only.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id || id.trim() === "") {
    return NextResponse.json({ error: "Workflow id is required." }, { status: 400 });
  }

  try {
    const dto = await diagnoseWorkflowForAgent({ subjectUserId: auth.userId, workflowId: id });
    return NextResponse.json(dto);
  } catch {
    // Sanitized — never leak internals / connection strings / stack traces.
    return NextResponse.json({ error: "Failed to diagnose the workflow." }, { status: 500 });
  }
}
