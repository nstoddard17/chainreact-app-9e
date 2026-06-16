import { z } from "zod";
import type {
  ModelClient,
  ModelGenerateInput,
  ModelResponseTool,
  ModelTier,
  ModelTokenUsage,
} from "@/core/ai/modelTypes";
import type { WorkflowDefinition } from "@/contracts/workflow";
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
      /**
       * AI-REPAIR-2D / 2E — `NO_SAFE_PATCH` is a HANDLED, EXPECTED outcome the route
       * maps to a friendly 200 (NOT a 503). It covers BOTH:
       *   (a) the model DECLINING to emit a patch (no tool call / empty args — the
       *       remaining issue needs a user-supplied value or a reconnect), and
       *   (b) AI-REPAIR-2E — the model returning a patch we CAN'T turn into a safe
       *       preview (unreadable JSON, wrong envelope shape, or a malformed op that
       *       throws in the validate pipeline). The model responded; its output just
       *       isn't a usable safe fix — that is "no safe automatic fix", NOT an
       *       infrastructure outage, so it must never surface as a 503.
       *
       * AI-REPAIR-2H — `NO_SAFE_PATCH` is the GENERIC fallback only when the
       * diagnosis can't name a target. Every no-safe exit (a/b above) first attempts
       * the deterministic, model-free diagnosis-targeted block: when the diagnosis
       * carries a missing-required-field node, the result is instead an `ok:true`
       * BLOCKED preview with go-to-field metadata ("Open <field> field"), NOT this
       * code. So a missing required field is NEVER surfaced as the generic dead-end.
       *
       * `MODEL_FAILED` is a genuine provider/transport/config failure (the call itself
       * failed) → 503. `GRAPH_UNAVAILABLE` → 500. `PARSE_FAILED` is retained in the
       * union for back-compat but is NO LONGER PRODUCED — model-output failures now
       * classify as `NO_SAFE_PATCH` (see the sites below).
       */
      code: "MODEL_FAILED" | "PARSE_FAILED" | "GRAPH_UNAVAILABLE" | "NO_SAFE_PATCH";
      message: string;
      /**
       * Safe, non-user-facing reason tag for logs/telemetry only (e.g.
       * `unreadable_model_json`). NEVER shown to the user — the client overrides the
       * displayed copy by `code`. Lets `ai_cost_events` still distinguish a model
       * decline from a malformed-output reclassification.
       */
      detail?: string;
      model?: RepairModelMeta;
    };

/**
 * AI-REPAIR-2D — deterministic "is there still something a patch could fix?" gate,
 * mirroring the UI's `canExplainDiagnosis`. The route re-derives the diagnosis from
 * the CURRENT draft and calls this BEFORE the model: when it returns false (the
 * draft is clean/ready — e.g. the user already fixed the field the stale proposal
 * was based on) there is NOTHING to preview, so the route returns a handled "run
 * Check again" result with no model call and no charge — never a 503. Decided only
 * from safe structured DTO fields.
 */
export function diagnosisHasRepairableIssue(dto: AgentWorkflowDiagnosisDTO): boolean {
  if (dto.access !== "OK") return false;
  if (dto.overallReady === false) return true;
  if ((dto.findings?.length ?? 0) > 0) return true;
  if ((dto.nextSteps?.length ?? 0) > 0) return true;
  return false;
}

/**
 * AI-REPAIR-2G — block error codes whose humanized copy is SAFE to show directly
 * (no raw `operations.*` / Zod / id leakage). A blocked model preview is only
 * surfaced as-is when EVERY error code is in this set; anything else (e.g.
 * INVALID_PATCH / UNSUPPORTED_OPERATION from a malformed model patch) is replaced
 * by a deterministic diagnosis-targeted block or a handled NO_SAFE_PATCH.
 */
const LEAK_SAFE_BLOCK_CODES: ReadonlySet<string> = new Set([
  "MISSING_REQUIRED_FIELD",
  "INVALID_CONFIG",
  "UNKNOWN_TRIGGER",
  "UNKNOWN_ACTION",
  "UNKNOWN_NODE",
]);

function isLeakSafeBlock(preview: PatchPreviewResult): boolean {
  const errors = preview.validation.errors;
  return errors.length > 0 && errors.every((e) => LEAK_SAFE_BLOCK_CODES.has(e.code));
}

/** First diagnosed missing-required-field node id (internal target), or null. */
function firstMissingFieldNodeId(dto: AgentWorkflowDiagnosisDTO): string | null {
  for (const f of dto.findings ?? []) {
    if (f.code === "MISSING_REQUIRED_FIELD" && f.nodeIds && f.nodeIds.length > 0) {
      return f.nodeIds[0] ?? null;
    }
  }
  return null;
}

/**
 * AI-REPAIR-3H — the deterministic (model-free) repair preview lives in its own
 * module (`./deterministicRepairPreview`) and is run by the ROUTE *before* the credit
 * gate / model client, so it is free + emits no model telemetry. This file is now
 * exclusively the paid model path.
 */

/**
 * AI-REPAIR-2G — deterministic, MODEL-FREE targeted blocked preview built from the
 * diagnosis when the model's patch can't produce a clean targeted block. Applies a
 * minimal no-op `updateNodeConfig` (empty config) to the diagnosed missing-field
 * node, then runs the EXISTING preview engine — which re-derives the real
 * MISSING_REQUIRED_FIELD with resolved node/field LABELS + internal target
 * metadata, so the builder renders "Open <field> field" with no raw patch errors.
 * Returns the blocked preview, or null when no missing-field target exists / the
 * preview isn't blocked.
 */
async function buildDiagnosisTargetedBlockedPreview(args: {
  userId: string;
  workflowId: string;
  dto: AgentWorkflowDiagnosisDTO;
  baseRevision: string;
  draftDefinition?: WorkflowDefinition;
}): Promise<PatchPreviewResult | null> {
  const nodeId = firstMissingFieldNodeId(args.dto);
  if (!nodeId) return null;
  const patch: WorkflowPatch = {
    patchId: `repair-preview-target:${args.workflowId}`,
    workflowId: args.workflowId,
    baseRevision: args.baseRevision,
    operations: [{ op: "updateNodeConfig", nodeId, config: {} }] as PatchOperation[],
    summary: "Complete the required field",
    rationale: "Deterministic targeted preview derived from the workflow diagnosis.",
  };
  let res;
  try {
    res = await previewWorkflowPatchForAI({
      userId: args.userId,
      workflowId: args.workflowId,
      patch,
      ...(args.draftDefinition ? { draftDefinition: args.draftDefinition } : {}),
    });
  } catch {
    return null;
  }
  // Only useful when it actually produced a BLOCKED preview (the field is still
  // missing). If valid (field now present), the diagnosis was stale → no target.
  if (!res || !res.ok || res.data.ok !== false) return null;
  return res.data;
}

/**
 * AI-REPAIR-2H — resolve a "no safe automatic fix" outcome. A model DECLINE
 * (the most common path — the system prompt tells the model NOT to auto-patch a
 * user-input-required field like a missing message), unreadable / wrong-shape
 * output, or a patch that crashed the preview pipeline is only a GENERIC
 * `NO_SAFE_PATCH` when the diagnosis ALSO can't name a concrete target.
 *
 * When the diagnosis DOES carry a missing-required-field node, first build the
 * deterministic, MODEL-FREE targeted blocked preview (empty-config no-op on the
 * diagnosed node → the existing engine re-derives MISSING_REQUIRED_FIELD with
 * resolved node/field LABELS + internal target metadata) so the builder renders
 * "Open <field> field" instead of the dead-end generic copy. The generic
 * fallback is the LAST resort — only when no missing-field target exists.
 *
 * This is the same deterministic block AI-REPAIR-2G applied for a malformed
 * model patch; 2H simply runs it BEFORE the generic fallback at EVERY no-safe
 * exit, not just the "model produced a blocked patch" one.
 */
async function noSafePatchOrTargetedBlock(args: {
  userId: string;
  workflowId: string;
  dto: AgentWorkflowDiagnosisDTO;
  baseRevision: string;
  draftDefinition?: WorkflowDefinition;
  /** Safe telemetry sub-reason for the generic fallback (never user-facing). */
  detail?: string;
  model: RepairModelMeta;
}): Promise<PreviewWorkflowRepairResult> {
  const targeted = await buildDiagnosisTargetedBlockedPreview({
    userId: args.userId,
    workflowId: args.workflowId,
    dto: args.dto,
    baseRevision: args.baseRevision,
    ...(args.draftDefinition ? { draftDefinition: args.draftDefinition } : {}),
  });
  if (targeted) {
    return { ok: true, preview: targeted, model: args.model };
  }
  return {
    ok: false,
    code: "NO_SAFE_PATCH",
    message: "The AI couldn't build a safe automatic fix.",
    ...(args.detail ? { detail: args.detail } : {}),
    model: args.model,
  };
}

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
  /**
   * AI-REPAIR-2b — OPTIONAL trusted, already-validated current-draft definition
   * (the route parsed it via `parseDraftOverride`). When provided it is the
   * validation target AND the node-inventory source, so the preview matches the
   * unsaved canvas the user sees (the same snapshot the diagnosis used). The saved
   * definition is the fallback when absent. Never persisted.
   */
  readonly draftDefinition?: WorkflowDefinition;
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
  const { userId, workflowId, draftDefinition } = input;

  // 1. Load the saved graph for authz + the revision token (baseRevision). The
  //    VALIDATION TARGET + node inventory come from the current draft when the
  //    route supplied one (so the preview matches the unsaved canvas the user sees,
  //    consistent with the diagnosis), else from the saved definition.
  //    NO config reaches the model: we project only id / kind / provider / type.
  const graphRes = await getWorkflowGraphForAI(userId, workflowId);
  if (!graphRes.ok) {
    return { ok: false, code: "GRAPH_UNAVAILABLE", message: "Couldn't read the workflow to build a repair preview." };
  }
  const graph = graphRes.data;

  // AI-REPAIR-3H — the deterministic (model-free) repair preview is attempted by the
  // ROUTE *before* the credit gate / model client, so it is free + emits no model
  // telemetry. By the time this service runs, that fast-path has already returned null
  // (no deterministic repair available) — this function is exclusively the paid model
  // path. See `runDeterministicRepairPreview` above.

  // Inventory source = the draft (when provided) so the model targets ids that
  // exist in the SAME definition the patch will be validated against.
  const inventorySource = draftDefinition ?? graph;
  const nodeInventory = inventorySource.nodes.map((n) => ({
    id: n.id,
    kind: n.kind,
    provider: n.provider,
    type: n.type,
  }));
  const edgeInventory = inventorySource.edges.map((e) => ({ id: e.id, from: e.from, to: e.to }));

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
    // AI-REPAIR-2D — the model DECLINING to emit the forced tool (no tool call /
    // empty arguments) is an EXPECTED outcome when the remaining issue isn't safely
    // auto-patchable (a user-input-required field like a message, or a reconnect).
    // Surface that as a HANDLED `NO_SAFE_PATCH` (the route returns a friendly 200),
    // NOT a generic 503. Genuine provider/transport failures (not-configured /
    // rate-limit / 5xx / timeout / network / bad-input) stay `MODEL_FAILED` → 503.
    const declined =
      result.failureCode === "INVALID_RESPONSE" || result.failureCode === "EMPTY_RESPONSE";
    if (declined) {
      // AI-REPAIR-2H — a decline is the EXPECTED path for a user-input-required
      // field (the system prompt forbids auto-patching it). When the diagnosis
      // already names a missing-required-field node, emit the deterministic
      // targeted block ("Open <field> field") instead of the dead-end generic
      // copy; only fall back to generic NO_SAFE_PATCH when there's no target.
      return noSafePatchOrTargetedBlock({
        userId,
        workflowId,
        dto: input.dto,
        baseRevision: graph.updatedAt,
        ...(draftDefinition ? { draftDefinition } : {}),
        detail: "model_declined",
        model,
      });
    }
    return { ok: false, code: "MODEL_FAILED", message: `The model did not return a repair patch (${result.failureCode}).`, model };
  }

  // 3. Lenient envelope parse. Strict per-operation validation is the validator's job.
  //
  // AI-REPAIR-2E — the model RESPONDED (ok:true) but its tool output isn't a usable
  // patch (unreadable JSON / wrong envelope shape). This is "the AI couldn't build a
  // safe automatic fix", NOT a provider/transport outage — classify as the HANDLED
  // `NO_SAFE_PATCH` (friendly 200), never `PARSE_FAILED` → 503. `detail` keeps the
  // sub-reason observable in telemetry without surfacing it to the user.
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(result.text);
  } catch {
    // AI-REPAIR-2H — attempt the deterministic targeted block before the generic
    // fallback (the diagnosis may still name a missing-field target).
    return noSafePatchOrTargetedBlock({
      userId,
      workflowId,
      dto: input.dto,
      baseRevision: graph.updatedAt,
      ...(draftDefinition ? { draftDefinition } : {}),
      detail: "unreadable_model_json",
      model,
    });
  }
  const env = RepairPatchEnvelopeSchema.safeParse(parsedJson);
  if (!env.success) {
    // AI-REPAIR-2H — targeted block first; generic NO_SAFE_PATCH only with no target.
    return noSafePatchOrTargetedBlock({
      userId,
      workflowId,
      dto: input.dto,
      baseRevision: graph.updatedAt,
      ...(draftDefinition ? { draftDefinition } : {}),
      detail: "envelope_mismatch",
      model,
    });
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
    previewRes = await previewWorkflowPatchForAI({
      userId,
      workflowId,
      patch,
      ...(draftDefinition ? { draftDefinition } : {}),
    });
  } catch {
    // AI-REPAIR-2E — a malformed operation crashed normalize/validate before a clean
    // validation verdict. The model produced an unusable patch, not an infra failure:
    // handled `NO_SAFE_PATCH` (friendly 200), never `PARSE_FAILED` → 503.
    // AI-REPAIR-2H — but the diagnosis-derived empty-config block runs through a
    // SEPARATE preview call, so try it first: a malformed model op doesn't mean we
    // can't deterministically point the user at the still-missing field.
    return noSafePatchOrTargetedBlock({
      userId,
      workflowId,
      dto: input.dto,
      baseRevision: graph.updatedAt,
      ...(draftDefinition ? { draftDefinition } : {}),
      detail: "preview_pipeline_throw",
      model,
    });
  }
  if (!previewRes.ok) {
    // The graph could not be read for the preview (e.g. NOT_FOUND). Surface safely.
    return { ok: false, code: "GRAPH_UNAVAILABLE", message: "Couldn't preview the proposed repair.", model };
  }

  const modelPreview = previewRes.data;

  // A VALID model patch (applyable later) is surfaced as-is.
  if (modelPreview.ok) {
    return { ok: true, preview: modelPreview, model };
  }

  // AI-REPAIR-2G — the model patch is BLOCKED. A malformed model patch yields raw
  // structural errors (INVALID_PATCH / UNSUPPORTED_OPERATION → `operations.0.nodeId:
  // Required`, `Unrecognized key(s) … 'id'`) AND no usable target. Prefer a
  // deterministic, diagnosis-derived TARGETED block so the builder shows a safe
  // label-based reason + "Open <field> field" — never raw patch errors.
  const targeted = await buildDiagnosisTargetedBlockedPreview({
    userId,
    workflowId,
    dto: input.dto,
    baseRevision: graph.updatedAt,
    ...(draftDefinition ? { draftDefinition } : {}),
  });
  if (targeted) {
    return { ok: true, preview: targeted, model };
  }

  // No diagnosis target. Surface the model's block ONLY if every error is
  // leak-safe (humanized, no raw structural text); otherwise it's an unusable
  // malformed patch → handled NO_SAFE_PATCH (never raw `operations.*`).
  if (isLeakSafeBlock(modelPreview)) {
    return { ok: true, preview: modelPreview, model };
  }
  return {
    ok: false,
    code: "NO_SAFE_PATCH",
    message: "The AI couldn't build a safe automatic fix.",
    detail: "malformed_model_patch",
    model,
  };
}
