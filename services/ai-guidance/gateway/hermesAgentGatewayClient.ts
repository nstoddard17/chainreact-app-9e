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
import type { GuidanceAttemptTelemetry, GuidanceConversationTurn } from "@/contracts/aiGuidance";
import type { EditableWorkflowGraph } from "@/contracts/editableWorkflowGraph";
import { normalizeGatewayResponse, type NormalizedGatewayGuidance } from "./gatewayResponseContract";
import {
  computeBackoffMs,
  decideRetry,
  parseRetryAfterMs,
  type GatewayAttemptFailure,
  type GatewayRetryReason,
  type GatewayRetrySkipReason,
} from "./gatewayRetryPolicy";

/** Minimal injectable HTTP seam — decoupled from DOM fetch typing so tests mock it trivially. */
export interface GatewayHttpResponse {
  readonly ok: boolean;
  readonly status: number;
  /** Optional so existing mocks stay valid; the real `Response` always has it. Read for Retry-After. */
  readonly headers?: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}
export type GatewayFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<GatewayHttpResponse>;

/** Safe per-request retry telemetry. Declared in contracts (see `GuidanceAttemptTelemetry`). */
export type GatewayAttemptTelemetry = GuidanceAttemptTelemetry;

/** The normalized result plus the safe attempt telemetry the route logs/audits. */
export type NormalizedGatewayGuidanceWithTelemetry = NormalizedGatewayGuidance & {
  readonly attemptTelemetry?: GatewayAttemptTelemetry;
};

/** Injectable clock/scheduler/RNG so tests never wait real seconds. */
export interface GatewayRetryDeps {
  readonly now?: () => number;
  /** Resolves "waited" after ms, or "cancelled" as soon as `signal` aborts — whichever comes first. */
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<"waited" | "cancelled">;
  readonly random?: () => number;
}

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

/** Default cancellable sleep — resolves early (as "cancelled") the moment the signal aborts. */
function defaultSleep(ms: number, signal?: AbortSignal): Promise<"waited" | "cancelled"> {
  if (signal?.aborted) return Promise.resolve("cancelled");
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve("waited");
    }, ms);
    function onAbort(): void {
      clearTimeout(timer);
      resolve("cancelled");
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** One attempt's outcome: what to return if we stop here, plus the classified failure (if any). */
interface AttemptResult {
  /** null ⇒ the attempt succeeded. */
  readonly failure: GatewayAttemptFailure | null;
  /** The normalized result to return if this is the final attempt. */
  readonly result: NormalizedGatewayGuidance;
  readonly elapsedMs: number;
}

/**
 * ONE Hermes attempt. Owns its own deadline and abort wiring, and CLASSIFIES its failure for the
 * retry policy without changing any existing typed code (`status_<n>` / `transport_error` /
 * `TIMEOUT` / `INVALID_RESPONSE` are all byte-identical to the pre-retry behavior).
 *
 * Two aborts are possible and must not be conflated: OUR deadline (→ `TIMEOUT`, never retried) and
 * the CALLER going away (→ `CANCELLED`, never retried, never an incident). `timedOut` disambiguates.
 */
async function runGatewayAttempt(input: {
  url: string;
  body: string;
  token: string;
  timeoutMs: number;
  attemptNumber: number;
  requestId: string | null;
  fetchImpl: GatewayFetch;
  externalSignal?: AbortSignal;
  now: () => number;
}): Promise<AttemptResult> {
  const startedAt = input.now();
  const elapsed = (): number => input.now() - startedAt;

  if (input.externalSignal?.aborted) {
    return { failure: { kind: "cancelled" }, result: { ok: false, code: "CANCELLED" }, elapsedMs: elapsed() };
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, input.timeoutMs);
  const onExternalAbort = (): void => controller.abort();
  input.externalSignal?.addEventListener("abort", onExternalAbort, { once: true });

  try {
    const res = await input.fetchImpl(input.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Token lives ONLY here — never in the body, never logged, never echoed.
        authorization: `Bearer ${input.token}`,
        // REACT-AGENT-RETRY-BACKOFF-1 — one logical id across BOTH attempts, so the gateway (and any
        // future dedup on its side) can tell "the same user submission, tried twice" from "two
        // submissions". Opaque uuid + a small integer: no account, user, workflow, or content.
        ...(input.requestId
          ? { "x-chainreact-request-id": input.requestId, "x-chainreact-attempt": String(input.attemptNumber) }
          : {}),
      },
      body: input.body,
      signal: controller.signal,
    });

    if (!res.ok) {
      const retryAfterMs = parseRetryAfterMs(res.headers?.get("retry-after"));
      return {
        failure: { kind: "http_error", status: res.status, retryAfterMs },
        result: { ok: false, code: "PROVIDER_ERROR", reason: `status_${res.status}` },
        elapsedMs: elapsed(),
      };
    }

    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      return {
        failure: { kind: "invalid_response" },
        result: { ok: false, code: "INVALID_RESPONSE", reason: "non-JSON reply" },
        elapsedMs: elapsed(),
      };
    }

    const normalized = normalizeGatewayResponse(parsed);
    // A 2xx that normalizes to a failure is a DETERMINISTIC problem (malformed envelope, provider
    // error inside the body, unusable content). Repeating the identical request repeats it.
    return {
      failure: normalized.ok ? null : { kind: "invalid_response" },
      result: normalized,
      elapsedMs: elapsed(),
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    if (aborted && timedOut) {
      return { failure: { kind: "timeout" }, result: { ok: false, code: "TIMEOUT" }, elapsedMs: elapsed() };
    }
    if (aborted) {
      return { failure: { kind: "cancelled" }, result: { ok: false, code: "CANCELLED" }, elapsedMs: elapsed() };
    }
    // fetch rejected without a response: connection reset, DNS failure, socket interruption.
    return {
      failure: { kind: "network_error" },
      result: { ok: false, code: "PROVIDER_ERROR", reason: "transport_error" },
      elapsedMs: elapsed(),
    };
  } finally {
    clearTimeout(timer);
    input.externalSignal?.removeEventListener("abort", onExternalAbort);
    // Release the socket for a failed/abandoned attempt so a late first response can never arrive
    // and race the retry's result (the caller only ever sees the value returned below).
    controller.abort();
  }
}

/**
 * Full gateway call → STRICT normalized advisory result (HERMES-AGENT-RESPONSE-CONTRACT), with a
 * BOUNDED retry (REACT-AGENT-RETRY-BACKOFF-1). Build the safe prompt → POST → validate/normalize;
 * on a fast, transient failure wait a small jittered backoff and try EXACTLY once more. Never
 * throws; maps every transport/parse failure to a typed code; never logs the token.
 *
 * `config.timeoutMs` is the budget for the WHOLE logical call — both attempts plus the backoff share
 * it, and each attempt's own deadline is whatever remains. So enabling retry can never extend the
 * request past the deadline the route (and `maxDuration`) are built around; in the worst case it
 * redistributes the same budget across two tries.
 */
export async function requestHermesAgentGuidanceNormalized(params: {
  request: WorkflowGuidanceRequest;
  config: HermesAgentGatewayConfig;
  goalText?: string;
  /** Session-scoped recent conversation (HERMES-AGENT-BUILDER-RAIL-CHAT-MODE). Plain text only. */
  recentTurns?: readonly GuidanceConversationTurn[];
  capabilityCatalog?: readonly string[];
  /** REACT-CONFIG-COVERAGE-1 — pre-rendered field-schema lines (public registry metadata only). */
  fieldSchemaLines?: readonly string[];
  /** REACT-AGENT-MULTISTEP-DATA-MAPPING-1 — pre-rendered output lines (what each node produces). */
  outputSchemaLines?: readonly string[];
  /** REACT-AGENT-LATENCY-AND-PROMPT-SIZE-1 — Stage-A compact catalog (replaces the full blocks). */
  compactCapabilityLines?: readonly string[];
  /** Names-only awareness of providers outside the compact subset. */
  otherProvidersLine?: string;
  /** Scope-guarded context (HERMES-AGENT-MEMORY-SCOPE-GUARD). */
  context?: SafeGuidanceContext;
  /** HERMES-AGENT-WORKFLOW-EDITOR-LIVE — the safe editable graph for an EDIT request. */
  editableGraph?: EditableWorkflowGraph;
  fetchImpl?: GatewayFetch;
  /** REACT-AGENT-RETRY-BACKOFF-1 — one logical id for the user submission, shared by both attempts. */
  requestId?: string;
  /** The caller's cancellation signal (the incoming request's). Aborts the fetch AND the backoff. */
  signal?: AbortSignal;
  /** Injected clock/sleep/RNG (tests only — production uses the real ones). */
  retryDeps?: GatewayRetryDeps;
}): Promise<NormalizedGatewayGuidanceWithTelemetry> {
  const prompt = buildGatewayGuidancePrompt({
    request: params.request,
    ...(params.goalText ? { goalText: params.goalText } : {}),
    ...(params.recentTurns && params.recentTurns.length ? { recentTurns: params.recentTurns } : {}),
    ...(params.capabilityCatalog ? { capabilityCatalog: params.capabilityCatalog } : {}),
    ...(params.fieldSchemaLines && params.fieldSchemaLines.length ? { fieldSchemaLines: params.fieldSchemaLines } : {}),
    ...(params.outputSchemaLines && params.outputSchemaLines.length ? { outputSchemaLines: params.outputSchemaLines } : {}),
    ...(params.compactCapabilityLines && params.compactCapabilityLines.length
      ? { compactCapabilityLines: params.compactCapabilityLines }
      : {}),
    ...(params.otherProvidersLine ? { otherProvidersLine: params.otherProvidersLine } : {}),
    ...(params.context ? { context: params.context } : {}),
    ...(params.editableGraph ? { editableGraph: params.editableGraph } : {}),
  });

  const body = JSON.stringify({ prompt });
  const url = `${params.config.gatewayUrl.replace(/\/$/, "")}${GUIDANCE_PATH}`;
  const fetchImpl = params.fetchImpl ?? defaultFetch();
  const now = params.retryDeps?.now ?? Date.now;
  const sleep = params.retryDeps?.sleep ?? defaultSleep;
  const random = params.retryDeps?.random ?? Math.random;
  const requestId = params.requestId ?? null;

  const startedAt = now();
  const deadlineAt = startedAt + params.config.timeoutMs;
  const remaining = (): number => deadlineAt - now();

  let attempts = 0;
  let retryReason: GatewayRetryReason | null = null;
  let retrySkippedReason: GatewayRetrySkipReason | null = null;
  let backoffMs = 0;
  let remainingBudgetMsAtDecision: number | null = null;

  const telemetry = (): GatewayAttemptTelemetry => ({
    requestId,
    attempts,
    retried: attempts > 1,
    retryReason,
    retrySkippedReason,
    backoffMs,
    elapsedMs: now() - startedAt,
    remainingBudgetMsAtDecision,
    // REACT-AGENT-LATENCY-AND-PROMPT-SIZE-1 — safe size counts of the prompt actually sent.
    promptChars: prompt.length,
    estPromptTokens: Math.round(prompt.length / 4),
  });

  // 1 initial attempt + at most 1 retry. The loop bound is the policy constant, not a variable the
  // caller can raise — there is no configuration that makes this unbounded.
  for (;;) {
    attempts += 1;
    const attempt = await runGatewayAttempt({
      url,
      body,
      token: params.config.gatewayToken,
      // Each attempt gets what is LEFT, never a fresh full budget.
      timeoutMs: Math.max(1, remaining()),
      attemptNumber: attempts,
      requestId,
      fetchImpl,
      ...(params.signal ? { externalSignal: params.signal } : {}),
      now,
    });

    if (!attempt.failure) return { ...attempt.result, attemptTelemetry: telemetry() };

    remainingBudgetMsAtDecision = remaining();
    const plannedBackoffMs = computeBackoffMs(random);
    const decision = decideRetry({
      failure: attempt.failure,
      attemptsMade: attempts,
      attemptElapsedMs: attempt.elapsedMs,
      remainingBudgetMs: remainingBudgetMsAtDecision,
      plannedBackoffMs,
    });

    if (!decision.retry) {
      retrySkippedReason = decision.skipReason;
      return { ...attempt.result, attemptTelemetry: telemetry() };
    }

    // Backoff counts against the SAME budget and is cancellable — an aborted request stops here
    // instead of sleeping out its delay and then firing a pointless second request.
    retryReason = decision.reason;
    backoffMs = plannedBackoffMs;
    const waited = await sleep(plannedBackoffMs, params.signal);
    if (waited === "cancelled") {
      retryReason = null;
      retrySkippedReason = "cancelled";
      return { ok: false, code: "CANCELLED", attemptTelemetry: telemetry() };
    }
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
