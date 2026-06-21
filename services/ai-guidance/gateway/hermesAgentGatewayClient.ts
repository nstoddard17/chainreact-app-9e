/**
 * Server-only Hermes Agent GATEWAY client (HERMES-AGENT-PROD-CLIENT).
 *
 * The ONLY outbound path ChainReact uses for Hermes Agent guidance. It POSTs a SAFE prompt to the
 * public, ChainReact-owned Render AI Gateway:
 *
 *   POST ${CHAINREACT_AI_GATEWAY_URL}/api/hermes-agent/guidance
 *   Authorization: Bearer ${CHAINREACT_AI_GATEWAY_TOKEN}
 *   Content-Type: application/json
 *   { "prompt": "<safe guidance prompt>" }
 *
 * The gateway fronts the private Render Hermes Agent + its model vendor. ChainReact never calls the
 * model vendor or the private Hermes Agent directly — there is no hosted-model client here and no
 * direct vendor-model path. Guidance is ADVISORY: this client never mutates, applies, runs,
 * creates, or deletes a workflow. A malformed/unsafe reply fails CLOSED with a typed code.
 *
 * SECRET DISCIPLINE: the gateway token is placed ONLY in the Authorization header — never in the
 * body, never logged, never returned. The body carries only the safe prompt (built from the
 * de-identified DTO + scrubbed goal text). `fetchImpl` is injectable so tests exercise the full
 * request/parse path with a mock — NO live network in tests/CI.
 *
 * SERVER-ONLY: reads server secrets; must never be imported by a browser/client module (test-guarded).
 */

import type {
  GuidanceResult,
  WorkflowGuidanceProvider,
  WorkflowGuidanceRequest,
  WorkflowGuidanceResponse,
} from "../types";
import type { WorkflowPlan, WorkflowPlanStep } from "@/contracts/guidanceSession";
import { WORKFLOW_PLAN_SCHEMA_VERSION } from "@/contracts/guidanceSession";
import { validateWorkflowPlan } from "../validateWorkflowPlan";
import {
  getHermesAgentGatewayConfig,
  isHermesAgentEnabled,
  type HermesAgentGatewayConfig,
} from "./gatewayConfig";
import { buildGatewayGuidancePrompt } from "./buildGatewayGuidancePrompt";

/** Minimal injectable HTTP seam — decoupled from DOM fetch typing so tests mock it trivially. */
export interface GatewayHttpResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}
export type GatewayFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<GatewayHttpResponse>;

export interface HermesAgentGatewayDeps {
  /** Defaults to global fetch. Tests inject a mock — no live call in CI. */
  readonly fetchImpl?: GatewayFetch;
  /** Public capability catalog (provider:type keys) the brain may propose from. Optional. */
  readonly capabilityCatalog?: readonly string[];
  /** The user's own goal text (scrubbed by the prompt builder). Optional. */
  readonly goalText?: string;
}

const GUIDANCE_PATH = "/api/hermes-agent/guidance";

function defaultFetch(): GatewayFetch {
  return globalThis.fetch as unknown as GatewayFetch;
}

/** Pull the first non-empty guidance text from the shapes a gateway might plausibly return. */
function extractGuidanceText(raw: unknown, depth = 0): string | null {
  if (typeof raw === "string") return raw.trim() || null;
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  for (const key of ["guidance", "text", "content", "message", "reply", "answer"]) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  // OpenAI-compatible passthrough, if the gateway forwards that shape.
  const choiceContent = (obj as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content;
  if (typeof choiceContent === "string" && choiceContent.trim()) return choiceContent.trim();
  // The gateway wraps the agent reply under `response` (`{ ok, response: {...} }`). Recurse once.
  if (depth < 2 && "response" in obj) {
    const nested = extractGuidanceText(obj.response, depth + 1);
    if (nested) return nested;
  }
  return null;
}

/** Safe short error code (uppercase/underscore) from the gateway's error envelope, else generic. */
function safeGatewayErrorReason(raw: Record<string, unknown>): string {
  const code = raw.error;
  return typeof code === "string" && /^[A-Z0-9_]{1,40}$/.test(code) ? code : "gateway_error";
}

/** If the reply carries a plan-like object, build a WorkflowPlan for capability validation. */
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
 * Normalize a parsed gateway reply into a safe `GuidanceResult`. Advisory only:
 *   - any plan-like structure is capability-validated; an INVALID plan fails CLOSED,
 *   - prose is returned as a single guidance suggestion (text only),
 *   - no extractable guidance → INVALID_RESPONSE (fail closed).
 */
function normalizeGatewayReply(raw: unknown): GuidanceResult {
  // The gateway's own structured failure envelope (`{ ok: false, error, ... }`) — even on HTTP 2xx
  // — is a provider error, not guidance. Surface only the safe short error code, never nested
  // messages (which could carry downstream detail).
  if (raw && typeof raw === "object" && (raw as { ok?: unknown }).ok === false) {
    return { ok: false, code: "PROVIDER_ERROR", reason: safeGatewayErrorReason(raw as Record<string, unknown>) };
  }

  // Forward-looking: if a plan ever arrives, ChainReact (not the brain) decides if it is usable.
  const plan = extractPlanCandidate(raw);
  if (plan && !validateWorkflowPlan(plan).ok) {
    return { ok: false, code: "INVALID_RESPONSE", reason: "plan referenced unknown capabilities" };
  }

  const text = extractGuidanceText(raw);
  if (!text) return { ok: false, code: "INVALID_RESPONSE", reason: "no guidance text in reply" };

  const response: WorkflowGuidanceResponse = {
    schemaVersion: 1,
    guidanceKind: "workflow_design",
    providerId: "hermes-agent",
    suggestions: [{ title: "Guidance", detail: text }],
    modelTag: "hermes-agent",
  };
  return { ok: true, response };
}

/**
 * Full gateway call: build safe prompt → POST to the public gateway → normalize. Never throws for a
 * transport/parse failure (maps to a safe `GuidanceResult` code); never logs the token.
 */
export async function requestHermesAgentGuidance(params: {
  request: WorkflowGuidanceRequest;
  config: HermesAgentGatewayConfig;
  goalText?: string;
  capabilityCatalog?: readonly string[];
  fetchImpl?: GatewayFetch;
}): Promise<GuidanceResult> {
  const prompt = buildGatewayGuidancePrompt({
    request: params.request,
    ...(params.goalText ? { goalText: params.goalText } : {}),
    ...(params.capabilityCatalog ? { capabilityCatalog: params.capabilityCatalog } : {}),
  });

  const body = JSON.stringify({ prompt });
  const fetchImpl = params.fetchImpl ?? defaultFetch();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.config.timeoutMs);
  try {
    const res = await fetchImpl(`${params.config.gatewayUrl.replace(/\/$/, "")}${GUIDANCE_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Token lives ONLY here — never in the body, never logged, never echoed.
        authorization: `Bearer ${params.config.gatewayToken}`,
      },
      body,
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, code: "PROVIDER_ERROR", reason: `status_${res.status}` };
    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      // Fall back to text() for a non-JSON gateway reply (still advisory prose).
      try {
        parsed = await res.text();
      } catch {
        return { ok: false, code: "INVALID_RESPONSE", reason: "unreadable reply" };
      }
    }
    return normalizeGatewayReply(parsed);
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return aborted ? { ok: false, code: "TIMEOUT" } : { ok: false, code: "PROVIDER_ERROR", reason: "transport_error" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The Hermes Agent gateway provider, conforming to the neutral `WorkflowGuidanceProvider` port and
 * gated by the flag + config. Disabled / unconfigured → safe codes, NO network call. This is an
 * EXPLICITLY-constructed implementation — it is NOT the app-runtime default (callers inject it).
 */
export function createHermesAgentGatewayProvider(deps: HermesAgentGatewayDeps = {}): WorkflowGuidanceProvider {
  return {
    providerId: "hermes-agent",
    async getWorkflowGuidance(request) {
      if (!isHermesAgentEnabled()) return { ok: false, code: "PROVIDER_DISABLED" };
      const config = getHermesAgentGatewayConfig();
      if (!config) return { ok: false, code: "PROVIDER_NOT_CONFIGURED", reason: "missing gateway env" };
      return requestHermesAgentGuidance({
        request,
        config,
        ...(deps.goalText ? { goalText: deps.goalText } : {}),
        ...(deps.capabilityCatalog ? { capabilityCatalog: deps.capabilityCatalog } : {}),
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
      });
    },
  };
}
