import { NextResponse } from "next/server";
import { diagnoseRunReport } from "@/services/diagnostics/runReport";
import { applyDiagnosticsGate } from "../_shared";

/**
 * POST /api/internal/diagnostics/run-failure — thin gated shell over the
 * `diagnoseRunReport` capability (Slice 4.MCP-STAGE-2B-3).
 *
 * The route owns ONLY the MCP-adapter boundary: the machine bearer gate
 * (`applyDiagnosticsGate` — default OFF → 404, prod-lock → 404, bad bearer → 401,
 * token never echoed), input validation, and JSON serialization. All data access,
 * membership authz, NOT_FOUND/WRONG_ACCOUNT shaping, the visibility-vs-failure
 * mode branch, and sanitized DTO assembly live in the capability service, so the
 * future React Agent can reuse the same brain in-process. No `requireUser` (no
 * cookie); the subject is the explicit `userId`.
 *
 * Contract (unchanged): `mode: "failure" | "visibility"` (default `"failure"`).
 * `visibility` mode returns `{ runId, visibility }` only.
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
  const runId = typeof b.runId === "string" ? b.runId.trim() : "";
  if (!runId) return badInput();
  const mode = b.mode === "visibility" ? "visibility" : "failure";
  const includeTestRuns = b.includeTestRuns === true;

  const result = await diagnoseRunReport({ subjectUserId: userId, runId, mode, includeTestRuns });
  return NextResponse.json(result);
}
