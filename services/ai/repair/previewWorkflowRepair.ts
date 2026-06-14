import { z } from "zod";
import type {
  ModelClient,
  ModelGenerateInput,
  ModelResponseTool,
  ModelTier,
  ModelTokenUsage,
} from "@/core/ai/modelTypes";
import type { AgentWorkflowDiagnosisDTO } from "@/services/ai/diagnostics/diagnoseWorkflowForAgent";
import { buildDiagnosisExplainContext } from "@/services/ai/diagnostics/buildDiagnosisExplainContext";
import { getWorkflowGraphForAI } from "@/services/ai/tools/workflowContext";
import { previewWorkflowPatchForAI } from "@/services/ai/preview";
import type { PatchPreviewResult } from "@/services/ai/preview/types";
import type { PatchOperation, WorkflowPatch } from "@/services/workflows/patch/types";

/**
 * LLM validated-patch PREVIEW for a safe workflow-diagnosis DTO (Slice 4.AI-REPAIR-2b).
 *
 * The structured, validation-backed sibling of `planWorkflowRepair`: where the
 * repair PLAN recommends changes in plain language, this asks the model to emit a
 * `WorkflowPatch` and runs it through the EXISTING deterministic preview engine
 * (`previewWorkflowPatchForAI` → `normalizeAiPatchNodeKeys` → `validateWorkflowPatch`)
 * to show WHAT WOULD CHANGE — with the authoritative, recomputed risk. It is
 * PREVIEW ONLY: it produces no apply, no save, no run, no graph mutation, and
 * imports no apply/persistence path. Executable apply belongs to a later slice.
 *
 * Pure orchestration with an INJECTED model client (mirrors `planWorkflowRepair`):
 *   1. Load the current (saved) workflow graph — the SAME source the preview
 *      validates against — and project a value-free node/edge inventory.
 *   2. Build the model context: safe diagnosis projection + opaque-id node
 *      inventory + optional non-authoritative repair-proposal steering.
 *   3. Force a single `propose_workflow_repair_patch` tool call (lenient at the
 *      JSON boundary); parse + lightly Zod-validate the envelope.
 *   4. Assemble a `WorkflowPatch` and delegate to `previewWorkflowPatchForAI`.
 *   5. Return a discriminated result; never throw for a model/parse/validation
 *      failure (the route maps it to a safe status).
 *
 * No-leak: the model sees ONLY `buildDiagnosisExplainContext(dto)` + a node
 * inventory of `{ id, kind, provider, type }` (opaque ids for TARGETING patch
 * operations — never config VALUES) + `{ id, from, to }` edges + the optional
 * proposal steering text. Never raw config, tokens, integration rows, account
 * metadata, providerAccountId, connectedByUserId, run payloads, or PII. Node ids
 * are opaque, non-secret targeting handles; the preview renders human LABELS, so
 * ids never reach user-facing copy.
 *
 * Authoritative risk: the model MAY emit an advisory risk; this service NEVER
 * reads it. `validateWorkflowPatch` (inside the preview) recomputes risk/
 * confirmation deterministically — that is the only risk surfaced.
 */

/** Tool name surfaced to the model + matched in the tool_use response block. */
export const PROPOSE_WORKFLOW_REPAIR_PATCH_TOOL_NAME = "propose_workflow_repair_patch";

/** Immutable safety line. Server-set (NOT model-supplied) so it can never be dropped/altered. */
export const REPAIR_PREVIEW_NOT_APPLIED_NOTICE =
  "This is a preview only — your workflow wasn't changed, saved, or run.";

/**
 * Forced structured-output tool. Intentionally LENIENT about `operations` (an
 * array of objects — NO recursive operation enumeration) exactly like
 * `workflowPlanTool`: `WorkflowPatchSchema` + `validateWorkflowPatch` (run inside
 * `previewWorkflowPatchForAI`) are the strict downstream gate and the source of
 * truth. `riskLevel` is accepted but IGNORED by this service (advisory only).
 */
const PROPOSE_WORKFLOW_REPAIR_PATCH_TOOL: ModelResponseTool = {
  name: PROPOSE_WORKFLOW_REPAIR_PATCH_TOOL_NAME,
  description:
    "Propose a minimal WorkflowPatch (a small set of operations) that would fix the provided workflow diagnosis. " +
    "Reference EXISTING steps by their inventory `id`; use a short patch-local id for any NEW node you add. " +
    "Do not claim anything was changed, applied, saved, fixed, or run — this is a proposal that will be validated and previewed only.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: {
        type: "string",
        description: "One short line describing the proposed fix. No claim that anything was applied/saved/run.",
      },
      rationale: {
        type: "string",
        description: "Brief, user-safe reasoning for the change. Not raw chain-of-thought; no ids or config values.",
      },
      operations: {
        type: "array",
        description:
          "Ordered patch operations. Each is an object with an `op` discriminator (e.g. updateNodeConfig, repairVariableReference, addNode, addEdge, replaceTrigger) plus its fields. Target existing steps by their inventory id.",
        items: { type: "object" },
      },
      riskLevel: {
        type: "string",
        enum: ["low", "medium", "high"],
        description: "Advisory risk estimate. IGNORED by the server — the deterministic validator recomputes the authoritative risk.",
      },
    },
    required: ["operations"],
  },
};

const SYSTEM_PROMPT =
  "You propose a minimal WorkflowPatch that fixes an ALREADY-COMPUTED, safe workflow diagnosis. " +
  "Emit only the operations needed to resolve the findings, simplest first. Target EXISTING steps by " +
  "the `id` given in the node inventory; invent a short patch-local id only for a node you ADD. " +
  "Use ONLY the provided diagnosis + inventory context — never invent providers, actions, fields, " +
  "or ids. Do NOT propose changes for problems that require the user to act outside the builder " +
  "(reconnecting an account, granting a scope, upgrading a plan, or supplying a secret value) — those " +
  "are not patchable. You CANNOT and DID NOT change, apply, save, repair, or run anything; this patch " +
  "will be validated and previewed only. Your risk estimate is advisory and will be ignored. Be minimal.";

/** Bounded output cap so a runaway response can't bloat the prompt/ledger. */
const MAX_OUTPUT_TOKENS = 2_000;

/** Hard cap on proposed operations — an oversized list is rejected as PARSE_FAILED. */
const MAX_OPERATIONS = 40;

export interface RepairModelMeta {
  readonly modelId: string;
  readonly tier: ModelTier;
  readonly usage?: ModelTokenUsage;
  readonly latencyMs?: number;
}

/** Optional, NON-AUTHORITATIVE steering context (the user's prior repair proposal). */
export interface RepairProposalSteeringContext {
  readonly summary?: string;
  readonly recommendedActions?: readonly string[];
}

export type PreviewWorkflowRepairResult =
  | {
      ok: true;
      /** The deterministic preview — `preview.ok` is false for a validation-blocked patch. */
      preview: PatchPreviewResult;
      model: RepairModelMeta;
    }
  | {
      ok: false;
      code: "MODEL_FAILED" | "PARSE_FAILED" | "GRAPH_UNAVAILABLE";
      message: string;
      model?: RepairModelMeta;
    };

export interface PreviewWorkflowRepairInput {
  /** Re-derived server-side by the route (access==="OK"). Never client-posted. */
  readonly dto: AgentWorkflowDiagnosisDTO;
  /** Workflow-owning member; used for the read-only graph load + preview. */
  readonly userId: string;
  readonly workflowId: string;
  /** Injected (tests pass a mock; the route passes the OpenAI fast client). */
  readonly modelClient: ModelClient;
  /** Tier the call will use (drives telemetry); defaults to `fast`. */
  readonly tier?: ModelTier;
  /** Optional non-authoritative steering (validated + capped here). */
  readonly proposalContext?: unknown;
}

/** Lenient envelope parse — strict op validation happens downstream in the validator. */
const RepairPatchEnvelopeSchema = z.object({
  summary: z.string().max(2_000).optional(),
  rationale: z.string().max(4_000).optional(),
  operations: z.array(z.record(z.unknown())).max(MAX_OPERATIONS),
});

/** Sanitize + cap the optional client-supplied steering context. Drops anything invalid. */
const SteeringSchema = z
  .object({
    summary: z.string().max(2_000).optional(),
    recommendedActions: z.array(z.string().max(1_000)).max(12).optional(),
  })
  .partial();

function sanitizeSteering(input: unknown): RepairProposalSteeringContext | undefined {
  const parsed = SteeringSchema.safeParse(input);
  if (!parsed.success) return undefined;
  const summary = parsed.data.summary?.trim();
  const recommendedActions = parsed.data.recommendedActions?.filter((a) => a.trim().length > 0);
  const hasSummary = summary !== undefined && summary.length > 0;
  const hasActions = recommendedActions !== undefined && recommendedActions.length > 0;
  if (!hasSummary && !hasActions) return undefined;
  return {
    ...(hasSummary ? { summary } : {}),
    ...(hasActions ? { recommendedActions } : {}),
  };
}

/**
 * Propose + preview a validated repair patch. Returns a structured result; never
 * throws for a model / parse / validation failure. PREVIEW ONLY — assembles a
 * `WorkflowPatch` and hands it to the existing preview engine; imports/calls no
 * apply, save, run, or persistence path.
 */
export async function previewWorkflowRepair(
  input: PreviewWorkflowRepairInput,
): Promise<PreviewWorkflowRepairResult> {
  const tier: ModelTier = input.tier ?? "fast";
  const { userId, workflowId } = input;

  // 1. Load the current (saved) graph — the SAME source the preview validates
  //    against — so the model targets ids that exist in the validation target.
  //    NO config reaches the model: we project only id / kind / provider / type.
  const graphRes = await getWorkflowGraphForAI(userId, workflowId);
  if (!graphRes.ok) {
    return { ok: false, code: "GRAPH_UNAVAILABLE", message: "Couldn't read the workflow to build a repair preview." };
  }
  const graph = graphRes.data;

  const nodeInventory = graph.nodes.map((n) => ({
    id: n.id,
    kind: n.kind,
    provider: n.provider,
    type: n.type,
  }));
  const edgeInventory = graph.edges.map((e) => ({ id: e.id, from: e.from, to: e.to }));

  const steering = sanitizeSteering(input.proposalContext);

  // 2. Model context: safe diagnosis projection + opaque-id inventory + optional
  //    non-authoritative steering. NO config values / tokens / account labels.
  const context = {
    diagnosis: buildDiagnosisExplainContext(input.dto),
    graph: { nodes: nodeInventory, edges: edgeInventory },
    ...(steering ? { proposalContext: steering } : {}),
  };

  const request: ModelGenerateInput = {
    feature: "repair",
    tier,
    responseTool: PROPOSE_WORKFLOW_REPAIR_PATCH_TOOL,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Here is the workflow diagnosis + current step inventory to propose a fix patch for:\n\n${JSON.stringify(context)}`,
      },
    ],
  };

  const result = await input.modelClient.generateStructuredJson(request);
  const model: RepairModelMeta = {
    modelId: result.modelId,
    tier,
    ...(result.ok && result.usage ? { usage: result.usage } : {}),
    ...(result.latencyMs !== undefined ? { latencyMs: result.latencyMs } : {}),
  };

  if (!result.ok) {
    return { ok: false, code: "MODEL_FAILED", message: `The model did not return a repair patch (${result.failureCode}).`, model };
  }

  // 3. Lenient envelope parse. Strict per-operation validation is the validator's job.
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(result.text);
  } catch {
    return { ok: false, code: "PARSE_FAILED", message: "The model response was not valid JSON.", model };
  }
  const env = RepairPatchEnvelopeSchema.safeParse(parsedJson);
  if (!env.success) {
    return { ok: false, code: "PARSE_FAILED", message: "The model response did not match the expected repair-patch shape.", model };
  }

  // 4. Assemble the patch envelope. The model's advisory risk is NOT read here —
  //    `validateWorkflowPatch` (inside the preview) recomputes the authoritative
  //    risk/confirmation. baseRevision uses the saved revision token.
  const patch: WorkflowPatch = {
    patchId: `repair-preview:${workflowId}`,
    workflowId,
    baseRevision: graph.updatedAt,
    operations: (env.data.operations as unknown[]) as PatchOperation[],
    summary: env.data.summary?.trim() || "AI-proposed repair",
    rationale: env.data.rationale?.trim() || "Proposed by the repair preview assistant.",
  };

  // 5. Delegate to the EXISTING deterministic preview engine. A malformed operation
  //    can make the normalize/validate pipeline throw before the Zod gate — treat
  //    any throw as an unprocessable model patch (PARSE_FAILED), never a 500.
  let previewRes;
  try {
    previewRes = await previewWorkflowPatchForAI({ userId, workflowId, patch });
  } catch {
    return { ok: false, code: "PARSE_FAILED", message: "The proposed repair patch could not be processed.", model };
  }
  if (!previewRes.ok) {
    // The graph could not be read for the preview (e.g. NOT_FOUND). Surface safely.
    return { ok: false, code: "GRAPH_UNAVAILABLE", message: "Couldn't preview the proposed repair.", model };
  }

  // previewRes.data.ok === false here is a VALIDATION-BLOCKED patch (UNKNOWN_NODE,
  // MISSING_REQUIRED_FIELD, etc.) — a legitimate, previewable outcome. We return it
  // as ok:true with preview.ok=false + blockedReason; the route/UI render the block.
  return { ok: true, preview: previewRes.data, model };
}
