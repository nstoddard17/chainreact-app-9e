/**
 * Nous hosted-Hermes adapter — OpenAI-compatible chat completions (HOSTED-HERMES-GUIDANCE-BRAIN-2).
 *
 * Implements the network seam behind the provider-neutral `WorkflowGuidanceProvider` port, gated
 * by the foundation's flag + config (`createHostedHermesGuidanceProvider`). It POSTs the SAFE,
 * built-from-DTO chat messages to `${config.baseUrl}/chat/completions` (Nous Portal, OpenAI-
 * compatible) with `Authorization: Bearer <key>`, `model`, `max_tokens`, `temperature`, under an
 * AbortController timeout, and defensively maps the reply into a safe `GuidanceResult`.
 *
 * SECRET DISCIPLINE: the API key is read from config and placed ONLY in the Authorization header.
 * It is never logged, never put in a message/body, never returned. The messages are built by the
 * safe-DTO prompt builder, so no node config / secret / id can be in the payload.
 *
 * NOT production-routed: this adapter only runs when `ENABLE_HOSTED_HERMES_GUIDANCE` is true AND
 * HERMES_* is configured AND a caller wires it. `fetchImpl` is injectable so tests exercise the
 * full request/parse path with a mock — NO live network call in tests/CI.
 */

import type { GuidanceResult, WorkflowGuidanceRequest, WorkflowGuidanceResponse, WorkflowGuidanceSuggestion } from "@/contracts/aiGuidance";
import type { WorkflowGuidanceProvider } from "./types";
import type { HermesGuidanceConfig } from "./hermesConfig";
import { createHostedHermesGuidanceProvider, type HermesGuidanceTransport } from "./hostedHermesGuidanceProvider";
import { buildWorkflowGuidancePrompt } from "./buildWorkflowGuidancePrompt";
import { listAllActionMetas, listAllTriggerMetas } from "@/services/discovery/_registry";

/** Minimal injectable HTTP seam — decoupled from DOM fetch typing so tests mock it trivially. */
export interface HermesHttpResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}
export type HermesFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<HermesHttpResponse>;

export interface NousGuidanceDeps {
  /** Defaults to global fetch. Tests inject a mock — no live call in CI. */
  readonly fetchImpl?: HermesFetch;
  /** Capability catalog (provider:type keys) the brain may propose from. Defaults to discovery. */
  readonly capabilityCatalog?: readonly string[];
  /** The user's own goal text (scrubbed by the prompt builder). Optional. */
  readonly goalText?: string;
}

/** Build the public capability catalog (provider:type keys) from the discovery registry. */
export function defaultCapabilityCatalog(): readonly string[] {
  const keys = new Set<string>();
  for (const m of listAllTriggerMetas()) keys.add(`${m.provider}:${m.type}`);
  for (const m of listAllActionMetas()) keys.add(`${m.provider}:${m.type}`);
  return [...keys].sort();
}

function defaultFetch(): HermesFetch {
  return globalThis.fetch as unknown as HermesFetch;
}

/** Map an OpenAI-compatible reply's first message content (expected JSON) into safe suggestions. */
function parseGuidanceResponse(raw: unknown, config: HermesGuidanceConfig): GuidanceResult {
  try {
    const content = (raw as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return { ok: false, code: "INVALID_RESPONSE", reason: "no message content" };
    const parsed = JSON.parse(content) as { suggestions?: unknown };
    const rawSuggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
    const suggestions: WorkflowGuidanceSuggestion[] = rawSuggestions
      .filter((s): s is { title?: unknown; detail?: unknown; suggestedOperationKinds?: unknown } => !!s && typeof s === "object")
      .map((s) => ({
        title: typeof s.title === "string" ? s.title : "",
        detail: typeof s.detail === "string" ? s.detail : "",
        ...(Array.isArray(s.suggestedOperationKinds)
          ? { suggestedOperationKinds: s.suggestedOperationKinds.filter((k): k is string => typeof k === "string") }
          : {}),
      }))
      .filter((s) => s.title.length > 0);
    const response: WorkflowGuidanceResponse = {
      schemaVersion: 1,
      guidanceKind: "workflow_design",
      providerId: "hermes",
      suggestions,
      modelTag: config.model,
    };
    return { ok: true, response };
  } catch {
    return { ok: false, code: "INVALID_RESPONSE", reason: "unparseable model output" };
  }
}

/**
 * Full Nous call: build safe messages → POST OpenAI-compatible → defensive parse. Never throws
 * for a transport/parse failure (maps to a safe `GuidanceResult` code); never logs the key.
 */
export async function requestNousWorkflowGuidance(params: {
  request: WorkflowGuidanceRequest;
  config: HermesGuidanceConfig;
  capabilityCatalog: readonly string[];
  goalText?: string;
  fetchImpl?: HermesFetch;
}): Promise<GuidanceResult> {
  const messages = buildWorkflowGuidancePrompt({
    request: params.request,
    capabilityCatalog: params.capabilityCatalog,
    ...(params.goalText ? { goalText: params.goalText } : {}),
  });

  const body = JSON.stringify({
    model: params.config.model,
    messages,
    max_tokens: params.config.maxOutputTokens,
    temperature: params.config.temperature,
    stream: false,
  });

  const fetchImpl = params.fetchImpl ?? defaultFetch();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.config.timeoutMs);
  try {
    const res = await fetchImpl(`${params.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Key lives ONLY here — never logged, never echoed.
        authorization: `Bearer ${params.config.apiKey}`,
      },
      body,
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, code: "PROVIDER_ERROR", reason: `status_${res.status}` };
    return parseGuidanceResponse(await res.json(), params.config);
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return aborted ? { ok: false, code: "TIMEOUT" } : { ok: false, code: "PROVIDER_ERROR", reason: "transport_error" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The Nous guidance provider, conforming to the neutral port and wrapped in the foundation's
 * flag+config gating. The default catalog is resolved from the discovery registry.
 */
export function createNousHermesGuidanceProvider(deps: NousGuidanceDeps = {}): WorkflowGuidanceProvider {
  const catalog = deps.capabilityCatalog ?? defaultCapabilityCatalog();
  const transport: HermesGuidanceTransport = (request, config) =>
    requestNousWorkflowGuidance({
      request,
      config,
      capabilityCatalog: catalog,
      ...(deps.goalText ? { goalText: deps.goalText } : {}),
      ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    });
  return createHostedHermesGuidanceProvider({ transport });
}
