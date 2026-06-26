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
import {
  getHermesAgentGatewayConfig,
  isHermesAgentEnabled,
  type HermesAgentGatewayConfig,
} from "./gatewayConfig";
import { buildGatewayGuidancePrompt } from "./buildGatewayGuidancePrompt";
import type { SafeGuidanceContext } from "../guidanceContextPolicy";
import type { GuidanceConversationTurn } from "@/contracts/aiGuidance";
import type { EditableWorkflowGraph } from "@/contracts/editableWorkflowGraph";
import { normalizeGatewayResponse, type NormalizedGatewayGuidance } from "./gatewayResponseContract";

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

/** Map the normalized advisory result onto the neutral `GuidanceResult` port shape. */
function toGuidanceResult(n: NormalizedGatewayGuidance): GuidanceResult {
  if (!n.ok) return { ok: false, code: n.code, ...(n.reason ? { reason: n.reason } : {}) };
  const response: WorkflowGuidanceResponse = {
    schemaVersion: 1,
    guidanceKind: "workflow_design",
    providerId: "hermes-agent",
    suggestions: [{ title: "Guidance", detail: n.guidanceText }],
    modelTag: "hermes-agent",
  };
  return { ok: true, response };
}

/**
 * Full gateway call → STRICT normalized advisory result (HERMES-AGENT-RESPONSE-CONTRACT). Build the
 * safe prompt → POST → validate/normalize via the response contract. Never throws; maps every
 * transport/parse failure to a typed code; never logs the token.
 */
export async function requestHermesAgentGuidanceNormalized(params: {
  request: WorkflowGuidanceRequest;
  config: HermesAgentGatewayConfig;
  goalText?: string;
  /** Session-scoped recent conversation (HERMES-AGENT-BUILDER-RAIL-CHAT-MODE). Plain text only. */
  recentTurns?: readonly GuidanceConversationTurn[];
  capabilityCatalog?: readonly string[];
  /** Scope-guarded context (HERMES-AGENT-MEMORY-SCOPE-GUARD). */
  context?: SafeGuidanceContext;
  /** HERMES-AGENT-WORKFLOW-EDITOR-LIVE — the safe editable graph for an EDIT request. */
  editableGraph?: EditableWorkflowGraph;
  fetchImpl?: GatewayFetch;
}): Promise<NormalizedGatewayGuidance> {
  const prompt = buildGatewayGuidancePrompt({
    request: params.request,
    ...(params.goalText ? { goalText: params.goalText } : {}),
    ...(params.recentTurns && params.recentTurns.length ? { recentTurns: params.recentTurns } : {}),
    ...(params.capabilityCatalog ? { capabilityCatalog: params.capabilityCatalog } : {}),
    ...(params.context ? { context: params.context } : {}),
    ...(params.editableGraph ? { editableGraph: params.editableGraph } : {}),
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
      return { ok: false, code: "INVALID_RESPONSE", reason: "non-JSON reply" };
    }
    return normalizeGatewayResponse(parsed);
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return aborted ? { ok: false, code: "TIMEOUT" } : { ok: false, code: "PROVIDER_ERROR", reason: "transport_error" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Full gateway call → neutral `GuidanceResult` (the `WorkflowGuidanceProvider` port shape). Thin
 * adapter over {@link requestHermesAgentGuidanceNormalized}.
 */
export async function requestHermesAgentGuidance(params: {
  request: WorkflowGuidanceRequest;
  config: HermesAgentGatewayConfig;
  goalText?: string;
  recentTurns?: readonly GuidanceConversationTurn[];
  capabilityCatalog?: readonly string[];
  context?: SafeGuidanceContext;
  fetchImpl?: GatewayFetch;
}): Promise<GuidanceResult> {
  return toGuidanceResult(await requestHermesAgentGuidanceNormalized(params));
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
