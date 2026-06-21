/**
 * Strict response contract + normalizer for the Hermes Agent gateway (HERMES-AGENT-RESPONSE-CONTRACT).
 *
 * Now that the live success envelope is known, ChainReact validates it deterministically (Zod) and
 * normalizes it into a small advisory result. Hermes guidance stays ADVISORY and FAILS CLOSED:
 *   - the success envelope is `{ ok: true, response: { choices: [{ message: { content } }], usage? } }`;
 *   - `ok: false` (even on HTTP 2xx) is a provider error, surfaced as a SAFE short code only;
 *   - a malformed envelope / missing choices / missing or empty content → typed INVALID_RESPONSE;
 *   - `usage` is OPTIONAL and only a sanitized token summary (NOT trusted for billing);
 *   - unknown extra fields are allowed but ignored (never copied into the normalized output);
 *   - a plan-like object is NEVER accepted as a WorkflowPlan unless it passes the real ChainReact
 *     capability validator — and this slice keeps `workflowPlan: null` for the normal text reply.
 *
 * Nothing here mutates a workflow, reads secrets, or calls a model/Nous/OpenAI directly.
 */

import { z } from "zod";
import type { GuidanceUnavailableCode } from "@/contracts/aiGuidance";
import type { WorkflowPlan, WorkflowPlanStep } from "@/contracts/guidanceSession";
import { WORKFLOW_PLAN_SCHEMA_VERSION } from "@/contracts/guidanceSession";
import { validateWorkflowPlan } from "../validateWorkflowPlan";

/** Sanitized token summary — numeric counts only. NOT authoritative for billing. */
export interface SanitizedUsage {
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly totalTokens?: number;
}

/** The normalized, advisory guidance result ChainReact trusts after validation. */
export type NormalizedGatewayGuidance =
  | {
      readonly ok: true;
      readonly guidanceText: string;
      readonly source: "hermes-agent";
      /** null for now — a plan is only surfaced if a structured plan object passes validateWorkflowPlan. */
      readonly workflowPlan: WorkflowPlan | null;
      readonly rawUsage?: SanitizedUsage;
      readonly warnings?: readonly string[];
    }
  | { readonly ok: false; readonly code: GuidanceUnavailableCode; readonly reason?: string };

/** OpenAI-style success envelope the gateway forwards. `.passthrough()` ignores unknown extras. */
const messageSchema = z.object({ content: z.string() }).passthrough();
const choiceSchema = z.object({ message: messageSchema }).passthrough();
const usageSchema = z
  .object({
    prompt_tokens: z.number().optional(),
    completion_tokens: z.number().optional(),
    total_tokens: z.number().optional(),
  })
  .passthrough();
const innerResponseSchema = z
  .object({ choices: z.array(choiceSchema).min(1), usage: usageSchema.optional() })
  .passthrough();

export const gatewaySuccessEnvelopeSchema = z
  .object({ ok: z.literal(true), response: innerResponseSchema })
  .passthrough();

export type GatewaySuccessEnvelope = z.infer<typeof gatewaySuccessEnvelopeSchema>;

/** Safe short error code (uppercase/underscore) from the gateway's `{ ok: false, error }` envelope. */
function safeGatewayErrorReason(raw: Record<string, unknown>): string {
  const code = raw.error;
  return typeof code === "string" && /^[A-Z0-9_]{1,40}$/.test(code) ? code : "gateway_error";
}

/** Copy ONLY numeric token counts. Drops everything else. */
function sanitizeUsage(usage: unknown): SanitizedUsage | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const u = usage as Record<string, unknown>;
  const out: { promptTokens?: number; completionTokens?: number; totalTokens?: number } = {};
  if (typeof u.prompt_tokens === "number") out.promptTokens = u.prompt_tokens;
  if (typeof u.completion_tokens === "number") out.completionTokens = u.completion_tokens;
  if (typeof u.total_tokens === "number") out.totalTokens = u.total_tokens;
  return Object.keys(out).length ? out : undefined;
}

/**
 * If the reply carries a STRUCTURED plan object (top-level or under `response`), build a WorkflowPlan
 * for capability validation. Returns the candidate or null. (We never parse the model's free-text
 * content as a plan — only an explicit plan object.)
 */
function extractPlanCandidate(raw: unknown): WorkflowPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const top = raw as { workflowPlan?: unknown; plan?: unknown; response?: unknown };
  const nested = top.response && typeof top.response === "object" ? (top.response as { workflowPlan?: unknown; plan?: unknown }) : undefined;
  const planObj = top.workflowPlan ?? top.plan ?? nested?.workflowPlan ?? nested?.plan;
  if (!planObj || typeof planObj !== "object") return null;
  const steps = (planObj as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return null;
  const planSteps: WorkflowPlanStep[] = steps
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .filter((s) => typeof s.provider === "string" && typeof s.type === "string" && typeof s.role === "string")
    .map((s, i) => ({
      ref: typeof s.ref === "string" ? s.ref : `s${i}`,
      role: s.role as WorkflowPlanStep["role"],
      provider: s.provider as string,
      type: s.type as string,
      purpose: typeof s.purpose === "string" ? s.purpose : "",
    }));
  if (planSteps.length === 0) return null;
  const p = planObj as { title?: unknown; summary?: unknown };
  return {
    schemaVersion: WORKFLOW_PLAN_SCHEMA_VERSION,
    title: typeof p.title === "string" ? p.title : "",
    summary: typeof p.summary === "string" ? p.summary : "",
    steps: planSteps,
    notApplied: true,
  };
}

/**
 * Normalize a parsed gateway reply (the JSON body) into a safe `NormalizedGatewayGuidance`.
 * Deterministic + fail-closed; never throws; never copies secrets/unknown fields into the output.
 */
export function normalizeGatewayResponse(raw: unknown): NormalizedGatewayGuidance {
  // 1. The gateway's own failure envelope (`{ ok: false, ... }`) — even on HTTP 2xx — is a provider
  //    error. Surface only the safe short error code; never nested downstream messages.
  if (raw && typeof raw === "object" && (raw as { ok?: unknown }).ok === false) {
    return { ok: false, code: "PROVIDER_ERROR", reason: safeGatewayErrorReason(raw as Record<string, unknown>) };
  }

  // 2. A structured plan object is only usable if ChainReact's capability validator accepts it.
  //    An invalid plan fails CLOSED (never accept arbitrary JSON as a plan).
  const planCandidate = extractPlanCandidate(raw);
  if (planCandidate && !validateWorkflowPlan(planCandidate).ok) {
    return { ok: false, code: "INVALID_RESPONSE", reason: "plan referenced unknown capabilities" };
  }

  // 3. Validate the known success envelope (ok:true + response.choices[0].message.content).
  const parsed = gatewaySuccessEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, code: "INVALID_RESPONSE", reason: "malformed gateway envelope" };
  }

  const choices = parsed.data.response.choices;
  const content = choices[0]!.message.content;
  if (typeof content !== "string" || content.trim() === "") {
    return { ok: false, code: "INVALID_RESPONSE", reason: "empty guidance content" };
  }

  const warnings: string[] = [];
  if (choices.length > 1) warnings.push("multiple_choices_truncated");

  const rawUsage = sanitizeUsage(parsed.data.response.usage);
  return {
    ok: true,
    guidanceText: content.trim(),
    source: "hermes-agent",
    workflowPlan: planCandidate ?? null,
    ...(rawUsage ? { rawUsage } : {}),
    ...(warnings.length ? { warnings } : {}),
  };
}
