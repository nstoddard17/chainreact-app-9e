/**
 * Slice 4.AI-34C — OpenAI fast-tier intent classifier (model-backed seam).
 *
 * This is the model implementation that plugs into the AI-31
 * `NarrowingClassifierResult` seam. It calls OpenAI `gpt-4.1-mini` (fast
 * tier) through the NORMAL model-client abstraction
 * (`createModelClientForModel(getModelForProviderTier("openai","fast"), key)`)
 * with a tiny forced-tool request, and returns classifier-shaped output the
 * planner uses ADVISORILY to ADD provider candidates to the deterministic
 * narrowed catalog.
 *
 * It is **additive-only and never authoritative**: the union into narrowing
 * (in `resolvePromptClassifier`) can only ADD valid catalog providers, never
 * remove an explicit / connected / canvas / deterministic provider, and never
 * shrink a full-catalog fallback. The actual workflow PLANNER call stays on
 * Anthropic / Sonnet — this slice never routes patch generation to OpenAI.
 *
 * Gating (all three required, else the classifier is skipped and the planner
 * falls back to the AI-31 deterministic classifier):
 *   1. `ENABLE_AI_MODEL_NARROWING_CLASSIFIER === "true"` (default off),
 *   2. `ENABLE_OPENAI_PROVIDER === "true"` (`isOpenAiProviderEnabled()`),
 *   3. `OPENAI_API_KEY` present (server-side).
 *
 * Fail-safe: ANY failure (not configured / model error / parse error / throw)
 * returns `{ result: null, outcome }` — the plan ALWAYS proceeds on
 * deterministic narrowing. No exception escapes.
 *
 * No-leak: the tiny prompt carries only the user request + provider ids +
 * connected/canvas provider ids — NO full catalog, NO config fields, NO
 * secrets, NO chat history. The API key lives only inside the adapter closure
 * (read server-side from `OPENAI_API_KEY`). The classifier RESULT carries only
 * provider ids + enums + booleans; telemetry records counts + enums only
 * (never raw classifier text).
 *
 * Plan reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §4.1
 * + docs/slices/phase-4/planner-model-tier-routing-audit.md.
 */

import { getModelForProviderTier, MODEL_API_KEY_ENV } from "@/core/ai/models";
import type {
  ModelClient,
  ModelGenerateInput,
  ModelMessage,
  ModelResponseTool,
} from "@/core/ai/modelTypes";
import {
  createModelClientForModel,
  isOpenAiProviderEnabled,
} from "@/services/ai/modelClients";
import type { NarrowingClassifierResult } from "./narrowingClassifier";
import type { NarrowProvidersInput } from "./narrowProvidersForPlan";
import type { ModelClassifierOutcome } from "./types";

const CLASSIFIER_MAX_OUTPUT_TOKENS = 400;
/** Hard cap on array sizes parsed back from the model (defensive). */
const MAX_HINTS = 30;

/** Ambiguous capability categories the classifier should flag rather than guess. */
const AMBIGUOUS_CATEGORY_HINT =
  "email apps: gmail, microsoft-outlook; calendar apps: google-calendar, microsoft-outlook-calendar; file storage: google-drive, microsoft-onedrive, dropbox; chat: slack, discord, microsoft-teams.";

/**
 * The forced tool the model MUST call. Mirrors the {@link NarrowingClassifierResult}
 * seam shape (minus `source` / `modelTier`, which this module sets). Compact +
 * enum-driven so the output is small and sanitizer-safe.
 */
export const CLASSIFY_INTENT_TOOL: ModelResponseTool = {
  name: "classify_workflow_intent",
  description:
    "Classify the user's workflow-builder request: which providers it needs, the intent, and whether it is ambiguous. ADD providers the request clearly needs; do not omit a provider the user named.",
  inputSchema: {
    type: "object",
    properties: {
      intentType: {
        type: "string",
        enum: ["create", "edit", "repair", "help", "unknown"],
        description: "High-level intent.",
      },
      confidence: {
        type: "string",
        enum: ["high", "medium", "low"],
        description: "Confidence the provider set is correct/safe.",
      },
      candidateProviders: {
        type: "array",
        items: { type: "string" },
        description: "Provider ids (from the provided list) the request needs.",
      },
      triggerHints: {
        type: "array",
        items: { type: "string" },
        description: "provider:type keys you expect to be the trigger; [] if unsure.",
      },
      actionHints: {
        type: "array",
        items: { type: "string" },
        description: "provider:type keys you expect to be actions; [] if unsure.",
      },
      broadOrAmbiguous: {
        type: "boolean",
        description:
          "true when the request is too broad/ambiguous to safely pick providers (e.g. generic 'email' without naming Gmail or Outlook).",
      },
    },
    required: ["intentType", "confidence", "candidateProviders", "broadOrAmbiguous"],
    additionalProperties: false,
  },
};

/** Whether the OpenAI model classifier feature is enabled (default OFF). */
export function isModelNarrowingClassifierEnabled(): boolean {
  return process.env.ENABLE_AI_MODEL_NARROWING_CLASSIFIER === "true";
}

/**
 * Build the tiny classifier prompt. Carries ONLY: the user request, the
 * available provider ids, ambiguous-category hints, and the connected /
 * canvas provider ids. NO full catalog, NO config fields, NO secrets, NO
 * chat history. Exported pure for tests + the verification script.
 */
export function buildModelClassifierMessages(input: NarrowProvidersInput): ModelMessage[] {
  const providerIds = input.catalog.providers.map((p) => p.id);
  const connectedIds = input.connectedIntegrations.map((i) => i.provider);
  const canvasIds = (input.currentGraph?.nodes ?? []).map((n) => `${n.provider}:${n.type}`);

  const system = [
    "You are a fast intent classifier for a workflow-builder. Given a user request and the list of available provider ids, decide which providers the workflow needs and the intent.",
    "Rules: use ONLY provider ids from the 'Available provider ids' list. If the user names a generic category (email/calendar/drive/chat) without naming the app, set broadOrAmbiguous true and include EVERY plausible provider for that category. Never invent ids. Call the tool exactly once.",
    `Ambiguous categories — ${AMBIGUOUS_CATEGORY_HINT}`,
  ].join("\n");

  const user = [
    `User request: ${input.userRequest}`,
    `Available provider ids: ${providerIds.join(", ")}`,
    `Connected provider ids: ${connectedIds.length > 0 ? connectedIds.join(", ") : "(none)"}`,
    `Current canvas: ${canvasIds.length > 0 ? canvasIds.join(", ") : "(empty)"}`,
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function asStringArray(value: unknown, catalogIds?: ReadonlySet<string>): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    if (catalogIds && !catalogIds.has(item)) continue; // ignore unknown ids
    if (!out.includes(item)) out.push(item);
    if (out.length >= MAX_HINTS) break;
  }
  return out;
}

/**
 * Parse + validate the model's tool arguments into a {@link NarrowingClassifierResult}.
 * Unknown provider ids in `candidateProviders` are IGNORED (filtered against the
 * catalog). Returns `null` when the payload is not usable JSON / shape.
 */
export function parseModelClassifierResponse(
  text: string,
  catalogIds: ReadonlySet<string>,
): NarrowingClassifierResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;

  const intentType: NarrowingClassifierResult["intentType"] =
    obj.intentType === "create" ||
    obj.intentType === "edit" ||
    obj.intentType === "repair" ||
    obj.intentType === "help"
      ? obj.intentType
      : "unknown";
  const confidence: NarrowingClassifierResult["confidence"] =
    obj.confidence === "high" || obj.confidence === "medium" ? obj.confidence : "low";

  return {
    intentType,
    confidence,
    candidateProviders: asStringArray(obj.candidateProviders, catalogIds),
    triggerHints: asStringArray(obj.triggerHints),
    actionHints: asStringArray(obj.actionHints),
    broadOrAmbiguous: obj.broadOrAmbiguous === true,
    source: "model",
    modelTier: "fast",
  };
}

export interface RunModelClassifierResult {
  readonly result: NarrowingClassifierResult | null;
  readonly outcome: ModelClassifierOutcome;
}

export interface RunModelClassifierOptions {
  /** Injectable client for tests — defaults to the env-resolved OpenAI fast adapter. */
  readonly modelClient?: ModelClient;
}

/**
 * Run the OpenAI fast-tier classifier with full gating + fail-safe fallback.
 * Never throws; always resolves to a typed outcome. When `result` is non-null
 * (`outcome === "model_succeeded"`) the caller may union its candidates into
 * narrowing; otherwise the caller stays on deterministic narrowing.
 */
export async function runModelNarrowingClassifier(
  input: NarrowProvidersInput,
  options: RunModelClassifierOptions = {},
): Promise<RunModelClassifierResult> {
  if (!isModelNarrowingClassifierEnabled()) {
    return { result: null, outcome: "model_disabled" };
  }
  if (!isOpenAiProviderEnabled()) {
    return { result: null, outcome: "openai_not_configured" };
  }
  const apiKey = process.env[MODEL_API_KEY_ENV.openai];
  if (!apiKey && !options.modelClient) {
    return { result: null, outcome: "openai_not_configured" };
  }

  try {
    const model = getModelForProviderTier("openai", "fast");
    const client = options.modelClient ?? createModelClientForModel(model, apiKey);
    const request: ModelGenerateInput = {
      feature: "discovery",
      tier: "fast",
      maxOutputTokens: CLASSIFIER_MAX_OUTPUT_TOKENS,
      responseTool: CLASSIFY_INTENT_TOOL,
      messages: buildModelClassifierMessages(input),
    };
    const modelResult = await client.generateStructuredJson(request);
    if (!modelResult.ok) {
      return { result: null, outcome: "model_failed" };
    }
    const catalogIds = new Set(input.catalog.providers.map((p) => p.id));
    const parsedResult = parseModelClassifierResponse(modelResult.text, catalogIds);
    if (!parsedResult) {
      return { result: null, outcome: "model_failed" };
    }
    return { result: parsedResult, outcome: "model_succeeded" };
  } catch {
    return { result: null, outcome: "model_failed" };
  }
}
