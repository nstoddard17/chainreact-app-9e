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
 *   - a plan is NEVER accepted as a WorkflowPlan unless it passes the real ChainReact capability
 *     validator. A structured plan may be surfaced two ways: (a) an envelope-sibling plan object
 *     (strict — an invalid one fails the whole response closed), or (b) a fenced ```json block
 *     embedded in the guidance text (best-effort — an invalid embedded plan is dropped with a safe
 *     warning, the prose guidance is still returned). HERMES-AGENT-PLAN-EXTRACTION added (b).
 *
 * The plan is ADVISORY ONLY (`notApplied: true`); surfacing it never creates, mutates, applies,
 * runs, or persists a workflow. Nothing here reads secrets or calls a model/Nous/OpenAI directly.
 */

import { z } from "zod";
import type { GuidanceUnavailableCode } from "@/contracts/aiGuidance";
import type { WorkflowPlan, WorkflowPlanStep } from "@/contracts/guidanceSession";
import { WORKFLOW_PLAN_SCHEMA_VERSION } from "@/contracts/guidanceSession";
import type { PatchOperation } from "@/services/workflows/patch/types";
import { summarizeInvalidPlan, validateWorkflowPlan } from "../validateWorkflowPlan";
import { extractMutationOperationsFromText, extractPlanFromText, stripSourceBlock } from "./extractPlanFromText";

/**
 * Legacy generic warning. RETAINED for back-compat only — the normalizer no longer emits it. When an
 * embedded plan fails capability validation we now REPLACE the guidance text with the SPECIFIC,
 * actionable reason from `summarizeInvalidPlan` (e.g. the "where does the data come from?" source
 * question) instead of a vague "couldn't be validated" that left the user staring at an empty canvas.
 */
export const PLAN_NOT_VALIDATED_WARNING = "Suggested plan could not be validated.";

/** Neutral lead-in used only when the model returned a bare plan with no prose to display. */
const PLAN_ONLY_FALLBACK_TEXT =
  "Here's a suggested plan based on what you described. Review it below — nothing in your workflow has been changed.";

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
      /** A capability-validated advisory plan, or null. Only set when validateWorkflowPlan passed. */
      readonly workflowPlan: WorkflowPlan | null;
      /**
       * HERMES-AGENT-WORKFLOW-EDITOR — structurally-valid `WorkflowPatch` operations the model proposed
       * for an EDIT of the user's current draft (stable node refs). STRUCTURE-validated here (Zod) only;
       * the route runs the catalog/atomic validation against the local draft (`proposeWorkflowMutation`).
       * Absent when the reply has no patch block.
       */
      readonly mutationOperations?: readonly PatchOperation[];
      /**
       * HERMES-AGENT-WORKFLOW-EDITOR-LIVE — the editable-graph `version` the model echoed in its patch
       * block. The route compares it to the live draft version and rejects a STALE proposal. Absent when
       * the model didn't echo one (the route falls back to the snapshot version it built the graph from).
       */
      readonly mutationBaseVersion?: string;
      /**
       * HERMES-AGENT-WORKFLOW-EDITOR — a mutation-shaped block was present but could NOT be turned into a
       * usable patch (and the reply was not a clarification question). The route surfaces a safe
       * "couldn't preview that change" message instead of silently leaving the canvas unchanged.
       */
      readonly mutationMalformed?: boolean;
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
  //    An invalid plan fails CLOSED (never accept arbitrary JSON as a plan). The de-identified
  //    capability KEYS are folded into the internal `reason` for server logs/dev only (no secrets,
  //    no model JSON) — the route maps any `ok:false` to a generic user-facing message.
  const planCandidate = extractPlanCandidate(raw);
  if (planCandidate) {
    const validation = validateWorkflowPlan(planCandidate);
    if (!validation.ok) {
      const keys = summarizeInvalidPlan(validation.invalidSteps).invalidCapabilityKeys;
      return {
        ok: false,
        code: "INVALID_RESPONSE",
        reason: `plan referenced unknown capabilities: ${keys.join(", ") || "unknown"}`,
      };
    }
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

  let guidanceText = content.trim();
  // The envelope-sibling plan object (validated above) takes precedence; otherwise look for a plan
  // embedded as a fenced ```json block in the guidance text. This is BEST-EFFORT and degrades
  // gracefully (unlike the strict sibling-object path): an invalid embedded plan does NOT fail the
  // whole response — we keep the guidance text, drop the plan, and add a safe warning.
  let workflowPlan: WorkflowPlan | null = planCandidate ?? null;
  if (!workflowPlan) {
    const extracted = extractPlanFromText(guidanceText);
    if (extracted) {
      // Strip the raw JSON block either way — it's redundant with the separate plan surface, and ugly
      // to show when the plan was rejected. Fall back to a neutral lead-in if nothing else remains.
      const stripped = stripSourceBlock(guidanceText, extracted.sourceBlock);
      guidanceText = stripped ?? PLAN_ONLY_FALLBACK_TEXT;
      const validation = validateWorkflowPlan(extracted.plan);
      if (validation.ok) {
        workflowPlan = extracted.plan; // capability-checked → safe to surface (advisory only)
      } else {
        // The model returned a plan it can't actually build (hallucinated capabilities) AND prose that
        // may over-claim the flow is "straightforward / ready". We must NOT let that over-claim stand
        // next to an empty canvas. REPLACE the prose with the specific, actionable reason — e.g. the
        // "where should React read this from?" source question when the missing piece is the TRIGGER —
        // so React is honest about what's still needed. The deterministic shape fallback (route) may
        // still add a clearly-labeled starter skeleton alongside this message.
        guidanceText = summarizeInvalidPlan(validation.invalidSteps).message;
      }
    }
  }

  // HERMES-AGENT-WORKFLOW-EDITOR — a reply may carry a `WorkflowPatch` ({ operations: [...] }) for an
  // EDIT instead of (or alongside) a new-workflow plan. The machine block is ALWAYS stripped from the
  // user-facing text (raw operation JSON must NEVER render in the rail), independent of validity.
  let mutationOperations: readonly PatchOperation[] | undefined;
  let mutationBaseVersion: string | undefined;
  let mutationMalformed = false;
  if (!workflowPlan) {
    const extracted = extractMutationOperationsFromText(guidanceText);
    if (extracted) {
      // 1. Strip the machine block from display ALWAYS. If that empties the prose, fall back to a neutral,
      //    JSON-free lead-in (the route overrides this for an editing turn with a human summary anyway).
      guidanceText = stripSourceBlock(guidanceText, extracted.sourceBlock) ?? PLAN_ONLY_FALLBACK_TEXT;
      // 2. A reply that BOTH proposes operations AND asks the user to choose something is contradictory.
      //    A committed edit never asks a question — so if a question remains in the prose, PREFER the
      //    clarification: drop the operations entirely and surface only the question (no patch, no preview).
      const asksClarification = /\?/.test(guidanceText);
      if (extracted.operations && !asksClarification) {
        mutationOperations = extracted.operations;
        mutationBaseVersion = extracted.baseVersion;
      } else if (!extracted.operations && !asksClarification) {
        // A mutation-shaped block we couldn't turn into a usable patch → let the route say so safely
        // instead of silently leaving the canvas unchanged with leaked JSON.
        mutationMalformed = true;
      }
    }
  }

  const rawUsage = sanitizeUsage(parsed.data.response.usage);
  return {
    ok: true,
    guidanceText,
    source: "hermes-agent",
    workflowPlan,
    ...(mutationOperations ? { mutationOperations } : {}),
    ...(mutationBaseVersion ? { mutationBaseVersion } : {}),
    ...(mutationMalformed ? { mutationMalformed } : {}),
    ...(rawUsage ? { rawUsage } : {}),
    ...(warnings.length ? { warnings } : {}),
  };
}
