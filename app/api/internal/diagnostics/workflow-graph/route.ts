import { NextResponse } from "next/server";
import { diagnoseWorkflowGraph } from "@/services/diagnostics/workflowGraph";
import { applyDiagnosticsGate } from "../_shared";

/**
 * POST /api/internal/diagnostics/workflow-graph — thin gated shell over the
 * `diagnoseWorkflowGraph` capability (Slice 4.MCP-STAGE-2B-5 / Phase C-1).
 *
 * The route owns ONLY the MCP-adapter boundary: the machine bearer gate
 * (`applyDiagnosticsGate` — default OFF → 404, prod-lock → 404, bad bearer → 401,
 * token never echoed), input validation, and JSON serialization. All data access,
 * membership authz, structural analysis, and sanitized DTO assembly live in the
 * capability service, so the future React Agent can reuse the same brain in-process.
 * No `requireUser` (no cookie); the subject is the explicit `userId`.
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

  const result = await diagnoseWorkflowGraph({ subjectUserId: userId, workflowId });
  return NextResponse.json(result);
}
