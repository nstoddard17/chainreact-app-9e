import { NextResponse } from "next/server";
import { diagnoseWorkflowConnections } from "@/services/diagnostics/integrationConnection";
import { applyDiagnosticsGate } from "../_shared";

/**
 * POST /api/internal/diagnostics/workflow-connections — thin gated shell over the
 * `diagnoseWorkflowConnections` capability (Slice 4.MCP-STAGE-2B-4).
 *
 * Reports, for one workflow, whether every provider its graph uses has the
 * required connection available under the correct account + credential-provenance
 * context. The route owns ONLY the MCP-adapter boundary: the machine bearer gate
 * (`applyDiagnosticsGate` — default OFF → 404, prod-lock → 404, bad bearer → 401,
 * token never echoed), input validation, and JSON serialization. All data access,
 * membership authz, personal-provider provenance, per-provider derivation, and
 * sanitized DTO assembly live in the capability service, so the future React Agent
 * can reuse the same brain in-process. No `requireUser` (no cookie); the subject
 * is the explicit `userId`.
 *
 * NEVER returned: token blobs, `connectedByUserId`, `providerAccountId`,
 * `displayName`, raw `accountMetadata`, the full granted scope list, workflow
 * node `config` values, raw provider bodies, or env. The DTO is enums / counts /
 * booleans / node ids / public scope-gap names only.
 */

const badInput = (): NextResponse =>
  NextResponse.json({ error: "invalid_input" }, { status: 400 });

export async function POST(request: Request): Promise<Response> {
  const gate = applyDiagnosticsGate(request);
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badInput();
  }
  if (typeof body !== "object" || body === null) return badInput();
  const b = body as Record<string, unknown>;

  const userId = typeof b.userId === "string" ? b.userId.trim() : "";
  if (!userId) return badInput();
  const workflowId = typeof b.workflowId === "string" ? b.workflowId.trim() : "";
  if (!workflowId) return badInput();

  const result = await diagnoseWorkflowConnections({ subjectUserId: userId, workflowId });
  return NextResponse.json(result);
}
