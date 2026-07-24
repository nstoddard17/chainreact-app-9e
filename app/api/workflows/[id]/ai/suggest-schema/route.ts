import { NextResponse } from "next/server";
import { z } from "zod";
import {
  accountPendingDeletionResponse,
  loadWorkflowForMember,
  parseJsonBody,
  requireUser,
} from "@/app/api/workflows/_shared";
import { INSTRUCTIONS_MAX_CHARS } from "@/contracts/aiProcessing";
import { buildLatestValuesBySource } from "@/core/workflows/latestRunValues";
import {
  resolveSuggestionSample,
  SUGGESTION_SAMPLE_MESSAGES,
} from "@/core/workflows/suggestionSample";
import * as runsRepo from "@/repositories/workflowRuns";
import { isAccountFrozen } from "@/services/accounts/accountFreeze";
import {
  AiActionRefusedError,
  AiCreditsExhaustedError,
  DocumentInputError,
} from "@/services/ai/processor/analysisErrors";
import { isAiProcessorEnabled } from "@/services/ai/processor/config";
import { runSchemaSuggestion } from "@/services/ai/processor/runSchemaSuggestion";

/**
 * POST /api/workflows/[id]/ai/suggest-schema (AI-PROVIDER-7 CS-7).
 *
 * The gated builder-time boundary behind the schema editor's "Suggest fields"
 * button. It reads a real sample of the author's own data and returns a
 * PROPOSED `UserDefinedSchema` — editable rows, never a commit. This route
 * creates, updates, applies, runs, and deletes nothing.
 *
 * Gates, in order (nothing reads data or charges before its guard passes):
 *   1. auth → 401.
 *   2. strict body → 400. `.strict()` blocks a client-supplied accountId.
 *   3. AI processor availability BEFORE any read or charge → 503.
 *   4. the workflow must exist and the caller must be a member of ITS account
 *      → else the standard no-leak 404; then the account freeze check → 403.
 *   5. the SAMPLE is resolved SERVER-SIDE from state ChainReact already owns:
 *      the node's saved config, or the caller's own most recent TEST run. The
 *      client never supplies a file reference — a browser-supplied FileRef
 *      would let any member point the server's fetcher at an arbitrary URL.
 *   6. `runSchemaSuggestion` → `executeAiAction`, which owns the credit gate
 *      (`schema_suggestion`, 1 credit, fast tier), routing, and the ledger.
 *      There is no credit logic in this route.
 *
 * Why the WORKFLOW-scoped path rather than the plan's `/api/accounts/[id]/…`:
 * the credits belong to the account that OWNS THE WORKFLOW — exactly the
 * account `executeAiAction` charges when the same AI step runs — not to
 * whichever account the caller happens to have active. Deriving it from the
 * workflow makes that impossible to get wrong, and keeps the builder from
 * needing an account id it deliberately does not hold client-side.
 *
 * Run-output access mirrors `toWorkflowRunDetail` exactly: a step's output is
 * only readable on a TEST run the CALLER started. A co-member's run — or any
 * real run — is never sampled, so this route cannot become a side channel onto
 * production execution data.
 *
 * No-leak: the response carries the proposal, the sampled file NAME, and safe
 * flags. Never the document text, the prompt, the gateway envelope, raw usage,
 * or any id the caller did not already supply.
 */

/** How far back to look for a usable sample run. */
const RUN_LOOKBACK = 10;

const BodySchema = z
  .object({
    /** The node whose schema editor asked. */
    nodeId: z.string().trim().min(1),
    /** The node field holding the document/data input (meta `sampleSourceField`). */
    sampleSourceField: z.string().trim().min(1).max(128),
    instructions: z.string().trim().max(INSTRUCTIONS_MAX_CHARS).optional(),
  })
  .strict();

/** Every failure arm is a typed code + one actionable sentence. */
function fail(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ ok: false, code, message }, { status });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: workflowId } = await params;

  // 1. Auth.
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { userId } = auth;

  // 2. Strict body.
  const parsed = await parseJsonBody(request, BodySchema);
  if (!parsed.ok) return parsed.response;
  const { nodeId, sampleSourceField, instructions } = parsed.data;

  // 3. Availability BEFORE any read or charge.
  if (!isAiProcessorEnabled()) {
    return fail(
      503,
      "SUGGESTIONS_UNAVAILABLE",
      "Field suggestions aren't available right now.",
    );
  }

  // 4. Membership on the workflow's OWN account (non-members → no-leak 404),
  //    then the freeze gate.
  const wf = await loadWorkflowForMember(workflowId, userId);
  if (!wf.ok) return wf.response;
  const accountId = wf.record.accountId;
  if (await isAccountFrozen(accountId)) return accountPendingDeletionResponse();

  const node = wf.record.draftDefinition.nodes.find((n) => n.id === nodeId);
  if (!node) {
    return fail(
      404,
      "NODE_NOT_FOUND",
      "That step isn't part of this workflow anymore. Save your changes and try again.",
    );
  }

  // 5. Resolve the sample from state we already own. Only the caller's OWN
  //    test runs are readable (same rule as the run-detail DTO).
  let latestValuesBySource: Readonly<Record<string, unknown>> = {};
  try {
    const runs = await runsRepo.listByWorkflow(workflowId, { limit: RUN_LOOKBACK });
    const ownTestRun = runs.find(
      (run) => run.isTest && run.triggeredByUserId === userId,
    );
    if (ownTestRun) {
      latestValuesBySource = buildLatestValuesBySource({
        detail: {
          steps: ownTestRun.steps.map((step) => ({
            nodeId: step.nodeId,
            ...(step.output !== undefined ? { output: step.output } : {}),
          })),
          triggerNodeId: ownTestRun.triggerNodeId,
        },
        currentTriggerNodeId:
          wf.record.draftDefinition.nodes.find((n) => n.kind === "trigger")?.id ?? null,
      });
    }
  } catch {
    // A run-history read failure must not present as "suggestions are broken";
    // fall through with no run values and let the sample resolver say what to do.
    latestValuesBySource = {};
  }

  const sample = resolveSuggestionSample({
    config: node.config ?? {},
    sampleSourceField,
    latestValuesBySource,
  });
  if (!sample.ok) {
    return fail(422, "NO_SAMPLE", SUGGESTION_SAMPLE_MESSAGES[sample.reason]);
  }

  // 6. The shared AI pipeline owns gating, charging, routing, and the ledger.
  try {
    const outcome = await runSchemaSuggestion({
      sample: sample.value,
      ...(instructions ? { instructions } : {}),
      accountId,
      userId,
      workflowId,
      storageReason: `ai:suggest_schema workflow=${workflowId} node=${nodeId}`,
    });
    return NextResponse.json({
      ok: true,
      schema: outcome.schema,
      sourceName: outcome.sourceName,
      truncated: outcome.truncated,
      sampleSource: sample.source,
    });
  } catch (err) {
    if (err instanceof AiCreditsExhaustedError) {
      return fail(
        402,
        "AI_CREDITS_EXHAUSTED",
        "You've used all AI credits for this billing period.",
      );
    }
    if (err instanceof DocumentInputError) {
      // The author's own document couldn't be read — their message, verbatim,
      // because it already names the remedy (wrong file type, no text, …).
      return fail(422, "SAMPLE_UNREADABLE", err.message);
    }
    if (err instanceof AiActionRefusedError) {
      return fail(503, "SUGGESTIONS_UNAVAILABLE", err.message);
    }
    // Anything else (provider failure, malformed proposal) is a safe retry.
    return fail(
      503,
      "SUGGESTIONS_UNAVAILABLE",
      "ChainReact couldn't suggest fields just now. Try again in a moment.",
    );
  }
}
