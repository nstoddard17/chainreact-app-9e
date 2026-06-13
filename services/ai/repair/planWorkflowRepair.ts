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

/**
 * LLM repair-PLAN proposer for a safe workflow-diagnosis DTO (Slice 4.AI-REPAIR-1b).
 *
 * The action-oriented sibling of `explainWorkflowDiagnosis`: where Explain
 * DESCRIBES the diagnosis, this PROPOSES (in plain language) what to change to
 * fix it. It is a PROPOSAL ONLY — it produces NO patch, NO `WorkflowPatch`, NO
 * apply, NO save, NO run, NO graph mutation. Executable repair belongs to a later
 * slice (AI-REPAIR-2) on top of the existing `validateWorkflowPatch` engine.
 *
 * Pure orchestration with an INJECTED model client (mirrors
 * `explainWorkflowDiagnosis`): project the DTO to the allow-listed context →
 * constrained prompt → force a single structured tool call → parse +
 * Zod-validate → return a discriminated result. NO mutation, NO DB write, NO
 * account/billing concept (the route owns authz + the credit gate + recording).
 *
 * No-leak: the model sees ONLY `buildDiagnosisExplainContext(dto)` — never raw
 * config, tokens, integration rows, account metadata, node/workflow/run ids, or a
 * client-posted blob (the route re-derives the DTO server-side and passes it
 * here). The system prompt forbids claiming any fix/apply/save/run happened.
 */

/** Tool name surfaced to the model + matched in the tool_use response block. */
export const PROPOSE_WORKFLOW_REPAIR_TOOL_NAME = "propose_workflow_repair";

/** Immutable safety line. Server-set (NOT model-supplied) so it can never be dropped/altered. */
export const REPAIR_NOT_APPLIED_NOTICE =
  "This is a suggestion only — your workflow wasn't changed, saved, or run.";

/** JSON Schema for the bounded structured output. No secrets / user data. `notAppliedNotice` is server-set. */
const PROPOSE_WORKFLOW_REPAIR_TOOL: ModelResponseTool = {
  name: PROPOSE_WORKFLOW_REPAIR_TOOL_NAME,
  description:
    "Propose, in plain language, how the user could fix the provided workflow diagnosis. Recommend changes only — do not claim anything was changed, applied, saved, fixed, or run.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: {
        type: "string",
        description:
          "One short paragraph: what is wrong and the gist of how to fix it. Do not claim anything was fixed/applied/saved/run.",
      },
      recommendedActions: {
        type: "array",
        items: { type: "string" },
        description:
          "Ordered, plain-language changes the user should make, highest-impact first. Each is a recommendation, not an action taken.",
      },
      affectedNodes: {
        type: "array",
        items: { type: "string" },
        description:
          "Human labels for the steps involved (e.g. \"Gmail — Send Email\"). Labels only — never ids or config values.",
      },
      missingInfo: {
        type: "array",
        items: { type: "string" },
        description: "Specific information or decisions the user must provide before the fix can be made, if any.",
      },
      riskLevel: {
        type: "string",
        enum: ["low", "medium", "high"],
        description: "Your estimate of how risky applying these changes would be. Advisory only.",
      },
      canAutoPatchLater: {
        type: "boolean",
        description: "Whether the recommended changes look like something the builder could auto-apply later. Advisory hint only.",
      },
      requiresUserAction: {
        type: "boolean",
        description: "True if the user must do something outside the builder (e.g. reconnect an account) before the fix works.",
      },
    },
    required: ["summary", "riskLevel"],
  },
};

const SYSTEM_PROMPT =
  "You propose how to fix an ALREADY-COMPUTED, safe workflow diagnosis. Recommend the changes " +
  "the user should make, in plain language, highest-impact first, and say what information or " +
  "action is still needed. You CANNOT and DID NOT change, fix, apply, save, repair, or run " +
  "anything — these are SUGGESTIONS the user will review and apply themselves; never imply " +
  "otherwise. Use ONLY the provided diagnosis context; do not invent providers, fields, nodes, " +
  "causes, or steps. Refer to steps by their provider/action label, never by an id. If information " +
  "is missing, ask for it. Be concise.";

/** Bounded output caps so a runaway response can't bloat the prompt/ledger. */
const MAX_OUTPUT_TOKENS = 1_000;

/** Advisory risk estimate from the model (UI labels it as such; never gates anything). */
export type RepairRiskLevel = "low" | "medium" | "high";

/** The sanitized, proposal-only result surface (NOT a patch). */
export interface RepairProposal {
  readonly summary: string;
  readonly recommendedActions: readonly string[];
  /** Safe human labels only — never node ids or config values. */
  readonly affectedNodes: readonly string[];
  readonly missingInfo: readonly string[];
  /** Advisory — never authoritative, never gates/enables anything. */
  readonly riskLevel: RepairRiskLevel;
  readonly canAutoPatchLater: boolean;
  readonly requiresUserAction: boolean;
  /** Server-set immutable safety line. */
  readonly notAppliedNotice: string;
}

/** Strict re-validation of the model's structured output (never trust raw text). */
const RepairModelOutputSchema = z.object({
  summary: z.string().min(1).max(4_000),
  recommendedActions: z.array(z.string().max(1_000)).max(12).optional(),
  affectedNodes: z.array(z.string().max(400)).max(12).optional(),
  missingInfo: z.array(z.string().max(1_000)).max(12).optional(),
  riskLevel: z.enum(["low", "medium", "high"]),
  canAutoPatchLater: z.boolean().optional(),
  requiresUserAction: z.boolean().optional(),
});

export interface RepairModelMeta {
  readonly modelId: string;
  readonly tier: ModelTier;
  readonly usage?: ModelTokenUsage;
  readonly latencyMs?: number;
}

export type PlanWorkflowRepairResult =
  | {
      ok: true;
      proposal: RepairProposal;
      model: RepairModelMeta;
    }
  | {
      ok: false;
      code: "MODEL_FAILED" | "PARSE_FAILED";
      message: string;
      model?: RepairModelMeta;
    };

export interface PlanWorkflowRepairInput {
  /** Re-derived server-side by the route (access==="OK"). Never client-posted. */
  readonly dto: AgentWorkflowDiagnosisDTO;
  /** Injected (tests pass a mock; the route passes the OpenAI fast client). */
  readonly modelClient: ModelClient;
  /** Tier the call will use (drives telemetry); defaults to `fast`. */
  readonly tier?: ModelTier;
}

/**
 * Propose a repair plan for a safe diagnosis DTO. Returns a structured result;
 * never throws for a model/parse failure (the route maps `ok:false` to a safe
 * 503). Proposal-only — produces no patch and mutates nothing.
 */
export async function planWorkflowRepair(
  input: PlanWorkflowRepairInput,
): Promise<PlanWorkflowRepairResult> {
  const tier: ModelTier = input.tier ?? "fast";
  const context = buildDiagnosisExplainContext(input.dto);

  const request: ModelGenerateInput = {
    feature: "repair",
    tier,
    responseTool: PROPOSE_WORKFLOW_REPAIR_TOOL,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Here is the workflow diagnosis to propose a fix for:\n\n${JSON.stringify(context)}`,
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
    return {
      ok: false,
      code: "MODEL_FAILED",
      message: `The model did not return a repair proposal (${result.failureCode}).`,
      model,
    };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(result.text);
  } catch {
    return { ok: false, code: "PARSE_FAILED", message: "The model response was not valid JSON.", model };
  }
  const validated = RepairModelOutputSchema.safeParse(parsedJson);
  if (!validated.success) {
    return {
      ok: false,
      code: "PARSE_FAILED",
      message: "The model response did not match the expected repair-proposal shape.",
      model,
    };
  }

  const d = validated.data;
  const proposal: RepairProposal = {
    summary: d.summary,
    recommendedActions: d.recommendedActions ?? [],
    affectedNodes: d.affectedNodes ?? [],
    missingInfo: d.missingInfo ?? [],
    riskLevel: d.riskLevel,
    canAutoPatchLater: d.canAutoPatchLater ?? false,
    requiresUserAction: d.requiresUserAction ?? false,
    // Server-set — the model never supplies this, so it can never be dropped or altered.
    notAppliedNotice: REPAIR_NOT_APPLIED_NOTICE,
  };

  return { ok: true, proposal, model };
}
