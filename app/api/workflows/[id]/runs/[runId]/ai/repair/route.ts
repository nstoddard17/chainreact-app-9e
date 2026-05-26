import { NextResponse } from "next/server";
import { z } from "zod";
import { suggestWorkflowRepairForAI } from "@/services/ai/repair";
import { recordAiRepairOutcome } from "@/services/ai/events";
import { requireUser } from "../../../../../_shared";

/**
 * POST /api/workflows/[id]/runs/[runId]/ai/repair — failed-run repair proposal (Slice 4.AI-13).
 *
 * Delegates to the AI-7 service (`suggestWorkflowRepairForAI`), which:
 *   - reads the run (RLS + ownership cross-check against the path workflowId)
 *   - returns NOT_FOUND when the run is missing / not owned / wrong workflow
 *   - returns a value-free `RepairFailureSummary` for a non-failed run
 *   - classifies the failure into one category, builds a repair `WorkflowPatch`
 *     ONLY when safe, and runs it through the AI-5 preview
 *   - downgrades to `noSafeRepair` when the preview rejects
 *
 * The route NEVER mutates a workflow, NEVER applies (does not import AI-6), and
 * NEVER persists raw prompts/completions — there is no model call inside AI-7 to
 * begin with. To apply a proposed repair the UI calls the existing AI-9B apply
 * route (`POST /api/workflows/[id]/ai/apply`) — see lib/api/ai.ts.
 *
 * Status mapping:
 *   - 200 for any `ok:true` repair suggestion (including `needsUserInput` and
 *     `noSafeRepair` — the body's `repairability` / `reasonCode` carry the
 *     distinction; a 200 with `repairability: "needsUserInput"` is the
 *     canonical "we don't have enough info to fix it safely" outcome).
 *   - 401 unauthenticated.
 *   - 400 invalid body / missing ids.
 *   - 404 NOT_FOUND from the service (run missing / not owned / wrong workflow).
 *   - 500 READ_FAILED + any unexpected throw (sanitized).
 *
 * The response body is the already-sanitized `RepairSuggestionResult` — value-free
 * recommendations + the preview's structural summary. No raw error_details /
 * config values / secrets ever appear.
 */

// Forward-compatible body: the AI-7 service is deterministic and consumes only
// (userId, workflowId, workflowRunId). We accept the optional fields below so a
// future model-backed repair slice can extend behavior without an API break;
// they are validated for shape but NOT forwarded to the deterministic service.
const MAX_REPAIR_PROMPT_LENGTH = 4_000;
const MAX_NODE_ID_LENGTH = 256;

const RepairRequestSchema = z
  .object({
    repairPrompt: z.string().trim().max(MAX_REPAIR_PROMPT_LENGTH).optional(),
    modelTier: z.enum(["fast", "strong"]).optional(),
    selectedNodeId: z.string().trim().max(MAX_NODE_ID_LENGTH).optional(),
  })
  // Unknown keys are stripped (forward-compatible); declared fields are validated.
  .strip();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; runId: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id, runId } = await params;
  if (!id || id.trim() === "" || !runId || runId.trim() === "") {
    return NextResponse.json(
      { error: "Workflow id and run id are required." },
      { status: 400 },
    );
  }

  // Empty body is valid (no fields are required). Only validate shape when the
  // caller sent JSON; an empty/missing body must not 400 because AI-7 needs no
  // input. Read the body text once; if it parses as JSON, validate the optional
  // forward-compat shape; if it is not valid JSON OR fails the shape, 400.
  // The validated body's fields are intentionally ignored — they're accepted
  // for forward compat (future model-backed repair) but AI-7 has no use today.
  const raw = await request.text();
  if (raw.trim() !== "") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "Request body must be valid JSON." },
        { status: 400 },
      );
    }
    const shape = RepairRequestSchema.safeParse(parsed);
    if (!shape.success) {
      return NextResponse.json(
        {
          error: "Invalid request body.",
          details: shape.error.issues.map((i) => ({
            message: i.message,
            path: i.path,
          })),
        },
        { status: 400 },
      );
    }
  }

  let result;
  try {
    result = await suggestWorkflowRepairForAI({
      userId: auth.userId,
      workflowId: id,
      workflowRunId: runId,
    });
  } catch {
    // Sanitized — never leak internals / connection strings / stack traces.
    return NextResponse.json(
      { error: "Failed to suggest a repair." },
      { status: 500 },
    );
  }

  // Fire-and-forget AI observability (AI-10). Fail-open: the recorder swallows
  // its own errors; the extra try/catch is belt-and-suspenders so analytics can
  // never affect the response. No raw classification text / config is recorded.
  try {
    await recordAiRepairOutcome(
      { userId: auth.userId, workflowId: id, workflowRunId: runId },
      result,
    );
  } catch {
    /* analytics must never break the route */
  }

  if (!result.ok) {
    if (result.code === "NOT_FOUND") {
      return NextResponse.json({ error: "Workflow run not found." }, { status: 404 });
    }
    // READ_FAILED — sanitized 500.
    return NextResponse.json(
      { error: "Failed to suggest a repair." },
      { status: 500 },
    );
  }

  return NextResponse.json(result, { status: 200 });
}
