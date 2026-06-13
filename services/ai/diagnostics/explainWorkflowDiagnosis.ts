import { z } from "zod";
import type {
  ModelClient,
  ModelGenerateInput,
  ModelResponseTool,
  ModelTier,
  ModelTokenUsage,
} from "@/core/ai/modelTypes";
import type { AgentWorkflowDiagnosisDTO } from "./diagnoseWorkflowForAgent";
import {
  buildDiagnosisExplainContext,
} from "./buildDiagnosisExplainContext";

/**
 * LLM explainer for a safe workflow-diagnosis DTO (Slice 4.AI-DIAG-2a).
 *
 * Pure orchestration with an INJECTED model client (mirrors
 * `planWorkflowFromPromptForAI`): project the DTO to the allow-listed context →
 * build a constrained prompt → force a single structured tool call → parse +
 * Zod-validate the result. It makes NO mutation, NO DB write, NO apply, and has
 * NO account/billing concept (the route owns authz + the credit gate + recording).
 *
 * Explanation-ONLY: the system prompt forbids claiming any fix/apply/run, and the
 * model sees ONLY `buildDiagnosisExplainContext(dto)` — never raw config, tokens,
 * integration rows, account metadata, node/workflow/run ids, or a client-posted
 * blob (the route re-derives the DTO server-side and passes it here).
 */

/** Tool name surfaced to the model + matched in the tool_use response block. */
export const DIAGNOSIS_EXPLAIN_TOOL_NAME = "explain_workflow_diagnosis";

/** JSON Schema for the bounded structured output. No secrets / user data. */
const DIAGNOSIS_EXPLAIN_TOOL: ModelResponseTool = {
  name: DIAGNOSIS_EXPLAIN_TOOL_NAME,
  description:
    "Return a plain-language explanation of the provided, already-computed workflow diagnosis.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      explanation: {
        type: "string",
        description:
          "A concise, plain-language explanation of what is wrong and what the user should do. Do not claim anything was fixed, applied, or run.",
      },
      priorities: {
        type: "array",
        items: { type: "string" },
        description: "The most important issues to address first, highest priority first.",
      },
      missingInfo: {
        type: "array",
        items: { type: "string" },
        description: "Specific information or actions the user must provide, if any.",
      },
    },
    required: ["explanation"],
  },
};

const SYSTEM_PROMPT =
  "You explain an ALREADY-COMPUTED, safe workflow diagnosis in plain language. " +
  "Explain what is wrong and why, prioritize the most important issues first, and tell the user " +
  "exactly what information or action is needed. You CANNOT and DID NOT change, fix, apply, save, " +
  "or run anything — never imply otherwise. Use ONLY the provided diagnosis context; do not invent " +
  "providers, fields, causes, or steps. If information is missing, ask for it. Be concise.";

/** Bounded output caps so a runaway response can't bloat the prompt/ledger. */
const MAX_OUTPUT_TOKENS = 800;

/** Strict re-validation of the model's structured output (never trust raw text). */
const ExplanationSchema = z.object({
  explanation: z.string().min(1).max(4_000),
  priorities: z.array(z.string().max(400)).max(12).optional(),
  missingInfo: z.array(z.string().max(400)).max(12).optional(),
});

export interface ExplainModelMeta {
  readonly modelId: string;
  readonly tier: ModelTier;
  readonly usage?: ModelTokenUsage;
  readonly latencyMs?: number;
}

export type ExplainWorkflowDiagnosisResult =
  | {
      ok: true;
      explanation: string;
      priorities?: readonly string[];
      missingInfo?: readonly string[];
      model: ExplainModelMeta;
    }
  | {
      ok: false;
      code: "MODEL_FAILED" | "PARSE_FAILED";
      message: string;
      model?: ExplainModelMeta;
    };

export interface ExplainWorkflowDiagnosisInput {
  /** Re-derived server-side by the route (access==="OK"). Never client-posted. */
  readonly dto: AgentWorkflowDiagnosisDTO;
  /** Injected (tests pass a mock; the route passes the OpenAI fast client). */
  readonly modelClient: ModelClient;
  /** Tier the call will use (drives telemetry); defaults to `fast`. */
  readonly tier?: ModelTier;
}

/**
 * Explain a safe diagnosis DTO. Returns a structured result; never throws for a
 * model/parse failure (the route maps `ok:false` to a safe 503).
 */
export async function explainWorkflowDiagnosis(
  input: ExplainWorkflowDiagnosisInput,
): Promise<ExplainWorkflowDiagnosisResult> {
  const tier: ModelTier = input.tier ?? "fast";
  const context = buildDiagnosisExplainContext(input.dto);

  const request: ModelGenerateInput = {
    feature: "explanation",
    tier,
    responseTool: DIAGNOSIS_EXPLAIN_TOOL,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Here is the workflow diagnosis to explain:\n\n${JSON.stringify(context)}`,
      },
    ],
  };

  const result = await input.modelClient.generateStructuredJson(request);
  const model: ExplainModelMeta = {
    modelId: result.modelId,
    tier,
    ...(result.ok && result.usage ? { usage: result.usage } : {}),
    ...(result.latencyMs !== undefined ? { latencyMs: result.latencyMs } : {}),
  };

  if (!result.ok) {
    return {
      ok: false,
      code: "MODEL_FAILED",
      message: `The model did not return an explanation (${result.failureCode}).`,
      model,
    };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(result.text);
  } catch {
    return { ok: false, code: "PARSE_FAILED", message: "The model response was not valid JSON.", model };
  }
  const validated = ExplanationSchema.safeParse(parsedJson);
  if (!validated.success) {
    return {
      ok: false,
      code: "PARSE_FAILED",
      message: "The model response did not match the expected explanation shape.",
      model,
    };
  }

  return {
    ok: true,
    explanation: validated.data.explanation,
    ...(validated.data.priorities ? { priorities: validated.data.priorities } : {}),
    ...(validated.data.missingInfo ? { missingInfo: validated.data.missingInfo } : {}),
    model,
  };
}
