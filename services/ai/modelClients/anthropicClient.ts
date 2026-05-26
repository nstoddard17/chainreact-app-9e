/**
 * Anthropic model adapter (Slice 4.AI-8C) — the first REAL adapter.
 *
 * Implements the `core/ai` `ModelClient` contract against the Anthropic Messages
 * API using `fetch` (no provider SDK dependency). It resolves the target model
 * from the centralized config (`core/ai/models`), splits the AI-8A prompt into
 * Anthropic's `system` + `messages` shape, enforces a timeout via Abort
 * controller, and maps every provider/network/parse outcome to a typed
 * `ModelResult`.
 *
 * No-leak: the API key lives only in the closure + the `x-api-key` request
 * header. It is NEVER returned, logged, or placed in any `ModelResult`. Provider
 * error bodies are sanitized to a short, capped, key-free summary.
 *
 * No live calls in tests: `fetchImpl` is injectable, so unit tests drive this
 * adapter entirely with a mock fetch.
 *
 * Plan reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §4.1/§9.
 */

import { DEFAULT_MODEL_BUDGET, getModelForFeature, getModelForTier } from "@/core/ai/models";
import type {
  ModelClient,
  ModelFinishReason,
  ModelGenerateInput,
  ModelResult,
} from "@/core/ai/modelTypes";
import type { AnthropicModelClientOptions } from "./types";

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const DEFAULT_ANTHROPIC_VERSION = "2023-06-01";
const MAX_ERROR_SNIPPET = 200;

/**
 * Assistant-message prefill (Slice 4.AI-12C). Seeding the assistant turn with a
 * bare "{" forces the model to begin its completion INSIDE a JSON object — it
 * structurally cannot emit a "Sure, here's the plan:" preamble or a ```json
 * fence, which were the dominant cause of `parse/NOT_JSON`. The Messages API
 * returns ONLY the model's continuation (never the prefill), so the adapter
 * re-attaches it via {@link reattachJsonPrefill} before returning.
 */
const JSON_OBJECT_PREFILL = "{";

interface AnthropicTextBlock {
  readonly type?: string;
  readonly text?: string;
}

interface AnthropicMessageResponse {
  readonly content?: readonly AnthropicTextBlock[];
  readonly stop_reason?: string | null;
  readonly usage?: { readonly input_tokens?: number; readonly output_tokens?: number };
}

function mapStopReason(reason: string | null | undefined): ModelFinishReason {
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
    case "tool_use":
      return "stop";
    case "max_tokens":
      return "length";
    default:
      return "unknown";
  }
}

/** Extract the concatenated text content from an Anthropic message response. */
function extractText(body: AnthropicMessageResponse): string {
  if (!Array.isArray(body.content)) return "";
  return body.content
    .filter((b) => b?.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("");
}

/**
 * Re-attach the JSON prefill so the returned text is a complete object. With
 * prefill, the provider strips the leading "{" from its response, so a real
 * continuation begins mid-object (whitespace or the first `"key"`), never with
 * "{". The guard avoids a double-"{" when a caller (or a mocked provider in
 * tests) already returned a full object — keeping the returned text valid in
 * both shapes without parsing it here.
 */
function reattachJsonPrefill(continuation: string): string {
  return continuation.trimStart().startsWith("{")
    ? continuation
    : JSON_OBJECT_PREFILL + continuation;
}

/**
 * Sanitize a provider error body into a short, key-free snippet. Anthropic
 * errors are `{ error: { type, message } }`; we surface only the type + a capped
 * message, never the raw body wholesale (defense in depth — the API key lives in
 * request headers, never the response, but we stay conservative).
 */
function sanitizeErrorBody(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: { type?: string; message?: string } };
    const type = parsed.error?.type;
    const message = parsed.error?.message;
    const parts = [type, message].filter((p): p is string => typeof p === "string" && p.length > 0);
    if (parts.length > 0) return parts.join(": ").slice(0, MAX_ERROR_SNIPPET);
  } catch {
    /* fall through to a generic, body-free message */
  }
  return "provider error";
}

/** Split the AI-8A messages into Anthropic's separate `system` + turn list. */
function splitMessages(messages: ModelGenerateInput["messages"]): {
  system: string;
  turns: { role: "user" | "assistant"; content: string }[];
} {
  const systemParts: string[] = [];
  const turns: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of messages) {
    if (m.role === "system") systemParts.push(m.content);
    else turns.push({ role: m.role, content: m.content });
  }
  return { system: systemParts.join("\n\n"), turns };
}

export function createAnthropicModelClient(
  options: AnthropicModelClientOptions,
): ModelClient {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_MODEL_BUDGET.timeoutMs;
  const anthropicVersion = options.anthropicVersion ?? DEFAULT_ANTHROPIC_VERSION;

  return {
    async generateStructuredJson(input: ModelGenerateInput): Promise<ModelResult> {
      const model = input.tier
        ? getModelForTier(input.tier)
        : getModelForFeature(input.feature);

      // This adapter only serves Anthropic models. A config that points a tier
      // at another provider fails safely rather than calling the wrong API.
      if (model.provider !== "anthropic") {
        return {
          ok: false,
          modelId: model.id,
          feature: input.feature,
          failureCode: "CONFIGURATION_ERROR",
          message: `Anthropic adapter cannot serve a '${model.provider}' model.`,
        };
      }

      const { system, turns } = splitMessages(input.messages);
      if (turns.length === 0) {
        return {
          ok: false,
          modelId: model.id,
          feature: input.feature,
          failureCode: "INVALID_INPUT",
          message: "No user/assistant messages to send.",
        };
      }

      // Force a JSON-object start via assistant prefill (Slice 4.AI-12C). Only
      // when the conversation already ends on a user turn — appending a second
      // assistant turn after an assistant turn is an illegal Anthropic request,
      // so a future multi-turn caller degrades to prompt-only instead. The
      // planner is always single-shot ([system, user]), so prefill applies.
      const prefilled = turns[turns.length - 1]!.role === "user";
      const requestTurns = prefilled
        ? [...turns, { role: "assistant" as const, content: JSON_OBJECT_PREFILL }]
        : turns;

      const doFetch = options.fetchImpl ?? globalThis.fetch;
      if (typeof doFetch !== "function") {
        return {
          ok: false,
          modelId: model.id,
          feature: input.feature,
          failureCode: "NETWORK_ERROR",
          message: "fetch is not available in this runtime.",
          retryable: false,
        };
      }

      const body = JSON.stringify({
        model: model.id,
        max_tokens: input.maxOutputTokens ?? model.maxOutputTokens,
        ...(system ? { system } : {}),
        messages: requestTurns,
      });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const startedAt = Date.now();
      try {
        const res = await doFetch(`${baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": options.apiKey,
            "anthropic-version": anthropicVersion,
          },
          body,
          signal: controller.signal,
        });
        const latencyMs = Date.now() - startedAt;

        if (!res.ok) {
          const snippet = sanitizeErrorBody(await res.text().catch(() => ""));
          const retryable = res.status === 429 || res.status >= 500;
          return {
            ok: false,
            modelId: model.id,
            feature: input.feature,
            failureCode: res.status === 429 ? "RATE_LIMITED" : "PROVIDER_ERROR",
            message: `Anthropic API error (HTTP ${res.status}): ${snippet}`,
            retryable,
            latencyMs,
          };
        }

        let parsed: AnthropicMessageResponse;
        try {
          parsed = (await res.json()) as AnthropicMessageResponse;
        } catch {
          return {
            ok: false,
            modelId: model.id,
            feature: input.feature,
            failureCode: "INVALID_RESPONSE",
            message: "Anthropic response was not valid JSON.",
            retryable: false,
            latencyMs,
          };
        }

        // Empty-check the raw continuation BEFORE re-attaching the prefill, so a
        // genuinely empty completion is EMPTY_RESPONSE — not a lone "{" that
        // would later mis-report as a parse failure.
        const continuation = extractText(parsed);
        if (continuation.trim() === "") {
          return {
            ok: false,
            modelId: model.id,
            feature: input.feature,
            failureCode: "EMPTY_RESPONSE",
            message: "Anthropic response contained no text content.",
            retryable: true,
            latencyMs,
          };
        }
        const text = prefilled ? reattachJsonPrefill(continuation) : continuation;

        return {
          ok: true,
          modelId: model.id,
          feature: input.feature,
          text,
          finishReason: mapStopReason(parsed.stop_reason),
          ...(parsed.usage
            ? {
                usage: {
                  inputTokens: parsed.usage.input_tokens ?? 0,
                  outputTokens: parsed.usage.output_tokens ?? 0,
                },
              }
            : {}),
          latencyMs,
        };
      } catch (err) {
        const latencyMs = Date.now() - startedAt;
        const aborted = err instanceof Error && err.name === "AbortError";
        return {
          ok: false,
          modelId: model.id,
          feature: input.feature,
          failureCode: aborted ? "TIMEOUT" : "NETWORK_ERROR",
          message: aborted
            ? `Anthropic request timed out after ${timeoutMs}ms.`
            : "Network error calling the Anthropic API.",
          retryable: true,
          latencyMs,
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
